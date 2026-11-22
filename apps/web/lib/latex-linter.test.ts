import { describe, expect, it } from "vitest";
import {
  applyAllSafeLintFixes,
  applyLintFix,
  clearLatexLintCache,
  lintLatexFile,
  lintLatexProject,
  validateLatexEditIntegrity,
} from "@/lib/latex-linter";
import { DEFAULT_TEX_CONTENT } from "@/stores/document-store";

describe("latex-linter", () => {
  it("reports zero issues on DEFAULT_TEX_CONTENT", () => {
    const issues = lintLatexFile(DEFAULT_TEX_CONTENT, "document.tex");
    expect(issues).toEqual([]);
  });

  describe("comment and verbatim awareness", () => {
    it("ignores syntax, math, typography, and citation patterns inside comments and verbatim spans", () => {
      const tex = [
        "\\documentclass{article}",
        "\\begin{document}",
        '% Unclosed { and $ and & and # and "quoted" and ... and \\ref{missing}',
        "50\\% discount and escaped \\$10 and \\{braces\\}.",
        '\\verb|unbalanced { and $ and 50% and & and # and "raw"|',
        "\\begin{verbatim}",
        'if (a && b) { $x = "raw" #1 ... }',
        "% not a comment in verbatim",
        "\\end{verbatim}",
        "\\begin{lstlisting}[language=Python]",
        'x = {"a": 1} # comment & more',
        "\\end{lstlisting}",
        "\\begin{minted}{tex}",
        "\\left( unclosed $ and $$",
        "\\end{minted}",
        "\\end{document}",
      ].join("\n");

      const issues = lintLatexFile(tex, "main.tex");
      expect(issues).toEqual([]);
    });

    it("does not enter verbatim when \\begin{verbatim} is inside a comment", () => {
      const tex = [
        "\\begin{document}",
        "% \\begin{verbatim}",
        "This has unescaped & in active prose.",
        "\\end{document}",
      ].join("\n");

      const issues = lintLatexFile(tex, "main.tex");
      expect(issues.some((i) => i.code === "L08")).toBe(true);
    });
  });

  describe("L01: brace balance", () => {
    it("detects unclosed '{' and unexpected '}' while ignoring \\{ and \\}", () => {
      const tex = "Valid \\{ and \\}. Broken {group and extra }}";
      const issues = lintLatexFile(tex, "main.tex").filter(
        (i) => i.code === "L01",
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]?.message).toContain("Unexpected closing brace");

      const unclosed = lintLatexFile(
        "\\textbf{missing close",
        "main.tex",
      ).filter((i) => i.code === "L01");
      expect(unclosed).toHaveLength(1);
      expect(unclosed[0]?.message).toContain("Unclosed opening brace");
    });
  });

  describe("L02: environment balance and quick-fix", () => {
    it("flags unclosed environment before \\end{document} with safe quick-fix", () => {
      const tex = [
        "\\begin{document}",
        "\\begin{itemize}",
        "  \\item One",
        "\\end{document}",
      ].join("\n");

      const issues = lintLatexFile(tex, "main.tex").filter(
        (i) => i.code === "L02",
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]?.line).toBe(2);
      expect(issues[0]?.fix).toBeDefined();

      const fixed = applyLintFix(tex, issues[0]!);
      expect(fixed).toContain("\\end{itemize}");
      expect(
        lintLatexFile(fixed, "main.tex").filter((i) => i.code === "L02"),
      ).toEqual([]);
    });

    it("flags unclosed environment at EOF with safe quick-fix", () => {
      const tex = "\\begin{theorem}\nStatement";
      const issues = lintLatexFile(tex, "sec.tex").filter(
        (i) => i.code === "L02",
      );
      expect(issues).toHaveLength(1);
      const fixed = applyLintFix(tex, issues[0]!);
      expect(fixed).toContain("\\end{theorem}");
      expect(lintLatexFile(fixed, "sec.tex")).toEqual([]);
    });

    it("flags mismatched \\begin / \\end names", () => {
      const tex = "\\begin{itemize}\n\\item A\n\\end{enumerate}";
      const issues = lintLatexFile(tex, "main.tex").filter(
        (i) => i.code === "L02",
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]?.line).toBe(3);
      const fixed = applyLintFix(tex, issues[0]!);
      expect(fixed).toContain("\\end{itemize}");
    });
  });

  describe("L03: math delimiters", () => {
    it("catches $...$ crossing blank lines, unclosed \\[, unmatched \\), and unclosed $$", () => {
      const tex = [
        "\\begin{document}",
        "Price is \\$50 and line break\\\\[6pt]",
        "Next line with $unclosed math",
        "",
        "After blank line.",
        "Broken \\[ display",
        "Extra \\) here.",
        "Unclosed $$ display",
        "\\end{document}",
      ].join("\n");

      const issues = lintLatexFile(tex, "main.tex").filter(
        (i) => i.code === "L03",
      );
      expect(issues.length).toBeGreaterThanOrEqual(4);
      expect(issues.some((i) => i.message.includes("blank-line"))).toBe(true);
      expect(issues.some((i) => i.message.includes("\\["))).toBe(true);
      expect(issues.some((i) => i.message.includes("\\)"))).toBe(true);
      expect(issues.some((i) => i.message.includes("$$"))).toBe(true);
    });

    it("handles \\= escapes, \\$ escapes, adjacent $a$$b$, and \\\\[1em] cleanly", () => {
      const tex = [
        "\\begin{document}",
        "Cost \\$10 and accent \\=a and $a$$b$ and break\\\\[1em]",
        "Inline \\(x + y\\) and display \\[ z = 1 \\].",
        "\\end{document}",
      ].join("\n");

      const issues = lintLatexFile(tex, "main.tex");
      expect(issues).toEqual([]);
    });
  });

  describe("L04: \\left / \\right pairing", () => {
    it("allows \\left. and \\right. and ignores \\leftarrow / \\rightarrow", () => {
      const tex = [
        "\\begin{document}",
        "\\[ f(x) = \\left\\{ \\begin{cases} 1 & x > 0 \\\\ 0 & x \\le 0 \\end{cases} \\right. \\]",
        "$\\left. \\frac{df}{dx} \\right|_{x=0}$ and $A \\leftarrow B \\rightarrow C$.",
        "\\end{document}",
      ].join("\n");

      const issues = lintLatexFile(tex, "main.tex").filter(
        (i) => i.code === "L04",
      );
      expect(issues).toEqual([]);
    });

    it("detects unmatched \\left and unmatched \\right inside math", () => {
      const tex = "$\\left( x + y$ and $\\right]$";
      const issues = lintLatexFile(tex, "main.tex").filter(
        (i) => i.code === "L04",
      );
      expect(issues).toHaveLength(2);
    });
  });

  describe("L05, L06, L07: labels, refs, and citations across project", () => {
    it("detects duplicate labels across files, undefined refs, and undefined cites only when bib exists", () => {
      const files = [
        {
          id: "1",
          path: "main.tex",
          name: "main.tex",
          type: "tex",
          content: [
            "\\begin{document}",
            "\\section{Intro}\\label{sec:intro}",
            "See Section~\\ref{sec:intro}, Theorem~\\ref{thm:missing}, and~\\cref{sec:dup,eq:nope}.",
            "Cited in~\\cite{smith2020} and~\\citep[p.~4]{ghost2024}.",
            "\\end{document}",
          ].join("\n"),
        },
        {
          id: "2",
          path: "sec2.tex",
          name: "sec2.tex",
          type: "tex",
          content: "\\section{Dup}\\label{sec:intro}\\label{sec:dup}\n",
        },
        {
          id: "3",
          path: "refs.bib",
          name: "refs.bib",
          type: "tex",
          content: "@article{smith2020,\n  title={Real Paper},\n}\n",
        },
      ];

      const report = lintLatexProject(files, "main.tex");
      expect(report.activeIssues.some((i) => i.code === "L05")).toBe(true);
      const l06 = report.activeIssues.filter((i) => i.code === "L06");
      expect(l06).toHaveLength(2);
      expect(l06.map((i) => i.message).join(" ")).toContain("thm:missing");
      expect(l06.map((i) => i.message).join(" ")).toContain("eq:nope");

      const l07 = report.activeIssues.filter((i) => i.code === "L07");
      expect(l07).toHaveLength(1);
      expect(l07[0]?.message).toContain("ghost2024");
    });

    it("suppresses L07 when no .bib entries or \\bibitem exist in the project", () => {
      const tex = "\\begin{document}\nSee~\\cite{draftkey}.\n\\end{document}";
      const issues = lintLatexFile(tex, "notes.tex").filter(
        (i) => i.code === "L07",
      );
      expect(issues).toEqual([]);
    });

    it("supports \\bibitem keys in the same file", () => {
      const tex = [
        "\\begin{document}",
        "See~\\cite{knuth84} and~\\cite{missing}.",
        "\\begin{thebibliography}{9}",
        "\\bibitem{knuth84} D. Knuth.",
        "\\end{thebibliography}",
        "\\end{document}",
      ].join("\n");

      const l07 = lintLatexFile(tex, "main.tex").filter(
        (i) => i.code === "L07",
      );
      expect(l07).toHaveLength(1);
      expect(l07[0]?.message).toContain("missing");
    });
  });

  describe("L08 & L09: unescaped &/# and document boundaries", () => {
    it("flags unescaped & and # in prose with safe fixes, skipping tables, align, URLs, and macro defs", () => {
      const tex = [
        "\\newcommand{\\pair}[2]{#1 and #2}",
        "\\begin{document}",
        "A & B problem #1.",
        "Link: \\href{https://example.com?a=1&b=2#top}{Click here}.",
        "\\begin{tabular}{ll} X & Y \\end{tabular}",
        "\\begin{align} x &= 1 \\end{align}",
        "\\end{document}",
      ].join("\n");

      const issues = lintLatexFile(tex, "main.tex").filter(
        (i) => i.code === "L08",
      );
      expect(issues).toHaveLength(2);
      const fixed = applyAllSafeLintFixes(tex, issues);
      expect(fixed).toContain("A \\& B problem \\#1.");
      expect(fixed).toContain("https://example.com?a=1&b=2#top");
      expect(lintLatexFile(fixed, "main.tex")).toEqual([]);
    });

    it("flags missing \\end{document} and trailing content after \\end{document}", () => {
      const missingEnd = "\\begin{document}\nHello";
      const missingIssues = lintLatexFile(missingEnd, "main.tex").filter(
        (i) => i.code === "L09",
      );
      expect(missingIssues).toHaveLength(1);
      const fixed = applyLintFix(missingEnd, missingIssues[0]!);
      expect(fixed).toContain("\\end{document}");

      const trailing =
        "\\begin{document}\nHello\n\\end{document}\nLeftover text";
      const trailingIssues = lintLatexFile(trailing, "main.tex").filter(
        (i) => i.code === "L09",
      );
      expect(trailingIssues).toHaveLength(1);
      expect(trailingIssues[0]?.line).toBe(4);
    });
  });

  describe("W01-W08: typography, math operators, prose, and portability", () => {
    it("applies safe fixes for W01-W07 without corrupting nested edits", () => {
      const tex = [
        "\\documentclass{article}",
        "\\usepackage[colorlinks=true]{hyperref}",
        "\\usepackage{subfigure}",
        '\\newcommand{\\meta}[1]{\\texttt{"#1"}}',
        "\\begin{document}",
        'In preamble skipped; here he said "wait..." in the the paper.',
        'See Theorem \\ref{thm:one} and file "figs/plot.png" and \\texttt{"code"}.',
        "Look at {\\bf bold text} and $$ sin(x) + log(y) $$.",
        "\\label{thm:one}",
        "TODO finish section.",
        "\\end{document}",
      ].join("\n");

      const issues = lintLatexFile(tex, "main.tex");
      const codes = new Set(issues.map((i) => i.code));
      expect(codes.has("W01")).toBe(true);
      expect(codes.has("W02")).toBe(true);
      expect(codes.has("W03")).toBe(true);
      expect(codes.has("W04")).toBe(true);
      expect(codes.has("W05")).toBe(true);
      expect(codes.has("W06")).toBe(true);
      expect(codes.has("W07")).toBe(true);
      expect(codes.has("W08")).toBe(true);

      // File path and \texttt arg quotes must NOT be flagged by W01
      const w01 = issues.filter((i) => i.code === "W01");
      expect(w01).toHaveLength(1);
      expect(w01[0]?.snippet).toContain('"wait..."');

      // W08 should flag hyperref options and obsolete subfigure
      const w08 = issues.filter((i) => i.code === "W08");
      expect(w08).toHaveLength(2);

      // Nested fixes: "wait..." -> ``wait\dots'', $$ sin(x) + log(y) $$ -> \[ \sin(x) + \log(y) \]
      const fixed = applyAllSafeLintFixes(tex, issues);
      expect(fixed).toContain("``wait\\dots''");
      expect(fixed).toContain("in the paper.");
      expect(fixed).toContain("Theorem~\\ref{thm:one}");
      expect(fixed).toContain("\\textbf{bold text}");
      expect(fixed).toContain("\\[ \\sin(x) + \\log(y) \\]");
      expect(fixed).toContain('"figs/plot.png"');
      expect(fixed).toContain('\\texttt{"code"}');
    });

    it("avoids false positives for W05 in \\text{...} and W07 for valid words or separated words", () => {
      const tex = [
        "\\begin{document}",
        "\\[ \\text{max value of sin } x = \\operatorname{ker}(T) + \\sin(x) \\]",
        "She had had enough and knew that that theorem held.",
        "Appendix A a theorem; the $x$ the; the \\verb|y| the.",
        "\\end{document}",
      ].join("\n");

      const issues = lintLatexFile(tex, "main.tex");
      expect(issues.filter((i) => i.code === "W05")).toEqual([]);
      expect(issues.filter((i) => i.code === "W07")).toEqual([]);
    });
  });

  describe("validateLatexEditIntegrity", () => {
    it("detects newly introduced structural errors while ignoring pre-existing ones", () => {
      const clean = "\\begin{document}\n$x + y$\n\\end{document}";
      const broken = "\\begin{document}\n$x + y\n\\end{document}";
      const res = validateLatexEditIntegrity(clean, broken);
      expect(res.ok).toBe(false);
      expect(res.introduced.some((i) => i.code === "L03")).toBe(true);

      const preExisting =
        "\\begin{document}\n{unclosed\n\\alpha\n\\end{document}";
      const editedElsewhere =
        "\\begin{document}\n{unclosed\n\\beta\n\\end{document}";
      const okRes = validateLatexEditIntegrity(preExisting, editedElsewhere);
      expect(okRes.ok).toBe(true);
      expect(okRes.introduced).toEqual([]);
    });
  });

  describe("incremental project lint cache", () => {
    it("invalidates unchanged referencing files when cross-file labels or bib keys change", () => {
      clearLatexLintCache();

      const mainTex = [
        "\\documentclass{article}",
        "\\begin{document}",
        "\\section{Intro}\\label{sec:intro}",
        "See Section~\\ref{sec:methods} and \\cite{doe2025}.",
        "\\end{document}",
      ].join("\n");

      const first = lintLatexProject(
        [
          { path: "main.tex", content: mainTex, type: "tex" },
          { path: "methods.tex", content: "\\section{Methods}", type: "tex" },
          {
            path: "refs.bib",
            content: "@article{other2024, title={Other}, year={2024}}",
            type: "tex",
          },
        ],
        "main.tex",
      );

      expect(first.byFile["main.tex"]?.some((i) => i.code === "L05")).toBe(
        false,
      );
      expect(first.byFile["main.tex"]?.some((i) => i.code === "L06")).toBe(
        true,
      );
      expect(first.byFile["main.tex"]?.some((i) => i.code === "L07")).toBe(
        true,
      );

      const second = lintLatexProject(
        [
          { path: "main.tex", content: mainTex, type: "tex" },
          {
            path: "methods.tex",
            content: "\\section{Methods}\\label{sec:methods}\\label{sec:intro}",
            type: "tex",
          },
          {
            path: "refs.bib",
            content: "@article{doe2025, title={Paper}, year={2025}}",
            type: "tex",
          },
        ],
        "main.tex",
      );

      expect(second.byFile["main.tex"]?.some((i) => i.code === "L05")).toBe(
        true,
      );
      expect(second.byFile["main.tex"]?.some((i) => i.code === "L06")).toBe(
        false,
      );
      expect(second.byFile["main.tex"]?.some((i) => i.code === "L07")).toBe(
        false,
      );

      const third = lintLatexProject(
        [
          { path: "main.tex", content: mainTex, type: "tex" },
          {
            path: "methods.tex",
            content: "\\section{Methods}\\label{sec:methods}\\label{sec:intro}",
            type: "tex",
          },
          {
            path: "refs.bib",
            content: "@article{doe2025, title={Paper}, year={2025}}",
            type: "tex",
          },
        ],
        "main.tex",
      );
      expect(third.byFile["main.tex"]).toEqual(second.byFile["main.tex"]);
    });
  });
});
