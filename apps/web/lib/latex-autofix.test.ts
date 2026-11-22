import { describe, expect, it } from "vitest";
import type { CompileDiagnostic } from "@/lib/compile-diagnostics";
import {
  describeAutoFix,
  previewAutoFix,
  runAutoFixes,
} from "@/lib/latex-autofix";
import type { ProjectFile } from "@/lib/project-files";

const texFile = (id: string, content: string): ProjectFile => ({
  id,
  name: `${id}.tex`,
  path: `${id}.tex`,
  type: "tex",
  content,
});

const diagnostic = (
  overrides: Partial<CompileDiagnostic> = {},
): CompileDiagnostic => ({
  id: "d1",
  severity: "error",
  kind: "error",
  title: "title",
  message: "title",
  details: [],
  raw: "",
  data: {},
  ...overrides,
});

const DOC =
  "\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}\n";

describe("runAutoFixes", () => {
  it("skips every diagnostic when there is no LaTeX file", () => {
    const result = runAutoFixes({
      files: [],
      mainFileId: null,
      diagnostics: [diagnostic()],
    });

    expect(result.updates).toEqual([]);
    expect(result.skipped).toEqual([
      { diagnosticId: "d1", reason: "No LaTeX source file found" },
    ]);
  });

  it("does not auto-fix warnings", () => {
    const result = runAutoFixes({
      files: [texFile("main", DOC)],
      mainFileId: "main",
      diagnostics: [diagnostic({ severity: "warning" })],
    });

    expect(result.updates).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/Warnings/);
  });

  it("comments out a missing graphic", () => {
    const content = `${DOC.replace("Hi", "\\includegraphics{fig.png}")}`;
    const result = runAutoFixes({
      files: [texFile("main", content)],
      mainFileId: "main",
      diagnostics: [
        diagnostic({ kind: "missing-graphic", data: { file: "fig.png" } }),
      ],
    });

    expect(result.applied).toEqual(["Commented out 1 missing graphic"]);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].content).not.toMatch(/^\\includegraphics/m);
  });

  it("skips a missing graphic whose path is unknown", () => {
    const result = runAutoFixes({
      files: [texFile("main", DOC)],
      mainFileId: "main",
      diagnostics: [diagnostic({ kind: "missing-graphic" })],
    });

    expect(result.skipped[0].reason).toMatch(/graphic path/);
  });

  it("loads amsthm for an undefined proof environment", () => {
    const result = runAutoFixes({
      files: [texFile("main", DOC)],
      mainFileId: "main",
      diagnostics: [
        diagnostic({
          kind: "undefined-environment",
          data: { environment: "proof" },
        }),
      ],
    });

    expect(result.applied).toEqual(["Loaded amsthm for proof"]);
    expect(result.updates[0].content).toContain("amsthm");
  });

  it("does not reload a package that is already loaded", () => {
    const content = DOC.replace(
      "\\begin{document}",
      "\\usepackage{amsthm}\n\\begin{document}",
    );
    const result = runAutoFixes({
      files: [texFile("main", content)],
      mainFileId: "main",
      diagnostics: [
        diagnostic({
          kind: "undefined-environment",
          data: { environment: "proof" },
        }),
      ],
    });

    expect(result.updates).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/already loaded/);
  });

  it("handles a duplicated diagnostic only once", () => {
    const dup = (id: string) =>
      diagnostic({
        id,
        kind: "undefined-environment",
        data: { environment: "proof" },
      });
    const result = runAutoFixes({
      files: [texFile("main", DOC)],
      mainFileId: "main",
      diagnostics: [dup("a"), dup("b")],
    });

    expect(result.applied).toHaveLength(1);
  });

  it("only processes the requested diagnostic", () => {
    const result = runAutoFixes({
      files: [texFile("main", DOC)],
      mainFileId: "main",
      diagnostics: [
        diagnostic({ id: "a", severity: "warning" }),
        diagnostic({ id: "b", severity: "warning" }),
      ],
      diagnosticId: "b",
    });

    expect(result.skipped.map((s) => s.diagnosticId)).toEqual(["b"]);
  });

  it("falls back to the file containing \\begin{document} as main", () => {
    const result = runAutoFixes({
      files: [texFile("chapter", "text"), texFile("main", DOC)],
      mainFileId: null,
      diagnostics: [
        diagnostic({
          kind: "undefined-environment",
          data: { environment: "proof" },
        }),
      ],
    });

    expect(result.updates.map((u) => u.id)).toEqual(["main"]);
  });
});

describe("describeAutoFix", () => {
  it("describes nothing for warnings", () => {
    expect(describeAutoFix(diagnostic({ severity: "warning" }))).toBeNull();
  });

  it("describes known error kinds", () => {
    expect(describeAutoFix(diagnostic({ kind: "missing-graphic" }))).toBe(
      "Comment out the missing graphic",
    );
    expect(
      describeAutoFix(
        diagnostic({
          kind: "undefined-environment",
          data: { environment: "proof" },
        }),
      ),
    ).toBe("Load amsthm for the proof environment");
  });

  it("returns null for kinds it cannot fix", () => {
    expect(describeAutoFix(diagnostic({ kind: "math-mode" }))).toBeNull();
  });
});

describe("previewAutoFix", () => {
  it("reports the file and a description for the chosen diagnostic", () => {
    const preview = previewAutoFix({
      files: [texFile("main", DOC)],
      mainFileId: "main",
      diagnosticId: "d1",
      diagnostics: [
        diagnostic({
          kind: "undefined-environment",
          data: { environment: "proof" },
        }),
      ],
    });

    expect(preview.description).toBe("Load amsthm for the proof environment");
    expect(preview.updates).toHaveLength(1);
    expect(preview.updates[0].filePath).toBe("main.tex");
  });
});

describe("runaway-argument repair", () => {
  const PREVIEW =
    "{\\orgdiv {Mathematics Department}, \\orgname {Bulacan State";
  const BROKEN =
    "\\affil*[1]{\\orgdiv{Mathematics Department}, \\orgname{Bulacan State University}, \\orgaddress{\\city{Malolos}}";
  const source = (affil: string, rest = "\\maketitle\n") =>
    `\\begin{document}\n\n${affil}\n\n${rest}\\end{document}\n`;
  const runaway = (data: CompileDiagnostic["data"]) =>
    diagnostic({ kind: "runaway-argument", data });

  it("closes the unmatched brace the runaway text points at", () => {
    const result = runAutoFixes({
      files: [texFile("main", source(BROKEN))],
      mainFileId: "main",
      diagnostics: [runaway({ command: "@@coraddress", runaway: PREVIEW })],
    });

    expect(result.applied).toEqual([
      "Closed an unclosed argument on line 3 of main.tex",
    ]);
    expect(result.updates[0].content).toContain(
      "\\city{Malolos}}}% Auto-fix: closed unmatched {",
    );
  });

  it("explains why it skipped when the fix is ambiguous", () => {
    const result = runAutoFixes({
      files: [texFile("main", source(`${BROKEN}\n, more text`))],
      mainFileId: "main",
      diagnostics: [runaway({ runaway: PREVIEW })],
    });

    expect(result.updates).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/ambiguous/i);
  });

  it("skips when the log carried no runaway text", () => {
    const result = runAutoFixes({
      files: [texFile("main", source(BROKEN))],
      mainFileId: "main",
      diagnostics: [runaway({ command: "textbf" })],
    });

    expect(result.updates).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/runaway text/i);
  });

  it("is stable when run again on its own output", () => {
    const first = runAutoFixes({
      files: [texFile("main", source(BROKEN))],
      mainFileId: "main",
      diagnostics: [runaway({ runaway: PREVIEW })],
    });
    const second = runAutoFixes({
      files: [texFile("main", first.updates[0].content)],
      mainFileId: "main",
      diagnostics: [runaway({ runaway: PREVIEW })],
    });

    expect(second.updates).toEqual([]);
  });

  it("describes the fix only when the runaway text is known", () => {
    expect(describeAutoFix(runaway({ runaway: PREVIEW }))).toBe(
      "Close the unclosed argument when its end is unambiguous",
    );
    expect(describeAutoFix(runaway({ command: "textbf" }))).toBeNull();
  });
});

describe("R9 missing \\end{document}", () => {
  const noEnd = (id = "d1") =>
    diagnostic({ id, kind: "fatal", data: { noLegalEnd: true } });
  const body = "\\documentclass{article}\n\\begin{document}\nHi\n";

  it("appends \\end{document} when the source really lacks it", () => {
    const result = runAutoFixes({
      files: [texFile("main", body)],
      mainFileId: "main",
      diagnostics: [noEnd()],
    });

    expect(result.applied).toEqual(["Added the missing \\end{document}"]);
    expect(result.updates[0].content).toBe(
      `${body}% Auto-fix: missing \\end{document}\n\\end{document}\n`,
    );
  });

  it("does nothing when \\end{document} exists: the log is only a symptom", () => {
    const result = runAutoFixes({
      files: [texFile("main", `${body}\\end{document}\n`)],
      mainFileId: "main",
      diagnostics: [noEnd()],
    });

    expect(result.updates).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/already|symptom/i);
  });

  it("does nothing while a runaway argument is pending", () => {
    const result = runAutoFixes({
      files: [texFile("main", body)],
      mainFileId: "main",
      diagnostics: [
        noEnd(),
        diagnostic({
          id: "d2",
          kind: "runaway-argument",
          data: { runaway: "{\\orgdiv {Mathematics Department}" },
        }),
      ],
    });

    expect(result.updates.map((u) => u.content).join("")).not.toContain(
      "\\end{document}",
    );
  });

  it("ignores an \\end{document} that sits in a comment", () => {
    const result = runAutoFixes({
      files: [texFile("main", `${body}% \\end{document}\n`)],
      mainFileId: "main",
      diagnostics: [noEnd()],
    });

    expect(result.applied).toHaveLength(1);
  });

  it("needs a \\begin{document} in the main file", () => {
    const result = runAutoFixes({
      files: [texFile("main", "\\documentclass{article}\n")],
      mainFileId: "main",
      diagnostics: [noEnd()],
    });

    expect(result.updates).toEqual([]);
  });
});

describe("R11 package loaded after \\begin{document}", () => {
  const misplaced = (line: number, lineText = "\\usepackage") =>
    diagnostic({
      kind: "preamble-only",
      fileId: "main",
      line,
      lineText,
      data: { command: "usepackage" },
    });
  const doc = (line: string) =>
    `\\documentclass{article}\n\\begin{document}\n${line}\nText\n\\end{document}\n`;

  it("moves the command into the preamble and comments the original", () => {
    const result = runAutoFixes({
      files: [texFile("main", doc("\\usepackage[utf8]{inputenc}"))],
      mainFileId: "main",
      diagnostics: [misplaced(3)],
    });
    const content = result.updates[0].content;

    expect(result.applied).toEqual(["Moved \\usepackage to the preamble"]);
    expect(content.indexOf("\\usepackage[utf8]{inputenc}")).toBeLessThan(
      content.indexOf("\\begin{document}"),
    );
    expect(content).toContain("% \\usepackage[utf8]{inputenc}");
  });

  it("keeps a multi-package list intact", () => {
    const result = runAutoFixes({
      files: [texFile("main", doc("\\usepackage{amsmath,amssymb}"))],
      mainFileId: "main",
      diagnostics: [misplaced(3)],
    });

    expect(result.updates[0].content).toContain(
      "\\usepackage{amsmath,amssymb}",
    );
  });

  it("refuses a line that holds anything besides the one command", () => {
    const result = runAutoFixes({
      files: [texFile("main", doc("\\usepackage{amsmath} some prose"))],
      mainFileId: "main",
      diagnostics: [misplaced(3)],
    });

    expect(result.updates).toEqual([]);
  });

  it("refuses when the package is already loaded in the preamble", () => {
    const content =
      "\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\\usepackage{amsmath}\n\\end{document}\n";
    const result = runAutoFixes({
      files: [texFile("main", content)],
      mainFileId: "main",
      diagnostics: [misplaced(4)],
    });

    expect(result.updates).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/already loaded/i);
  });

  it("refuses when the diagnostic line is not that command", () => {
    const result = runAutoFixes({
      files: [texFile("main", doc("\\usepackage{amsmath}"))],
      mainFileId: "main",
      diagnostics: [misplaced(4)],
    });

    expect(result.updates).toEqual([]);
  });
});

describe("R12 reserved characters printed literally", () => {
  const at = (
    kind: CompileDiagnostic["kind"],
    line: number,
    lineText: string,
  ) => diagnostic({ kind, fileId: "main", line, lineText });
  const run = (content: string, diag: CompileDiagnostic) =>
    runAutoFixes({
      files: [texFile("main", content)],
      mainFileId: "main",
      diagnostics: [diag],
    });
  const wrap = (body: string) =>
    `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

  // TeX reports an error inside a macro argument at the end of the argument,
  // so the printed context ends at the closing brace, not at the character.
  it("R12a escapes _ inside \\texttt, anchored on its closing brace", () => {
    const result = run(
      wrap("See \\texttt{my_file} here."),
      at("math-mode", 3, "See \\texttt{my_file}"),
    );

    expect(result.updates[0].content).toContain("\\texttt{my\\_file} here.");
    expect(result.updates[0].content).not.toContain("Auto-fix");
  });

  it("R12a escapes every bare _ and ^ in the group", () => {
    const result = run(
      wrap("\\texttt{a_b^c_d}"),
      at("math-mode", 3, "\\texttt{a_b^c_d}"),
    );

    expect(result.updates[0].content).toContain(
      "\\texttt{a\\_b\\textasciicircum{}c\\_d}",
    );
  });

  it("R12a leaves already escaped underscores alone", () => {
    const result = run(
      wrap("\\texttt{a\\_b_c}"),
      at("math-mode", 3, "\\texttt{a\\_b_c}"),
    );

    expect(result.updates[0].content).toContain("\\texttt{a\\_b\\_c}");
  });

  it("R12a refuses other macros, where math may be meant", () => {
    const result = run(
      wrap("\\textbf{my_file}"),
      at("math-mode", 3, "\\textbf{my_file}"),
    );

    expect(result.updates).toEqual([]);
  });

  it("R12a refuses a \\texttt group with nothing to escape", () => {
    const result = run(
      wrap("\\texttt{plain}"),
      at("math-mode", 3, "\\texttt{plain}"),
    );

    expect(result.updates).toEqual([]);
  });

  it("R12d leaves a bare _ in prose to the author", () => {
    const result = run(wrap("the my_var value"), at("math-mode", 3, "the my_"));

    expect(result.updates).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/math|author/i);
  });

  it("R12b escapes & in running text", () => {
    const result = run(wrap("R&D of the lab"), at("misplaced-tab", 3, "R&"));

    expect(result.updates[0].content).toContain("R\\&D of the lab");
  });

  it("R12b leaves & alone inside a table", () => {
    const content = wrap("\\begin{tabular}{ll}\na & b\n\\end{tabular}\nx\n& y");
    const result = run(content, at("misplaced-tab", 7, "& "));

    expect(result.updates).toEqual([]);
  });

  it("R12b leaves & alone inside an alignment-like environment", () => {
    const content = wrap("\\begin{align}\na &= b\n\\end{align}");
    const result = run(content, at("misplaced-tab", 4, "a &"));

    expect(result.updates).toEqual([]);
  });

  it("R12b refuses inside an environment it does not know", () => {
    const content = wrap("\\begin{mytable}\nA&B\n\\end{mytable}");
    const result = run(content, at("misplaced-tab", 4, "A&"));

    expect(result.updates).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/environment/i);
  });

  it("R12c escapes # in running text", () => {
    const result = run(
      wrap("costs #5 each"),
      at("misplaced-hash", 3, "costs #"),
    );

    expect(result.updates[0].content).toContain("costs \\#5 each");
  });

  it("R12c leaves # alone inside a macro definition", () => {
    const content = wrap("\\newcommand{\\foo}[1]{pre #1 post}\n\\foo{x}");
    const result = run(
      content,
      at("misplaced-hash", 3, "\\newcommand{\\foo}[1]{pre #"),
    );

    expect(result.updates).toEqual([]);
  });

  it("refuses when the source line is not what TeX printed", () => {
    const result = run(
      wrap("R&D of the lab"),
      at("misplaced-tab", 3, "Other&"),
    );

    expect(result.updates).toEqual([]);
  });

  it("refuses an already escaped character", () => {
    const result = run(wrap("R\\&D"), at("misplaced-tab", 3, "R\\&"));

    expect(result.updates).toEqual([]);
  });

  it("is stable when run again on its own output", () => {
    const diag = at("misplaced-tab", 3, "R&");
    const first = run(wrap("R&D of the lab"), diag);
    const second = run(first.updates[0].content, diag);

    expect(second.updates).toEqual([]);
  });

  it("needs a known file for the diagnostic", () => {
    const result = runAutoFixes({
      files: [texFile("main", wrap("R&D"))],
      mainFileId: "main",
      diagnostics: [
        diagnostic({ kind: "misplaced-tab", line: 3, lineText: "R&" }),
      ],
    });

    expect(result.updates).toEqual([]);
  });

  it("describes the fixes it can offer", () => {
    expect(describeAutoFix(at("misplaced-tab", 3, "R&"))).toBe(
      "Escape the & as \\&",
    );
    expect(describeAutoFix(at("misplaced-hash", 3, "#"))).toBe(
      "Escape the # as \\#",
    );
    expect(describeAutoFix(at("preamble-only", 3, "\\usepackage"))).toBe(
      "Move the package to the preamble",
    );
  });
});

describe("overfull warning repairs", () => {
  const overfull = (id: string, title: string): CompileDiagnostic =>
    diagnostic({
      id,
      severity: "warning",
      kind: "warning",
      title,
      message: title,
      warningFamily: "overfull-hbox",
      warningPriority: "high",
    });

  it("adds emergency stretch for a single mild overfull hbox", () => {
    const result = runAutoFixes({
      files: [texFile("main", DOC)],
      mainFileId: "main",
      diagnostics: [
        overfull(
          "w1",
          "Overfull \\hbox (6.2pt too wide) in paragraph at lines 3--3",
        ),
      ],
    });

    expect(result.applied).toEqual([
      "Added emergency stretch for overfull lines",
    ]);
    expect(result.updates[0].content).toContain(
      "\\setlength{\\emergencystretch}{2em}",
    );
    expect(result.updates[0].content).not.toContain("\n\\sloppy");
  });

  it("uses \\sloppy when several overfull hboxes are reported", () => {
    const result = runAutoFixes({
      files: [texFile("main", DOC)],
      mainFileId: "main",
      diagnostics: [
        overfull(
          "w1",
          "Overfull \\hbox (6pt too wide) in paragraph at lines 2--3",
        ),
        overfull(
          "w2",
          "Overfull \\hbox (9pt too wide) in paragraph at lines 5--6",
        ),
      ],
    });

    expect(result.applied).toEqual([
      "Enabled \\sloppy for repeated overfull lines",
    ]);
    expect(result.updates[0].content).toContain("\n\\sloppy");
  });

  it("uses \\sloppy for one severe overfull hbox", () => {
    const result = runAutoFixes({
      files: [texFile("main", DOC)],
      mainFileId: "main",
      diagnostics: [
        overfull(
          "w1",
          "Overfull \\hbox (24.5pt too wide) in paragraph at lines 3--3",
        ),
      ],
    });

    expect(result.updates[0].content).toContain("\n\\sloppy");
  });

  it("does not add a second setting when the preamble already has one", () => {
    const content =
      "\\documentclass{article}\n\\setlength{\\emergencystretch}{2em}\n\\begin{document}\nHi\n\\end{document}\n";
    const result = runAutoFixes({
      files: [texFile("main", content)],
      mainFileId: "main",
      diagnostics: [
        overfull(
          "w1",
          "Overfull \\hbox (6pt too wide) in paragraph at lines 4--4",
        ),
      ],
    });

    expect(result.updates).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/already has/);
  });

  it("skips underfull warnings even when they are in the target list", () => {
    const result = runAutoFixes({
      files: [texFile("main", DOC)],
      mainFileId: "main",
      diagnostics: [
        diagnostic({
          id: "w1",
          severity: "warning",
          kind: "warning",
          title: "Underfull \\hbox (badness 10000) in paragraph at lines 3--3",
          warningFamily: "underfull-hbox",
          warningPriority: "low",
        }),
      ],
    });

    expect(result.updates).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/not auto-fixed/);
  });

  it("describes the overfull repair", () => {
    expect(
      describeAutoFix(
        overfull(
          "w1",
          "Overfull \\hbox (6pt too wide) in paragraph at lines 3--3",
        ),
      ),
    ).toBe("Add emergency stretch for the overfull line");
  });
});

describe("active-text awareness and deterministic rule guards", () => {
  const wrap = (body: string, preamble = "") =>
    `\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`;

  describe("active-text package detection", () => {
    it("ignores commented % \\usepackage{amsmath} and still adds it", () => {
      const content = wrap(
        "\\begin{align}a &= b\\end{align}",
        "% \\usepackage{amsmath}\n",
      );
      const result = runAutoFixes({
        files: [texFile("main", content)],
        mainFileId: "main",
        diagnostics: [
          diagnostic({
            kind: "undefined-environment",
            data: { environment: "align" },
          }),
        ],
      });

      expect(result.applied).toEqual(["Loaded amsmath for align"]);
      expect(result.updates[0].content).toContain("\n\\usepackage{amsmath}\n");
    });

    it("recognizes \\RequirePackage{amsmath} as already loaded", () => {
      const content = wrap(
        "\\begin{align}a &= b\\end{align}",
        "\\RequirePackage[fleqn]{amsmath,amssymb}\n",
      );
      const result = runAutoFixes({
        files: [texFile("main", content)],
        mainFileId: "main",
        diagnostics: [
          diagnostic({
            kind: "undefined-environment",
            data: { environment: "align" },
          }),
        ],
      });

      expect(result.updates).toEqual([]);
      expect(result.skipped[0].reason).toMatch(/already loaded/);
    });
  });

  describe("R1 missing-graphic guards", () => {
    it("skips commented \\includegraphics matches", () => {
      const content = wrap("% \\includegraphics{fig.png}");
      const result = runAutoFixes({
        files: [texFile("main", content)],
        mainFileId: "main",
        diagnostics: [
          diagnostic({ kind: "missing-graphic", data: { file: "fig.png" } }),
        ],
      });

      expect(result.updates).toEqual([]);
    });

    it("skips multiline \\includegraphics commands", () => {
      const content = wrap(
        "\\includegraphics[\n  width=0.5\\linewidth\n]{fig.png}",
      );
      const result = runAutoFixes({
        files: [texFile("main", content)],
        mainFileId: "main",
        diagnostics: [
          diagnostic({ kind: "missing-graphic", data: { file: "fig.png" } }),
        ],
      });

      expect(result.updates).toEqual([]);
    });

    it("skips \\includegraphics sharing a line with active prose before or after", () => {
      const proseBefore = wrap("See \\includegraphics{fig.png}");
      const proseAfter = wrap("\\includegraphics{fig.png} shown above.");

      expect(
        runAutoFixes({
          files: [texFile("main", proseBefore)],
          mainFileId: "main",
          diagnostics: [
            diagnostic({ kind: "missing-graphic", data: { file: "fig.png" } }),
          ],
        }).updates,
      ).toEqual([]);

      expect(
        runAutoFixes({
          files: [texFile("main", proseAfter)],
          mainFileId: "main",
          diagnostics: [
            diagnostic({ kind: "missing-graphic", data: { file: "fig.png" } }),
          ],
        }).updates,
      ).toEqual([]);
    });

    it("comments out standalone \\includegraphics with trailing comment and stays idempotent", () => {
      const content = wrap("  \\includegraphics{fig.png} % missing");
      const diag = diagnostic({
        kind: "missing-graphic",
        data: { file: "fig.png" },
      });
      const first = runAutoFixes({
        files: [texFile("main", content)],
        mainFileId: "main",
        diagnostics: [diag],
      });

      expect(first.applied).toEqual(["Commented out 1 missing graphic"]);
      expect(first.updates[0].content).toContain(
        "% Auto-fix: missing graphic fig.png\n%   \\includegraphics{fig.png} % missing",
      );

      const second = runAutoFixes({
        files: [texFile("main", first.updates[0].content)],
        mainFileId: "main",
        diagnostics: [diag],
      });
      expect(second.updates).toEqual([]);

      const withMarkerAbove = wrap(
        "% Auto-fix: missing graphic fig.png\n\\includegraphics{fig.png}",
      );
      expect(
        runAutoFixes({
          files: [texFile("main", withMarkerAbove)],
          mainFileId: "main",
          diagnostics: [diag],
        }).updates,
      ).toEqual([]);
    });
  });

  describe("R2b undefined-environment guards", () => {
    it("defines theorem-like environments (including starred) only", () => {
      const result = runAutoFixes({
        files: [texFile("main", DOC)],
        mainFileId: "main",
        diagnostics: [
          diagnostic({
            kind: "undefined-environment",
            data: { environment: "lemma*" },
          }),
        ],
      });

      expect(result.applied).toEqual(["Defined environment lemma*"]);
      expect(result.updates[0].content).toContain("\\usepackage{amsthm}");
      expect(result.updates[0].content).toContain(
        "\\newtheorem*{lemma}{Lemma}",
      );
    });

    it("refuses arbitrary unknown environments instead of emitting \\newtheorem", () => {
      for (const environment of ["foo", "foo*", "custombox"]) {
        const result = runAutoFixes({
          files: [texFile("main", DOC)],
          mainFileId: "main",
          diagnostics: [
            diagnostic({
              kind: "undefined-environment",
              data: { environment },
            }),
          ],
        });

        expect(result.updates).toEqual([]);
        expect(result.skipped).toHaveLength(1);
        expect(
          describeAutoFix(
            diagnostic({
              kind: "undefined-environment",
              data: { environment },
            }),
          ),
        ).toBeNull();
      }
      expect(
        describeAutoFix(
          diagnostic({
            kind: "undefined-environment",
            data: { environment: "theorem" },
          }),
        ),
      ).toBe("Define the theorem environment");
    });

    it("ignores commented \\newtheorem in preamble and respects active ones", () => {
      const commentedPreamble = wrap(
        "\\begin{theorem}A\\end{theorem}",
        "% \\newtheorem{theorem}{Theorem}\n",
      );
      const fixed = runAutoFixes({
        files: [texFile("main", commentedPreamble)],
        mainFileId: "main",
        diagnostics: [
          diagnostic({
            kind: "undefined-environment",
            data: { environment: "theorem" },
          }),
        ],
      });
      expect(fixed.applied).toEqual(["Defined environment theorem"]);

      const activePreamble = wrap(
        "\\begin{theorem}A\\end{theorem}",
        "\\newtheorem{theorem}{Thm}\n",
      );
      const skipped = runAutoFixes({
        files: [texFile("main", activePreamble)],
        mainFileId: "main",
        diagnostics: [
          diagnostic({
            kind: "undefined-environment",
            data: { environment: "theorem" },
          }),
        ],
      });
      expect(skipped.updates).toEqual([]);
    });
  });

  describe("R3 environment-mismatch guards", () => {
    it("skips files with active verbatim, listing, inline verb, or TeX conditionals", () => {
      const unsafeBodies = [
        "\\begin{verbatim}\n\\begin{itemize}\n\\end{verbatim}\n\\begin{center}\nx",
        "\\begin{verbatim*}\n\\end{verbatim*}\n\\begin{center}\nx",
        "\\begin{lstlisting}\n\\end{lstlisting}\n\\begin{center}\nx",
        "\\begin{minted}{tex}\n\\end{minted}\n\\begin{center}\nx",
        "Use \\verb|\\begin{itemize}| here.\n\\begin{center}\nx",
        "Use \\lstinline|\\begin{itemize}| here.\n\\begin{center}\nx",
        "Use \\mintinline{tex}|\\begin{itemize}| here.\n\\begin{center}\nx",
        "\\iffalse\n\\begin{itemize}\n\\fi\n\\begin{center}\nx",
        "\\iftrue a \\else b \\fi\n\\begin{center}\nx",
        "\\unless\\ifx\\a\\b\n\\fi\n\\begin{center}\nx",
      ];

      for (const body of unsafeBodies) {
        const result = runAutoFixes({
          files: [texFile("main", wrap(body))],
          mainFileId: "main",
          diagnostics: [diagnostic({ kind: "environment-mismatch" })],
        });
        expect(result.updates).toEqual([]);
      }
    });

    it("ignores commented unsafe tokens and allows math \\iff when balancing", () => {
      const content = wrap(
        "% \\begin{verbatim} \\iffalse \\verb|x|\n\\begin{center}\nA \\iff B",
      );
      const result = runAutoFixes({
        files: [texFile("main", content)],
        mainFileId: "main",
        diagnostics: [diagnostic({ kind: "environment-mismatch" })],
      });

      expect(result.applied).toEqual(["Balanced 1 environment block"]);
      expect(result.updates[0].content).toContain(
        "\\end{center}\n\\end{document}",
      );
    });
  });

  describe("R4 missing-package guards", () => {
    it("ignores commented % \\usepackage{nonexistent}", () => {
      const content = wrap("Hi", "% \\usepackage{nonexistent}\n");
      const result = runAutoFixes({
        files: [texFile("main", content)],
        mainFileId: "main",
        diagnostics: [
          diagnostic({
            kind: "missing-package",
            data: { package: "nonexistent" },
          }),
        ],
      });

      expect(result.updates).toEqual([]);
    });
  });

  describe("R5 undefined-command local definition guards", () => {
    it("skips adding a package when the command is actively defined locally in any file", () => {
      const definitions = [
        "\\newcommand{\\qty}[1]{#1}",
        "\\newcommand*{\\qty}[1]{#1}",
        "\\renewcommand{\\qty}[1]{#1}",
        "\\renewcommand*{\\qty}[1]{#1}",
        "\\providecommand{\\qty}[1]{#1}",
        "\\providecommand*{\\qty}[1]{#1}",
        "\\DeclareMathOperator{\\qty}{qty}",
        "\\DeclareMathOperator*{\\qty}{qty}",
        "\\def\\qty#1{#1}",
        "\\let\\qty\\relax",
      ];

      for (const defLine of definitions) {
        const result = runAutoFixes({
          files: [
            texFile("main", wrap("\\qty{5}")),
            texFile("macros", defLine),
          ],
          mainFileId: "main",
          diagnostics: [
            diagnostic({
              kind: "undefined-command",
              data: { command: "qty" },
            }),
          ],
        });

        expect(result.updates).toEqual([]);
        expect(result.skipped[0].reason).toMatch(/defined locally/i);
      }
    });

    it("ignores commented local definitions and non-matching prefixes", () => {
      const content = wrap(
        "\\qty{5}",
        "% \\newcommand{\\qty}[1]{#1}\n\\newcommand{\\qtyAlt}[1]{#1}\n",
      );
      const result = runAutoFixes({
        files: [texFile("main", content)],
        mainFileId: "main",
        diagnostics: [
          diagnostic({
            kind: "undefined-command",
            data: { command: "qty" },
          }),
        ],
      });

      expect(result.applied).toEqual(["Loaded siunitx for \\qty"]);
      expect(result.updates[0].content).toContain("\\usepackage{siunitx}");
    });
  });

  describe("R6 duplicate-command guards", () => {
    it("comments out later byte-identical \\newcommand and \\newcommand* duplicates", () => {
      const content = wrap(
        "Hi",
        "\\newcommand{\\mycmd}{hello} % first\n  \\newcommand{\\mycmd}{hello} % second\n",
      );
      const result = runAutoFixes({
        files: [texFile("main", content)],
        mainFileId: "main",
        diagnostics: [
          diagnostic({
            kind: "duplicate-command",
            data: { command: "mycmd" },
          }),
        ],
      });

      expect(result.applied).toEqual([
        "Commented 1 duplicate definition of \\mycmd",
      ]);
      expect(result.updates[0].content).toContain(
        "\\newcommand{\\mycmd}{hello} % first\n% Auto-fix: duplicate command \\mycmd\n%   \\newcommand{\\mycmd}{hello} % second",
      );

      const starred = wrap(
        "Hi",
        "\\newcommand*{\\mycmd}{hello}\n\\newcommand*{\\mycmd}{hello}\n",
      );
      const starredResult = runAutoFixes({
        files: [texFile("main", starred)],
        mainFileId: "main",
        diagnostics: [
          diagnostic({
            kind: "duplicate-command",
            data: { command: "mycmd" },
          }),
        ],
      });
      expect(starredResult.applied).toEqual([
        "Commented 1 duplicate definition of \\mycmd",
      ]);
    });

    it("skips when duplicate definitions have different bodies", () => {
      const content = wrap(
        "Hi",
        "\\newcommand{\\mycmd}{hello}\n\\newcommand{\\mycmd}{world}\n",
      );
      const result = runAutoFixes({
        files: [texFile("main", content)],
        mainFileId: "main",
        diagnostics: [
          diagnostic({
            kind: "duplicate-command",
            data: { command: "mycmd" },
          }),
        ],
      });

      expect(result.updates).toEqual([]);
      expect(result.skipped).toEqual([
        {
          diagnosticId: "d1",
          reason:
            "Different definitions require a manual renewcommand/rename decision",
        },
      ]);
    });

    it("ignores commented definitions and \\renewcommand / \\providecommand / \\DeclareMathOperator", () => {
      const withComment = wrap(
        "Hi",
        "% \\newcommand{\\mycmd}{hello}\n\\newcommand{\\mycmd}{hello}\n",
      );
      expect(
        runAutoFixes({
          files: [texFile("main", withComment)],
          mainFileId: "main",
          diagnostics: [
            diagnostic({
              kind: "duplicate-command",
              data: { command: "mycmd" },
            }),
          ],
        }).updates,
      ).toEqual([]);

      const withOtherMacros = wrap(
        "Hi",
        "\\newcommand{\\mycmd}{hello}\n\\renewcommand{\\mycmd}{hello}\n\\providecommand{\\mycmd}{hello}\n\\DeclareMathOperator{\\mycmd}{hello}\n",
      );
      expect(
        runAutoFixes({
          files: [texFile("main", withOtherMacros)],
          mainFileId: "main",
          diagnostics: [
            diagnostic({
              kind: "duplicate-command",
              data: { command: "mycmd" },
            }),
          ],
        }).updates,
      ).toEqual([]);
    });
  });
});
