const MAX_REQUEST_MB = 50;
const MAX_BODY_CHARS = 160;

/**
 * Why a compile attempt did not produce a PDF. Decided once, at the API
 * boundary, so the client never inspects message strings.
 */
export type CompileErrorKind =
  | "latex"
  | "service"
  | "network"
  | "aborted"
  | "unknown";

/**
 * Classifies an upstream failure from the compile service.
 *
 * `service` covers a busy or unreachable service; `latex` means the service
 * answered and the document itself failed to compile.
 */
export function classifyUpstreamFailure(input: {
  status: number;
  contentType: string;
  hasLog: boolean;
}): CompileErrorKind {
  if (input.status === 413 || input.status === 503) return "service";
  if (!input.contentType.includes("application/json")) return "service";
  if (input.hasLog) return "latex";
  return "service";
}

/**
 * Turns a failed response from the compile service into a message a person
 * can act on, instead of a generic "Compilation failed".
 */
export function describeUpstreamFailure(
  status: number,
  contentType: string,
  body: string,
): string {
  if (status === 413) {
    return `The project is too large to compile (the limit is ${MAX_REQUEST_MB} MB). Remove or shrink large images and PDFs.`;
  }
  if (status === 503) {
    return "The compile service is busy. Wait a moment and compile again.";
  }

  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(body) as { error?: unknown };
      if (typeof parsed.error === "string" && parsed.error) return parsed.error;
    } catch {
      // fall through to the plain-text description
    }
  }

  const text = body.trim().slice(0, MAX_BODY_CHARS);
  return text
    ? `Compile service returned ${status}: ${text}`
    : `Compile service returned ${status}`;
}
