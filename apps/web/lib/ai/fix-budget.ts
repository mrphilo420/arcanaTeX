import { capOutputTokens, type ModelBudget } from "./request-budget";

/** Largest source excerpt we send, regardless of how big the model is. */
export const MAX_FIX_CONTEXT_CHARS = 16_000;
const MIN_CONTEXT_CHARS = 2_000;
const MAX_OUTPUT_TOKENS = 3_000;
const MIN_OUTPUT_TOKENS = 400;
const RESERVE_RATIO = 0.15;

export interface FixRequestBudget {
  /** Tokens the JSON patch may use. */
  maxOutputTokens: number;
  /** Characters of source excerpt to include. */
  contextChars: number;
  /** Working input limit the two values were derived from. */
  inputLimit: number;
}

/**
 * Sizes an AI repair request so the source excerpt and the JSON patch together
 * fit the model's per-minute and context limits. The chat planner uses the same
 * 85% reserve; without it, a free-tier request can pass our estimate and still
 * be rejected by the provider.
 */
export function fixRequestBudget(budget: ModelBudget): FixRequestBudget {
  const tpmLimit =
    budget.inputTokensPerMinute !== undefined
      ? Math.floor(budget.inputTokensPerMinute * (1 - RESERVE_RATIO))
      : Number.POSITIVE_INFINITY;
  const contextLimit = Math.floor(
    budget.contextWindow * 0.8 - budget.maxOutput,
  );
  const inputLimit = Math.max(1_000, Math.min(tpmLimit, contextLimit));

  const requestedOutput = Math.max(
    MIN_OUTPUT_TOKENS,
    Math.min(MAX_OUTPUT_TOKENS, Math.floor(inputLimit * 0.5), inputLimit - 600),
  );
  const maxOutputTokens = capOutputTokens(budget, requestedOutput);
  const available = Math.max(0, inputLimit - maxOutputTokens - 300);

  return {
    maxOutputTokens,
    contextChars: Math.max(
      MIN_CONTEXT_CHARS,
      Math.min(MAX_FIX_CONTEXT_CHARS, Math.floor(available * 3.5)),
    ),
    inputLimit,
  };
}
