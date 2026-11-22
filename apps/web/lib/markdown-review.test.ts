import { describe, expect, it } from "vitest";
import { markdownReviewToLatex } from "./markdown-review";

describe("markdownReviewToLatex", () => {
  it("wraps a review in a compileable document", () => {
    const latex = markdownReviewToLatex(
      [
        "# Review of Paper",
        "## Overall assessment",
        "This is **good** and uses `\\alpha`.",
        "## Technical findings",
        "- Location: Section 2",
        "- Problem: A&B is 50% of the cases.",
      ].join("\n"),
    );

    expect(latex).toContain("\\documentclass[11pt]{article}");
    expect(latex).toContain("\\begin{document}");
    expect(latex).toContain("\\end{document}");
    expect(latex).toContain("\\section*{Review of Paper}");
    expect(latex).toContain("\\subsection*{Overall assessment}");
    expect(latex).toContain("\\textbf{good}");
    expect(latex).toContain("\\texttt{\\textbackslash{}alpha}");
    expect(latex).toContain("\\begin{itemize}");
    expect(latex).toContain("A\\&B is 50\\% of the cases.");
  });

  it("preserves inline math and escapes prose specials", () => {
    const latex = markdownReviewToLatex(
      "The estimate $\\hat\\beta_1$ has a standard error; p < 0.05 and R&D.",
    );

    expect(latex).toContain("$\\hat\\beta_1$");
    expect(latex).toContain("p < 0.05");
    expect(latex).toContain("R\\&D");
  });

  it("converts a markdown table", () => {
    const latex = markdownReviewToLatex(
      ["| Metric | Value |", "|---|---|", "| A&B | 50% |"].join("\n"),
    );

    expect(latex).toContain("\\begin{tabular}");
    expect(latex).toContain("Metric & Value \\\\");
    expect(latex).toContain("A\\&B & 50\\% \\\\");
  });

  it("keeps fenced code as verbatim", () => {
    const latex = markdownReviewToLatex(
      ["```python", "print('a&b')", "```"].join("\n"),
    );

    expect(latex).toContain("\\begin{verbatim}");
    expect(latex).toContain("print('a&b')");
    expect(latex).toContain("\\end{verbatim}");
  });

  it("handles empty markdown with a title", () => {
    const latex = markdownReviewToLatex("", "Paper review");

    expect(latex).toContain("\\section*{Paper review}");
    expect(latex).toContain("\\end{document}");
  });
});
