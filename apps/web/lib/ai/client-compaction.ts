import { estimateTextTokens } from "./request-budget";

export interface ChatErrorPayload {
  /** Sentence to show in the thread. */
  text: string;
  code?: string;
  /** Working input-token limit for the request that failed. */
  limit?: number;
  /** Total input tokens the failed request would have used. */
  estimated?: number;
  /** Tokens attributed to the last user message alone. */
  messageEstimated?: number;
  messageId?: string;
}

const DEFAULT_MESSAGE = "Check the model configuration and try again.";

/**
 * The transport reports a failed response as an Error whose message is the
 * raw body. Most providers send JSON; some wrap it in "Error: ...". Prefer the
 * JSON `error` field and keep the structured fields for recovery.
 */
export function parseChatErrorPayload(error: unknown): ChatErrorPayload {
  if (!(error instanceof Error)) return { text: DEFAULT_MESSAGE };

  let text = error.message.trim();
  if (text.startsWith("Error: ")) text = text.slice(7);

  const candidates = [text];
  const brace = text.indexOf("{");
  if (brace > 0) candidates.push(text.slice(brace));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const message =
        typeof parsed.error === "string" && parsed.error
          ? parsed.error
          : undefined;
      return {
        text: (message ?? text).slice(0, 600) || DEFAULT_MESSAGE,
        code: typeof parsed.code === "string" ? parsed.code : undefined,
        limit: typeof parsed.limit === "number" ? parsed.limit : undefined,
        estimated:
          typeof parsed.estimated === "number" ? parsed.estimated : undefined,
        messageEstimated:
          typeof parsed.messageEstimated === "number"
            ? parsed.messageEstimated
            : undefined,
        messageId:
          typeof parsed.messageId === "string" ? parsed.messageId : undefined,
      };
    } catch {
      // not JSON; try the next candidate
    }
  }

  return { text: text.slice(0, 600) || DEFAULT_MESSAGE };
}

/**
 * How many tokens the compacted message may use. The failed request already
 * tells us the total and the message's share, so the difference is everything
 * else the retry must carry: system prompt, tool schemas, and any context the
 * planner kept.
 */
export function compactionTargetFor(
  payload: ChatErrorPayload,
  messageText: string,
  fallbackTarget = 4_000,
): number | null {
  if (!payload.limit || payload.limit <= 0) return null;

  const messageEstimated =
    payload.messageEstimated ?? estimateTextTokens(JSON.stringify(messageText));
  const overhead = Math.max(
    0,
    (payload.estimated ?? payload.limit + messageEstimated) - messageEstimated,
  );
  const room = payload.limit - overhead - 300;
  if (room < 500) return null;

  // Keep a fifth of the room unused so estimator drift cannot push the retry
  // back over the limit. Larger targets preserve more of the original.
  return Math.max(500, Math.min(fallbackTarget, Math.floor(room * 0.8)));
}

export type CompactionEvent =
  | {
      type: "progress";
      stage: "splitting";
      chunks: number;
      pass: number;
      maxPasses: number;
    }
  | {
      type: "progress";
      stage: "compacting";
      index: number;
      total: number;
      pass: number;
    }
  | {
      type: "progress";
      stage: "merging";
      parts: number;
      group: number;
      groups: number;
    }
  | {
      type: "progress";
      stage: "waiting";
      seconds: number;
      reason: "rate-limit" | "retry";
    }
  | {
      type: "progress";
      stage: "pass";
      pass: number;
      maxPasses: number;
      estimated: number;
      target: number;
    }
  | {
      type: "done";
      summary: string;
      chunks: number;
      passes: number;
      calls: number;
      estimatedTokens: number;
    }
  | { type: "error"; error: string };

export interface CompactionResult {
  summary: string;
  chunks: number;
  passes: number;
  calls: number;
  estimatedTokens: number;
}

export function describeCompactionEvent(event: CompactionEvent): string {
  switch (event.type) {
    case "progress":
      switch (event.stage) {
        case "splitting":
          return `This message is larger than the model accepts in one request. Compressing it in ${event.chunks} part${
            event.chunks === 1 ? "" : "s"
          } before sending…`;
        case "compacting":
          return `Compressing part ${event.index} of ${event.total}…`;
        case "merging":
          return event.groups > 1
            ? `Merging compressed parts (group ${event.group} of ${event.groups})…`
            : "Merging the compressed parts…";
        case "waiting":
          return `The provider's rate limit is busy. Waiting ${event.seconds}s before continuing…`;
        case "pass":
          return `Still above the target. Compressing again (pass ${event.pass} of ${event.maxPasses})…`;
      }
      break;
    case "done":
      return "Compressed. Sending the message…";
    case "error":
      return event.error;
  }
  return "Compressing the message…";
}

/**
 * Reads the NDJSON progress stream from `/api/compact`. The endpoint starts
 * working immediately; each line is one event so the thread can show where the
 * wait is coming from.
 */
export async function streamCompaction(
  input: {
    text: string;
    model?: string;
    targetTokens?: number;
  },
  onEvent: (event: CompactionEvent) => void,
  signal?: AbortSignal,
): Promise<CompactionResult> {
  const response = await fetch("/api/compact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });

  if (!response.ok || !response.body) {
    let message = `Compaction failed (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error) message = body.error;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: CompactionResult | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;

      const event = JSON.parse(line) as CompactionEvent;
      onEvent(event);

      if (event.type === "error") throw new Error(event.error);
      if (event.type === "done") {
        result = {
          summary: event.summary,
          chunks: event.chunks,
          passes: event.passes,
          calls: event.calls,
          estimatedTokens: event.estimatedTokens,
        };
      }
    }
  }

  if (!result) throw new Error("Compaction ended without a result.");
  return result;
}
