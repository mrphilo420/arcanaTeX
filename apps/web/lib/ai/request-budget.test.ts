import { beforeEach, describe, expect, it } from "vitest";
import type { ToolSet, UIMessage } from "ai";
import {
  capOutputTokens,
  coreTools,
  estimateTextTokens,
  planChatRequest,
  resolveModelBudget,
  toolsForLane,
  type ModelBudget,
} from "./request-budget";
import { resetKnownLimits, setKnownLimit } from "./model-limits";

beforeEach(() => {
  resetKnownLimits();
});

const TIGHT: ModelBudget = {
  contextWindow: 131_072,
  maxOutput: 2_048,
  inputTokensPerMinute: 7_000,
  supportsTools: true,
  supportsCaching: true,
};

function tools(...names: string[]): ToolSet {
  return Object.fromEntries(
    names.map((name) => [
      name,
      { description: name, inputSchema: { type: "object" } },
    ]),
  ) as unknown as ToolSet;
}

function user(text: string): UIMessage {
  return {
    id: `u-${text.slice(0, 6)}`,
    role: "user",
    parts: [{ type: "text", text }],
  };
}

function assistant(text: string): UIMessage {
  return {
    id: `a-${text.slice(0, 6)}`,
    role: "assistant",
    parts: [{ type: "text", text }],
  };
}

describe("toolsForLane", () => {
  const all = tools(
    "read_project_file",
    "inspect_lean_sources",
    "check_lean_candidate",
    "run_python",
  );

  it("keeps Lean tools for a Lean file", () => {
    expect(Object.keys(toolsForLane(all, "lean"))).toContain(
      "check_lean_candidate",
    );
  });

  it("drops Lean tools for a LaTeX file but keeps compute tools", () => {
    const names = Object.keys(toolsForLane(all, "latex"));
    expect(names).not.toContain("check_lean_candidate");
    expect(names).toContain("run_python");
    expect(names).toContain("read_project_file");
  });

  it("drops Lean and compute tools for other file kinds", () => {
    const names = Object.keys(toolsForLane(all, "other"));
    expect(names).not.toContain("check_lean_candidate");
    expect(names).not.toContain("run_python");
    expect(names).toContain("read_project_file");
  });
});

describe("estimateTextTokens", () => {
  it("matches the calibration ratio", () => {
    expect(estimateTextTokens("a".repeat(3500))).toBe(1000);
  });
});

describe("coreTools", () => {
  const all = tools(
    "read_project_file",
    "find_and_replace",
    "insert_latex",
    "inspect_lean_sources",
    "check_lean_candidate",
    "write_project_file",
    "list_project_files",
    "create_tikz_figure",
  );

  it("keeps reading and editing for LaTeX", () => {
    expect(Object.keys(coreTools(all, "latex")).sort()).toEqual([
      "find_and_replace",
      "insert_latex",
      "read_project_file",
    ]);
  });

  it("keeps Lean inspection for Lean files", () => {
    expect(Object.keys(coreTools(all, "lean")).sort()).toEqual([
      "check_lean_candidate",
      "inspect_lean_sources",
      "read_project_file",
    ]);
  });

  it("falls back to the original set when no core tool is present", () => {
    const unusual = tools("something_else");
    expect(coreTools(unusual, "latex")).toBe(unusual);
  });
});

describe("planChatRequest", () => {
  it("attaches editor context to the last user turn, not the system", () => {
    const plan = planChatRequest({
      budget: TIGHT,
      staticSystem: "static prompt",
      volatileContext: "active file: document.tex",
      messages: [user("hello")],
      tools: tools("read_project_file"),
      lane: "latex",
    });

    expect(plan.system).toBe("static prompt");
    const last = plan.messages[plan.messages.length - 1];
    expect(JSON.stringify(last)).toContain("<editor_context>");
    expect(plan.trimmed).toHaveLength(0);
  });

  it("keeps the request under the limit by trimming history", () => {
    const history: UIMessage[] = [];
    for (let i = 0; i < 40; i += 1) {
      history.push(user(`question ${i} ${"x".repeat(400)}`));
      history.push(assistant(`answer ${i} ${"y".repeat(400)}`));
    }
    history.push(user("latest question"));

    const plan = planChatRequest({
      budget: TIGHT,
      staticSystem: "static prompt",
      volatileContext: "ctx",
      messages: history,
      tools: tools("read_project_file"),
      lane: "latex",
    });

    expect(plan.overBudget).toBe(false);
    expect(plan.estimatedInputTokens).toBeLessThanOrEqual(plan.limit);
    expect(plan.trimmed.some((step) => step.startsWith("history"))).toBe(true);
    expect(JSON.stringify(plan.messages.at(-1))).toContain("latest question");
  });

  it("reports over budget when even the last turn cannot fit", () => {
    const plan = planChatRequest({
      budget: { ...TIGHT, inputTokensPerMinute: 500 },
      staticSystem: "s".repeat(20_000),
      volatileContext: "",
      messages: [user("hi")],
      tools: {},
      lane: "latex",
    });

    expect(plan.overBudget).toBe(true);
    expect(plan.headroom).toBeLessThan(0);
  });

  it("reserves ten percent of the per-minute limit", () => {
    const plan = planChatRequest({
      budget: TIGHT,
      staticSystem: "hi",
      volatileContext: "",
      messages: [user("hi")],
      tools: {},
      lane: "latex",
    });

    expect(plan.limit).toBe(5_950);
  });

  it("drops tool schemas when they alone crowd out the message", () => {
    const heavy = tools(
      "read_project_file",
      "find_and_replace",
      "insert_latex",
      "create_tikz_figure",
      "edit_with_python",
      "list_project_files",
      "write_project_file",
    );
    for (const entry of Object.values(heavy)) {
      (entry as { description: string }).description = "x".repeat(8_000);
    }

    const plan = planChatRequest({
      budget: TIGHT,
      staticSystem: "static prompt",
      volatileContext: "",
      messages: [user("y".repeat(30_000))],
      tools: heavy,
      lane: "latex",
    });

    expect(plan.overBudget).toBe(true);
    expect(plan.trimmed).toContain("tools-core");
    expect(Object.keys(plan.tools).sort()).toEqual([
      "find_and_replace",
      "insert_latex",
      "read_project_file",
    ]);
  });
});

describe("resolveModelBudget", () => {
  it("uses the rate-limited budget for curated Groq models", () => {
    expect(
      resolveModelBudget({ providerId: "groq", modelId: "openai/gpt-oss-20b" })
        .inputTokensPerMinute,
    ).toBe(7_000);
  });

  it("falls back to a context-only budget for other providers", () => {
    expect(
      resolveModelBudget({ providerId: "opencode", modelId: "gpt-5.5" })
        .inputTokensPerMinute,
    ).toBeUndefined();
  });

  it("does not apply Groq's limit to a Groq-shaped model id on another provider", () => {
    expect(
      resolveModelBudget({
        providerId: "openai",
        modelId: "openai/gpt-oss-120b",
      }).inputTokensPerMinute,
    ).toBeUndefined();
  });

  it("still applies Groq's limit when the provider is Groq", () => {
    expect(
      resolveModelBudget({
        providerId: "groq",
        modelId: "openai/gpt-oss-120b",
      }).inputTokensPerMinute,
    ).toBe(7_000);
  });
});

describe("output token budgets", () => {
  it("caps qwen to its 1k output-per-minute default", () => {
    const budget = resolveModelBudget({
      providerId: "groq",
      modelId: "qwen/qwen3.8-27b",
      value: "qwen/qwen3.8-27b",
    });

    expect(budget.outputTokensPerMinute).toBe(1_000);
    expect(capOutputTokens(budget, 4_096)).toBe(900);
  });

  it("leaves gpt-oss uncapped until the provider reports a limit", () => {
    const budget = resolveModelBudget({
      providerId: "groq",
      modelId: "openai/gpt-oss-20b",
      value: "openai/gpt-oss-20b",
    });

    expect(budget.outputTokensPerMinute).toBeUndefined();
    expect(capOutputTokens(budget, 2_048)).toBe(2_048);
  });

  it("uses a learned output limit over the model default", () => {
    setKnownLimit("qwen/qwen3.8-27b", 800, "error", "output");

    const budget = resolveModelBudget({
      providerId: "groq",
      modelId: "qwen/qwen3.8-27b",
      value: "qwen/qwen3.8-27b",
    });

    expect(budget.outputTokensPerMinute).toBe(800);
    expect(capOutputTokens(budget, 4_096)).toBe(720);
  });
});
