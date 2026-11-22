import type { ToolSet, UIMessage } from "ai";
import { getKnownLimit, getKnownOutputLimit } from "./model-limits";

/**
 * What a model will accept. `inputTokensPerMinute` is the binding limit on
 * rate-limited providers; `contextWindow` is the binding limit elsewhere.
 */
export interface ModelBudget {
  contextWindow: number;
  maxOutput: number;
  inputTokensPerMinute?: number;
  outputTokensPerMinute?: number;
  supportsTools: boolean;
  supportsCaching: boolean;
}

export type ToolLane = "latex" | "lean" | "other";

const GROQ_FREE_BUDGET: ModelBudget = {
  contextWindow: 131_072,
  maxOutput: 2_048,
  // Observed on the on-demand tier: "Limit 7000". Used as the safe floor for
  // every curated Groq model so a model switch cannot silently re-break it.
  inputTokensPerMinute: 7_000,
  supportsTools: true,
  supportsCaching: true,
};

const DEFAULT_BUDGET: ModelBudget = {
  contextWindow: 128_000,
  maxOutput: 4_096,
  supportsTools: true,
  supportsCaching: false,
};

const GROQ_MODEL_IDS = new Set([
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
]);

/**
 * Groq's free tier has a separate output ceiling on some models. Qwen is the
 * observed case: 1,000 output tokens per minute even though its input budget is
 * larger. Unknown models stay uncapped until an error teaches us the limit.
 */
const GROQ_OUTPUT_LIMITS: Record<string, number> = {
  "qwen/qwen3.8-27b": 1_000,
};

function groqBudget(modelId?: string): ModelBudget {
  return {
    ...GROQ_FREE_BUDGET,
    outputTokensPerMinute: modelId ? GROQ_OUTPUT_LIMITS[modelId] : undefined,
  };
}

export function resolveModelBudget(input: {
  providerId?: string;
  modelId?: string;
  value?: string;
}): ModelBudget {
  const isGroq =
    input.providerId === "groq" ||
    (!input.providerId && !!input.modelId && GROQ_MODEL_IDS.has(input.modelId));
  const fallback = isGroq ? groqBudget(input.modelId) : DEFAULT_BUDGET;

  // A limit the provider actually reported beats any default we ship.
  const learnedInput = getKnownLimit(input.value);
  const learnedOutput = getKnownOutputLimit(input.value);
  if (learnedInput || learnedOutput) {
    return {
      ...fallback,
      inputTokensPerMinute:
        learnedInput?.tokens ?? fallback.inputTokensPerMinute,
      outputTokensPerMinute:
        learnedOutput?.tokens ?? fallback.outputTokensPerMinute,
    };
  }

  return fallback;
}

/**
 * Caps the requested output so a per-minute output ceiling is not exceeded.
 * The 90% factor absorbs the provider's own token counting.
 */
export function capOutputTokens(
  budget: ModelBudget,
  requested: number,
): number {
  const limit = budget.outputTokensPerMinute;
  if (!limit) return requested;
  return Math.max(128, Math.min(requested, Math.floor(limit * 0.9)));
}

/**
 * Character-based estimate. Calibrated against a measured request:
 * 25,093 characters produced 7,022 tokens (3.57 chars/token). Tool schemas are
 * denser than prose, so they get their own ratio.
 */
export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export function estimateToolTokens(tools: ToolSet): number {
  if (!tools || Object.keys(tools).length === 0) return 0;
  try {
    return Math.ceil(JSON.stringify(tools).length / 3.2);
  } catch {
    return 0;
  }
}

const LEAN_TOOLS = new Set([
  "inspect_lean_sources",
  "build_lean_project",
  "search_mathlib",
  "check_lean_candidate",
]);

const COMPUTE_TOOLS = new Set([
  "plot_matplotlib",
  "run_python",
  "run_r",
  "spawn_subagents",
]);

/**
 * Tools a lane cannot use are not sent. A LaTeX request carries no Lean
 * schemas; a Markdown or data file carries neither Lean nor code execution.
 */
export function toolsForLane(tools: ToolSet, lane: ToolLane): ToolSet {
  if (lane === "lean") return tools;
  const blocked =
    lane === "latex" ? LEAN_TOOLS : new Set([...LEAN_TOOLS, ...COMPUTE_TOOLS]);
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => !blocked.has(name)),
  ) as ToolSet;
}

/**
 * When tool schemas alone consume most of a small per-minute budget, the
 * request cannot fit regardless of how short the message is. Keep the tools
 * that read and edit, drop the rest, and let the message through.
 */
export function coreTools(tools: ToolSet, lane: ToolLane): ToolSet {
  const keep = new Set(
    lane === "lean"
      ? ["read_project_file", "inspect_lean_sources", "check_lean_candidate"]
      : lane === "other"
        ? ["read_project_file", "list_project_files", "write_project_file"]
        : [
            "read_project_file",
            "find_and_replace",
            "insert_latex",
            "load_review_context",
            "patch_bibtex",
          ],
  );

  const selected = Object.fromEntries(
    Object.entries(tools).filter(([name]) => keep.has(name)),
  ) as ToolSet;

  // If the client sent an unfamiliar set, do not replace it with nothing.
  return Object.keys(selected).length > 0 ? selected : tools;
}

/** Prepends the live editor context to the last user turn, keeping `system` stable. */
function attachContext(messages: UIMessage[], context: string): UIMessage[] {
  if (!context.trim()) return messages;
  let index = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      index = i;
      break;
    }
  }
  if (index === -1) return messages;

  const block = `<editor_context>\n${context}\n</editor_context>`;
  return messages.map((message, i) => {
    if (i !== index) return message;
    return {
      ...message,
      parts: [{ type: "text", text: block }, ...message.parts],
    } as UIMessage;
  });
}

/** Drops whole turns from the front, never the last user turn or what follows. */
function trimHistory(messages: UIMessage[], keepFrom: number): UIMessage[] {
  if (keepFrom <= 0) return messages;
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      lastUser = i;
      break;
    }
  }
  const floor = Math.max(0, lastUser);
  const cut = Math.min(keepFrom, floor);
  return cut > 0 ? messages.slice(cut) : messages;
}

export interface PlanInput {
  budget: ModelBudget;
  staticSystem: string;
  volatileContext: string;
  messages: UIMessage[];
  tools: ToolSet;
  lane: ToolLane;
}

export interface PlanResult {
  system: string;
  messages: UIMessage[];
  tools: ToolSet;
  estimatedInputTokens: number;
  limit: number;
  headroom: number;
  trimmed: string[];
  overBudget: boolean;
}

/**
 * Target 85% of the binding limit. Observed estimator drift on tool-heavy turns
 * is one to two percent; a ten percent reserve was not enough to absorb it.
 */
const RESERVE_RATIO = 0.15;
const MIN_CONTEXT_CHARS = 1_200;

export function planChatRequest(input: PlanInput): PlanResult {
  const trimmed: string[] = [];

  const tpmLimit =
    input.budget.inputTokensPerMinute !== undefined
      ? Math.floor(input.budget.inputTokensPerMinute * (1 - RESERVE_RATIO))
      : Number.POSITIVE_INFINITY;
  const contextLimit =
    input.budget.contextWindow * 0.8 - input.budget.maxOutput;
  const limit = Math.floor(Math.min(tpmLimit, contextLimit));

  const laneTools = toolsForLane(input.tools, input.lane);
  if (Object.keys(laneTools).length !== Object.keys(input.tools).length) {
    trimmed.push("tool-lane");
  }
  let tools = laneTools;

  let messages = attachContext(input.messages, input.volatileContext);
  const system = input.staticSystem;

  const measure = () =>
    estimateTextTokens(system) +
    estimateToolTokens(tools) +
    messages.reduce(
      (total, message) => total + estimateTextTokens(JSON.stringify(message)),
      0,
    );

  let estimated = measure();

  if (estimated > limit) {
    const before = messages.length;
    messages = trimHistory(messages, 2);
    estimated = measure();
    if (messages.length !== before) trimmed.push("history-oldest");
  }

  if (estimated > limit) {
    const before = messages.length;
    messages = trimHistory(messages, messages.length - 1);
    estimated = measure();
    if (messages.length !== before) trimmed.push("history-all-but-last");
  }

  if (estimated > limit && input.volatileContext.length > MIN_CONTEXT_CHARS) {
    messages = attachContext(
      input.messages,
      input.volatileContext.slice(0, MIN_CONTEXT_CHARS),
    );
    messages = trimHistory(messages, messages.length - 1);
    estimated = measure();
    trimmed.push("editor-context");
  }

  if (estimated > limit) {
    // Last resort: drop the editor context entirely.
    messages = trimHistory(input.messages, input.messages.length - 1);
    estimated = measure();
    trimmed.push("editor-context-dropped");
  }

  if (estimated > limit) {
    // Tool schemas can be the bulk of a small request. Swapping to the core
    // set shrinks the overhead so compaction has room for the message.
    const core = coreTools(input.tools, input.lane);
    if (Object.keys(core).length < Object.keys(tools).length) {
      tools = core;
      estimated = measure();
      trimmed.push("tools-core");
    }
  }

  return {
    system,
    messages,
    tools,
    estimatedInputTokens: estimated,
    limit,
    headroom: limit - estimated,
    trimmed,
    overBudget: estimated > limit,
  };
}
