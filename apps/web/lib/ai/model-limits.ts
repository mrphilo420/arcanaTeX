export type LimitSource = "header" | "error" | "declared";
export type LimitKind = "input" | "output";

export interface KnownLimit {
  tokens: number;
  source: LimitSource;
  at: number;
  kind: LimitKind;
}

/**
 * Per-process cache of the limits providers advertise. Nothing here is
 * guessed: entries come from response headers or from the limit the provider
 * states in a rate-limit error. Input and output ceilings are tracked
 * separately because a model can accept 7k input tokens per minute while
 * allowing only 1k output tokens per minute.
 */
const inputLimits = new Map<string, KnownLimit>();
const outputLimits = new Map<string, KnownLimit>();

function limitMap(kind: LimitKind): Map<string, KnownLimit> {
  return kind === "output" ? outputLimits : inputLimits;
}

export function getKnownLimit(key: string | undefined): KnownLimit | null {
  if (!key) return null;
  return inputLimits.get(key) ?? null;
}

export function getKnownOutputLimit(
  key: string | undefined,
): KnownLimit | null {
  if (!key) return null;
  return outputLimits.get(key) ?? null;
}

export function setKnownLimit(
  key: string | undefined,
  tokens: number,
  source: LimitSource,
  kind: LimitKind = "input",
): void {
  if (!key || !Number.isFinite(tokens) || tokens <= 0) return;
  const map = limitMap(kind);
  const existing = map.get(key);
  // A header is authoritative; an error message is authoritative for the
  // moment it was returned. Never let a smaller stale value win over a header.
  if (existing && existing.source === "header" && source === "error") return;
  map.set(key, {
    tokens: Math.floor(tokens),
    source,
    at: Date.now(),
    kind,
  });
}

/** Groq, OpenAI, and most compatible gateways send these. */
export function recordLimitFromHeaders(
  key: string | undefined,
  headers: Headers | Record<string, string> | undefined,
): void {
  if (!key || !headers) return;

  const read = (name: string): string | null => {
    if (headers instanceof Headers) return headers.get(name);
    const match = Object.entries(headers).find(
      ([header]) => header.toLowerCase() === name,
    );
    return match?.[1] ?? null;
  };

  const store = (raw: string | null, kind: LimitKind) => {
    if (!raw) return;
    const value = Number.parseFloat(raw.replace(/,/g, ""));
    if (Number.isFinite(value)) setKnownLimit(key, value, "header", kind);
  };

  store(
    read("x-ratelimit-limit-input-tokens") ?? read("x-ratelimit-limit-tokens"),
    "input",
  );
  store(read("x-ratelimit-limit-output-tokens"), "output");
}

/**
 * Providers state the ceiling in the rejection itself, for example
 * "input tokens per minute (ITPM): Limit 7000" or
 * "output tokens per minute (OTPM): Limit 1000, Requested 2048".
 * This is how a plan's real limits get discovered.
 */
export function recordLimitFromError(
  key: string | undefined,
  message: string,
): number | null {
  if (!key || !message) return null;

  const outputSpecific = /output tokens per minute|\bOTPM\b/i.test(message);
  const limit =
    /limit\s+(\d+)/i.exec(message) ??
    /(\d+)\s*(?:input|output)?\s*tokens?\s*per\s*minute/i.exec(message);
  if (!limit) return null;

  const tokens = Number.parseInt(limit[1], 10);
  if (!Number.isFinite(tokens) || tokens <= 0) return null;

  setKnownLimit(key, tokens, "error", outputSpecific ? "output" : "input");
  return tokens;
}

export function knownLimits(): Record<string, KnownLimit> {
  return {
    ...Object.fromEntries(
      [...inputLimits].map(([key, value]) => [`input:${key}`, value]),
    ),
    ...Object.fromEntries(
      [...outputLimits].map(([key, value]) => [`output:${key}`, value]),
    ),
  };
}

/** Test seam. */
export function resetKnownLimits(): void {
  inputLimits.clear();
  outputLimits.clear();
}
