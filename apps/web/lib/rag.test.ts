import { describe, expect, it } from "vitest";
import { retrieveProjectContext, splitIntoChunks } from "@/lib/rag";
import type { ProjectFile } from "@/lib/project-files";

const file = (path: string, content: string): ProjectFile => ({
  id: path,
  name: path.split("/").pop() ?? path,
  path,
  type: "tex",
  content,
});

describe("retrieveProjectContext", () => {
  const files = [
    file(
      "SteinGate/Caratheodory/LinearSystems.lean",
      [
        "namespace SteinGate",
        "theorem linear_system_exists (A : Matrix m n) : True := by",
        "  trivial",
        "",
        "theorem quadratic_null_limit (Q : QuadraticForm) : True := by",
        "  exact True.intro",
        "end SteinGate",
      ].join("\n"),
    ),
    file(
      "book/07_foundations_integrability_body.tex",
      "\\chapter{Foundations}\nThe quadratic null limit is discussed here.",
    ),
    {
      ...file("cover.png", "not text"),
      type: "image" as const,
      content: undefined,
    },
  ];

  it("retrieves the most relevant theorem and proof chunk", () => {
    const results = retrieveProjectContext(files, "quadratic_null_limit proof");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toContain("LinearSystems.lean");
    expect(results[0].startLine).toBeGreaterThan(0);
    expect(results[0].content).toContain("quadratic_null_limit");
  });

  it("returns no chunks for an unrelated query", () => {
    expect(retrieveProjectContext(files, "baker campbell hausdorff")).toEqual(
      [],
    );
  });

  it("respects path filters and result limits", () => {
    const results = retrieveProjectContext(files, "foundations quadratic", {
      limit: 1,
      paths: ["book/07_foundations_integrability_body.tex"],
    });

    expect(results).toHaveLength(1);
    expect(results[0].path).toContain("07_foundations");
  });

  it("retrieves section-aware LaTeX chunks cleanly without slicing mid-theorem", () => {
    const longPaper = file(
      "main.tex",
      [
        "\\documentclass{article}",
        "\\title{Spectral Stability}",
        "\\begin{document}",
        "\\maketitle",
        "\\begin{abstract}",
        "We study spectral stability of discrete Laplacians on regular graphs.",
        "\\end{abstract}",
        "\\section{Introduction}",
        "Random walks mix rapidly when the spectral gap is bounded away from zero.",
        "\\section{Cheeger Inequality and Spectral Gap}",
        "\\begin{theorem}[Discrete Cheeger Bound]",
        "\\label{thm:cheeger}",
        "For any finite regular graph $G$, the spectral gap $\\lambda_2$ satisfies",
        "\\[",
        "  \\frac{h(G)^2}{2} \\le \\lambda_2 \\le 2 h(G),",
        "\\]",
        "where $h(G)$ denotes the Cheeger isoperimetric constant.",
        "\\end{theorem}",
        "\\section{Numerical Experiments}",
        "We evaluate Cayley graphs of size $N = 4096$ and report runtime.",
        "\\end{document}",
      ].join("\n"),
    );

    const chunks = splitIntoChunks(longPaper);
    const cheegerChunk = chunks.find((c) =>
      c.content.includes("Discrete Cheeger Bound"),
    );
    expect(cheegerChunk).toBeDefined();
    expect(cheegerChunk?.content).toContain("\\begin{theorem}");
    expect(cheegerChunk?.content).toContain("\\end{theorem}");
    expect(cheegerChunk?.startLine).toBe(10);
    expect(cheegerChunk?.endLine).toBe(18);

    const hits = retrieveProjectContext(
      [longPaper],
      "Discrete Cheeger Bound isoperimetric constant",
      { limit: 2 },
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].content).toContain("\\section{Cheeger Inequality");
    expect(hits[0].content).toContain("\\end{theorem}");
  });

  it("keeps line-window fallback for Python files and short non-section LaTeX notes", () => {
    const pyFile = file(
      "scripts/analyze.py",
      Array.from(
        { length: 120 },
        (_, i) => `def step_${i}(x): return x + ${i}`,
      ).join("\n"),
    );
    const pyChunks = splitIntoChunks(pyFile);
    expect(pyChunks.length).toBeGreaterThan(1);
    expect(pyChunks[0].startLine).toBe(1);
    expect(pyChunks[0].endLine).toBe(90);
    expect(pyChunks[1].startLine).toBe(77);
  });
});
