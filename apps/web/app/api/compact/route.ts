import { generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  COMPACT_SYSTEM_PROMPT,
  compactionPrompt,
  mergePrompt,
  splitForCompaction,
} from "@/lib/ai/compact";
import { resolveChatModel } from "@/lib/ai/llm-providers";
import { recordLimitFromError } from "@/lib/ai/model-limits";
import {
  capOutputTokens,
  estimateTextTokens,
  resolveModelBudget,
} from "@/lib/ai/request-budget";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  text: z.string().min(1).max(400_000),
  model: z.string().optional(),
  targetTokens: z.number().int().positive().optional(),
});

const MAX_CHUNKS = 24;
const MAX_PASSES = 3;
const MAX_CALLS = 40;
const MAX_ATTEMPTS = 4;
const CHUNK_OUTPUT_TOKENS = 1_200;

type CompactionEvent =
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(message: string): number | null {
  const match = /try again in ([\d.]+)\s*(ms|s|m)\b/i.exec(message);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2].toLowerCase();
  const ms =
    unit === "ms" ? value : unit === "m" ? value * 60_000 : value * 1000;
  return Math.min(Math.max(ms, 500), 45_000);
}

function looksRateLimited(message: string): boolean {
  return /rate.?limit|too many requests|\b429\b|tokens? per minute|\bitpm\b|\btpm\b/i.test(
    message,
  );
}

export async function POST(request: Request) {
  let parsed: z.infer<typeof requestSchema>;
  try {
    parsed = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid compaction request." },
      { status: 400 },
    );
  }

  const resolvedModel = await resolveChatModel(parsed.model);
  if (!resolvedModel) {
    return NextResponse.json(
      { error: "No chat model is configured." },
      { status: 503 },
    );
  }

  const budget = resolveModelBudget({
    providerId: resolvedModel.providerId,
    modelId: resolvedModel.modelId,
    value: resolvedModel.value,
  });

  // Same working limit the chat planner uses, so a compacted message that fits
  // here also fits the follow-up chat request.
  const tpmLimit =
    budget.inputTokensPerMinute !== undefined
      ? Math.floor(budget.inputTokensPerMinute * 0.85)
      : Number.POSITIVE_INFINITY;
  const contextLimit = Math.floor(
    budget.contextWindow * 0.8 - budget.maxOutput,
  );
  const limit = Math.min(tpmLimit, contextLimit);

  const targetCeiling = Math.max(500, limit - 1_200);
  const target = Math.max(
    500,
    Math.min(parsed.targetTokens ?? 1_600, targetCeiling),
  );
  const chunkOutput = capOutputTokens(budget, CHUNK_OUTPUT_TOKENS);
  const chunkTokens = Math.max(
    500,
    Math.min(limit - 1_200 - chunkOutput, 4_000),
  );
  const chunkChars = Math.floor(chunkTokens * 3.5);
  const mergeOutput = capOutputTokens(
    budget,
    Math.max(800, Math.min(target, 2_400)),
  );
  // gpt-oss is a reasoning model. Left unbounded, its reasoning tokens use the
  // whole output budget and the text comes back empty. Only send the option to
  // models that understand it; a plain chat model can reject the parameter.
  const lowReasoning =
    resolvedModel.providerId === "groq" ||
    /gpt-oss|gpt-5|(^|\/)o[1-9]/i.test(resolvedModel.modelId);

  const encoder = new TextEncoder();
  const abortController = new AbortController();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: CompactionEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };

      let text = parsed.text;
      let passes = 0;
      let calls = 0;
      let chunkCount = 0;
      let lastError = "";

      const complete = async (
        prompt: string,
        maxOutputTokens: number,
      ): Promise<string | null> => {
        for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt += 1) {
          if (abortController.signal.aborted || calls >= MAX_CALLS) return null;
          calls += 1;

          try {
            const result = await generateText({
              model: resolvedModel.model,
              system: COMPACT_SYSTEM_PROMPT,
              prompt,
              maxOutputTokens,
              temperature: 0,
              abortSignal: abortController.signal,
              ...(lowReasoning
                ? {
                    providerOptions: {
                      openai: { reasoningEffort: "low" },
                    },
                  }
                : {}),
            });
            const note = result.text.trim();
            // An empty completion is useless to the merge step.
            if (note) return note;
            lastError = `the model returned an empty part (${result.finishReason})`;
            console.warn("[compact.empty]", {
              model: resolvedModel.value,
              attempt,
              finishReason: result.finishReason,
            });
          } catch (error) {
            if (abortController.signal.aborted) return null;
            const message = error instanceof Error ? error.message : "";
            lastError = message.slice(0, 300);
            console.warn("[compact.error]", {
              model: resolvedModel.value,
              attempt,
              message: message.slice(0, 400),
            });
            recordLimitFromError(resolvedModel.value, message);

            const stated = retryDelayMs(message);
            const delay = stated ?? (looksRateLimited(message) ? 10_000 : null);
            if (delay === null || attempt === MAX_ATTEMPTS) return null;

            send({
              type: "progress",
              stage: "waiting",
              seconds: Math.ceil(delay / 1000),
              reason: "rate-limit",
            });
            await sleep(delay + 250);
            continue;
          }

          send({
            type: "progress",
            stage: "waiting",
            seconds: 2,
            reason: "retry",
          });
          await sleep(1_250);
        }
        return null;
      };

      const mergeNotes = async (notes: string[]): Promise<string | null> => {
        let level = notes;
        // Notes are merged hierarchically so a very long message never builds
        // one merge prompt that is itself over the limit.
        for (let round = 0; round < 8 && level.length > 1; round += 1) {
          const inputBudget = Math.max(800, limit - mergeOutput - 600);
          const groups: string[][] = [];
          let current: string[] = [];
          let size = 0;

          for (const note of level) {
            const cost = estimateTextTokens(note) + 30;
            if (current.length > 0 && size + cost > inputBudget) {
              groups.push(current);
              current = [];
              size = 0;
            }
            current.push(note);
            size += cost;
          }
          if (current.length > 0) groups.push(current);

          const next: string[] = [];
          for (let index = 0; index < groups.length; index += 1) {
            const group = groups[index];
            if (group.length === 1) {
              next.push(group[0]);
              continue;
            }
            send({
              type: "progress",
              stage: "merging",
              parts: group.length,
              group: index + 1,
              groups: groups.length,
            });
            const merged = await complete(mergePrompt(group), mergeOutput);
            if (!merged) return null;
            next.push(merged);
          }

          // No reduction means the merge prompt could not get smaller.
          if (next.length >= level.length && round > 0) return null;
          level = next;
        }

        return level[0] ?? null;
      };

      try {
        // A summary a little over target still fits the chat request; running
        // another compaction pass for a few tokens would crush the content.
        const acceptable = target + Math.max(150, Math.floor(target * 0.1));

        while (passes < MAX_PASSES) {
          const estimated = estimateTextTokens(text);
          if (estimated <= acceptable) break;

          const chunks = splitForCompaction(text, chunkChars);
          if (chunks.length === 0) break;
          if (chunks.length > MAX_CHUNKS) {
            send({
              type: "error",
              error: `This message needs ${chunks.length} parts to compact, above the ${MAX_CHUNKS}-part limit. Split it into smaller messages, or switch to a provider with a higher limit.`,
            });
            return;
          }

          passes += 1;
          chunkCount = chunks.length;
          send({
            type: "progress",
            stage: "splitting",
            chunks: chunks.length,
            pass: passes,
            maxPasses: MAX_PASSES,
          });

          const notes: string[] = [];
          for (let index = 0; index < chunks.length; index += 1) {
            send({
              type: "progress",
              stage: "compacting",
              index: index + 1,
              total: chunks.length,
              pass: passes,
            });
            const note = await complete(
              compactionPrompt(chunks[index], index + 1, chunks.length),
              chunkOutput,
            );
            if (!note) {
              send({
                type: "error",
                error: `Compaction stopped: the provider rejected a part${
                  lastError ? ` (${lastError})` : ""
                }. Wait for the rate limit to reset, or switch to another provider.`,
              });
              return;
            }
            notes.push(note);
          }

          const merged =
            notes.length === 1 ? notes[0] : await mergeNotes(notes);
          if (!merged) {
            send({
              type: "error",
              error: "Compaction could not merge its parts.",
            });
            return;
          }
          text = merged;

          const next = estimateTextTokens(text);
          if (next > acceptable && passes < MAX_PASSES) {
            send({
              type: "progress",
              stage: "pass",
              pass: passes + 1,
              maxPasses: MAX_PASSES,
              estimated: next,
              target,
            });
          }
        }

        const estimatedTokens = estimateTextTokens(text);
        if (estimatedTokens > acceptable) {
          send({
            type: "error",
            error: `Compaction stopped after ${passes} pass${
              passes === 1 ? "" : "es"
            } at about ${estimatedTokens} tokens (target ${target}). Switch to a provider with a higher limit.`,
          });
          return;
        }

        send({
          type: "done",
          summary: text,
          chunks: chunkCount,
          passes,
          calls,
          estimatedTokens,
        });
      } catch (error) {
        send({
          type: "error",
          error:
            error instanceof Error
              ? `Compaction failed: ${error.message.slice(0, 240)}`
              : "Compaction failed.",
        });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
    cancel() {
      closed = true;
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
