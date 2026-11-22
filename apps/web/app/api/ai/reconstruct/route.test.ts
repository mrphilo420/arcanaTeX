import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveChatModel } = vi.hoisted(() => ({
  mockResolveChatModel: vi.fn(),
}));

vi.mock("@/lib/ai/llm-providers", () => ({
  resolveChatModel: mockResolveChatModel,
}));

import { POST } from "@/app/api/ai/reconstruct/route";

describe("POST /api/ai/reconstruct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveChatModel.mockResolvedValue(null);
  });

  it("returns 400 when rawText is blank or missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/ai/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: "   " }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("reconstructs garbled input cleanly in local-ml mode", async () => {
    const response = await POST(
      new Request("http://localhost/api/ai/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText:
            "Spectral Solvers\n\nAbstract: We study thc rnethod under Î± â‰¤ 1.\n\n1 Intro\nConvergence holds.",
          mode: "local-ml",
          outputMode: "document",
          targetFormat: "article",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.engine).toBe("local-ml");
    expect(data.reconstructedLatex).toContain("\\begin{abstract}");
    expect(data.reconstructedLatex).toContain("the method");
    expect(data.blocks.length).toBeGreaterThanOrEqual(3);
    expect(
      data.lintAfterIssues.filter(
        (i: { severity: string }) => i.severity === "error",
      ),
    ).toHaveLength(0);
  });

  it("falls back gracefully to local-ml in hybrid-llm mode when no LLM provider is configured", async () => {
    const response = await POST(
      new Request("http://localhost/api/ai/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: "Theorem 1: Every pr00f of convergencc holds.",
          mode: "hybrid-llm",
          outputMode: "snippet",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.engine).toBe("local-ml");
    expect(data.fallbackNotice).toContain("local 5-stage statistical ML");
    expect(data.reconstructedLatex).toContain("\\begin{theorem}");
  });
});
