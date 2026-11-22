import { describe, expect, it } from "vitest";
import {
  analyzeImportedPackage,
  applySafePackageFixes,
  convertIpynbToLatexPackage,
  convertMarkdownResearchToLatex,
  detectRecommendedCompiler,
  extractLatexTitle,
  isArchiveFileName,
  isResearchPackageFileName,
  parseArxivIdentifier,
  parseArxivReadmeDirectives,
} from "@/lib/package-intelligence";
import type { ProjectFile } from "@/lib/project-files";

describe("package-intelligence", () => {
  it("recognizes multi-extension research archives and ignores synctex.gz", () => {
    expect(isArchiveFileName("paper.tar.gz")).toBe(true);
    expect(isArchiveFileName("paper.tgz")).toBe(true);
    expect(isArchiveFileName("supplement.tar.bz2")).toBe(true);
    expect(isArchiveFileName("bundle.rar")).toBe(true);
    expect(isArchiveFileName("bundle.7z")).toBe(true);
    expect(isArchiveFileName("manuscript.synctex.gz")).toBe(false);
    expect(isResearchPackageFileName("analysis.ipynb")).toBe(true);
    expect(isResearchPackageFileName("report.qmd")).toBe(true);
  });

  it("parses valid arXiv IDs and URLs while rejecting non-arXiv hosts (SSRF prevention)", () => {
    expect(parseArxivIdentifier("2305.12345")).toBe("2305.12345");
    expect(parseArxivIdentifier("arXiv:2305.12345v2")).toBe("2305.12345v2");
    expect(parseArxivIdentifier("https://arxiv.org/abs/2305.12345")).toBe(
      "2305.12345",
    );
    expect(parseArxivIdentifier("https://arxiv.org/pdf/2305.12345v1.pdf")).toBe(
      "2305.12345v1",
    );
    expect(parseArxivIdentifier("hep-th/9901001")).toBe("hep-th/9901001");

    expect(parseArxivIdentifier("https://169.254.169.254/latest")).toBeNull();
    expect(
      parseArxivIdentifier("https://evil.example.com/2305.12345"),
    ).toBeNull();
    expect(parseArxivIdentifier("../../etc/passwd")).toBeNull();
  });

  it("detects compiler from 00README.json, 00README.XXX, magic comments, and packages", () => {
    expect(
      parseArxivReadmeDirectives([
        {
          name: "00README.json",
          path: "00README.json",
          content: JSON.stringify({
            sources: [{ filename: "article_main.tex", usage: "toplevel" }],
            process: { compiler: "xelatex" },
          }),
        },
      ]),
    ).toEqual({ toplevel: "article_main.tex", compiler: "xelatex" });

    expect(
      detectRecommendedCompiler([
        {
          name: "main.tex",
          path: "main.tex",
          content: "% !TEX program = lualatex\n\\documentclass{article}",
        },
      ]),
    ).toBe("lualatex");

    expect(
      detectRecommendedCompiler([
        {
          name: "main.tex",
          path: "main.tex",
          content: "\\documentclass{article}\n\\usepackage{fontspec}",
        },
      ]),
    ).toBe("xelatex");
  });

  it("extracts nested brace titles and converts Jupyter notebooks with embedded PNG figures", () => {
    expect(
      extractLatexTitle(
        "\\title[Short]{\\textbf{Spectral} Convergence\\thanks{NSF Grant}}",
      ),
    ).toBe("Spectral Convergence");

    const sampleIpynb = JSON.stringify({
      metadata: { kernelspec: { language: "python" } },
      cells: [
        {
          cell_type: "markdown",
          source:
            "# Variational Study\nWe evaluate $\\alpha = 0.1$.\n- Item A\n- Item B",
        },
        {
          cell_type: "code",
          source: "import numpy as np\nprint(np.mean([1, 2, 3]))",
          outputs: [
            {
              output_type: "display_data",
              data: {
                "image/png":
                  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
              },
            },
          ],
        },
      ],
    });

    const converted = convertIpynbToLatexPackage(sampleIpynb, "study.ipynb");
    const texFile = converted.files.find((f) => f.path === "study.tex");
    const pngFile = converted.files.find(
      (f) => f.path === "figures/study-fig-1.png",
    );
    const scriptFile = converted.files.find(
      (f) => f.path === "scripts/study.py",
    );

    expect(texFile?.content).toContain("\\title{Variational Study}");
    expect(texFile?.content).toContain(
      "\\includegraphics[width=0.85\\textwidth]{figures/study-fig-1.png}",
    );
    expect(pngFile?.type).toBe("image");
    expect(scriptFile?.content).toContain("import numpy as np");
  });

  it("converts Quarto/Markdown frontmatter & Pandoc citations and audits missing assets + safe lint fixes", () => {
    const qmd = `---
title: Spectral Notes
author: Ada Lovelace
bibliography: refs.bib
---

# Introduction
As shown in [@smith2024; @doe2025], convergence holds with 100% reliability.`;

    const { texFile } = convertMarkdownResearchToLatex(qmd, "notes.qmd");
    expect(texFile.path).toBe("notes.tex");
    expect(texFile.content).toContain("\\cite{smith2024,doe2025}");
    expect(texFile.content).toContain("100\\%");

    const pkgFiles: Omit<ProjectFile, "id">[] = [
      {
        name: "main.tex",
        path: "main.tex",
        type: "tex",
        content: `\\documentclass[journal]{IEEEtran}
\\title{Test Paper}
\\begin{document}
\\input{sections/intro}
\\includegraphics{fig-missing}
Text with unescaped % note.
\\end{document}`,
      },
      {
        name: "custom.sty",
        path: "custom.sty",
        type: "tex",
        content: "% style macro",
      },
    ];

    const report = analyzeImportedPackage(pkgFiles, "fallback");
    expect(report.projectName).toBe("Test Paper");
    expect(report.detectedPublisher?.id).toBe("ieee");
    expect(report.localClassesAndStyles).toEqual(["custom.sty"]);
    expect(report.missingReferences).toContain("sections/intro");
    expect(report.missingReferences).toContain("fig-missing");
    expect(
      report.lintWarningCount + report.lintErrorCount,
    ).toBeGreaterThanOrEqual(0);

    const fixed = applySafePackageFixes(pkgFiles);
    expect(fixed.files.length).toBe(2);
  });
});
