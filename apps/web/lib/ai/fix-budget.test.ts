import { describe, expect, it } from "vitest";
import { fixRequestBudget, MAX_FIX_CONTEXT_CHARS } from "./fix-budget";
import type { ModelBudget } from "./request-budget";

const GROQ: ModelBudget = {
  contextWindow: 131_072,
  maxOutput: 2_048,
  inputTokensPerMinute: 7_000,
  supportsTools: true,
  supportsCaching: true,
};

const LARGE_CONTEXT: ModelBudget = {
  contextWindow: 128_000,
  maxOutput: 4_096,
  supportsTools: true,
  supportsCaching: false,
};

describe("fixRequestBudget", () => {
  it("stays inside a 7k per-minute limit", () => {
    const budget = fixRequestBudget(GROQ);

    expect(budget.inputLimit).toBe(5_950);
    // Estimated input (chars / 3.5) plus output must fit the limit.
    expect(
      budget.contextChars / 3.5 + budget.maxOutputTokens,
    ).toBeLessThanOrEqual(budget.inputLimit);
    expect(budget.maxOutputTokens).toBeLessThanOrEqual(3_000);
  });

  it("caps output for a 1k output-per-minute model", () => {
    const budget = fixRequestBudget({
      ...GROQ,
      outputTokensPerMinute: 1_000,
    });

    expect(budget.maxOutputTokens).toBe(900);
  });

  it("uses the full context allowance on a large model", () => {
    const budget = fixRequestBudget(LARGE_CONTEXT);

    expect(budget.maxOutputTokens).toBe(3_000);
    expect(budget.contextChars).toBe(MAX_FIX_CONTEXT_CHARS);
  });

  it("keeps a usable floor on a very small model", () => {
    const budget = fixRequestBudget({
      contextWindow: 2_000,
      maxOutput: 400,
      supportsTools: false,
      supportsCaching: false,
    });

    expect(budget.inputLimit).toBe(1_200);
    expect(budget.maxOutputTokens).toBe(600);
    expect(budget.contextChars).toBe(2_000);
  });

  it("never returns zero output or zero context", () => {
    const budget = fixRequestBudget({
      contextWindow: 1_000,
      maxOutput: 900,
      supportsTools: false,
      supportsCaching: false,
    });

    expect(budget.maxOutputTokens).toBeGreaterThanOrEqual(400);
    expect(budget.contextChars).toBeGreaterThanOrEqual(2_000);
  });
});
