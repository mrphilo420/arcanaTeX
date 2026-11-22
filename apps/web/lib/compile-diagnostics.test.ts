import { describe, expect, it } from "vitest";
import { parseLatexLog } from "@/lib/compile-diagnostics";

describe("parseLatexLog", () => {
  it("returns nothing for a clean log", () => {
    expect(parseLatexLog("This is pdfTeX\nOutput written on main.pdf")).toEqual(
      [],
    );
  });

  it("classifies an undefined environment and extracts its name", () => {
    const log = [
      "! LaTeX Error: Environment proof undefined.",
      "",
      "See the LaTeX manual or LaTeX Companion for explanation.",
      "l.12 \\begin{proof}",
    ].join("\n");

    const [diagnostic] = parseLatexLog(log, { mainFilePath: "main.tex" });

    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.kind).toBe("undefined-environment");
    expect(diagnostic.data.environment).toBe("proof");
    expect(diagnostic.line).toBe(12);
  });

  it("classifies a missing graphic and extracts the file", () => {
    const log =
      "! LaTeX Error: File `fig.png' not found.\n\nl.5 \\includegraphics{fig.png}";
    const [diagnostic] = parseLatexLog(log);

    expect(diagnostic.kind).toBe("missing-graphic");
    expect(diagnostic.data.file).toBe("fig.png");
  });

  it("de-duplicates identical errors", () => {
    const block = "! Undefined control sequence.\nl.3 \\foo\n";
    expect(parseLatexLog(`${block}\n${block}`)).toHaveLength(1);
  });

  it("normalizes CRLF line endings", () => {
    const crlf = "! Undefined control sequence.\r\nl.3 \\foo\r\n";
    expect(parseLatexLog(crlf)).toHaveLength(1);
  });

  it("sorts errors before warnings", () => {
    const log = [
      "LaTeX Warning: Reference `a' on page 1 undefined on input line 4.",
      "! Undefined control sequence.",
      "l.9 \\foo",
    ].join("\n");

    const severities = parseLatexLog(log).map((d) => d.severity);
    expect(severities[0]).toBe("error");
  });
});

describe("parseLatexLog overfull and underfull warnings", () => {
  it("parses an overfull hbox and its paragraph range", () => {
    const log = [
      "Overfull \\hbox (12.34pt too wide) in paragraph at lines 10--12",
      "[]\\OT1/cmr/m/n/10 some text",
    ].join("\n");

    const [diagnostic] = parseLatexLog(log, { mainFilePath: "main.tex" });

    expect(diagnostic.severity).toBe("warning");
    expect(diagnostic.kind).toBe("warning");
    expect(diagnostic.warningFamily).toBe("overfull-hbox");
    expect(diagnostic.warningPriority).toBe("high");
    // The second number is where the bad break happened.
    expect(diagnostic.line).toBe(12);
    expect(diagnostic.filePath).toBe("main.tex");
  });

  it("keeps underfull warnings and marks them low priority", () => {
    const log =
      "Underfull \\vbox (badness 10000) has occurred while \\output is active []";

    const [diagnostic] = parseLatexLog(log);

    expect(diagnostic.warningFamily).toBe("underfull-vbox");
    expect(diagnostic.warningPriority).toBe("low");
  });

  it("does not swallow the diagnostic that follows an overfull box", () => {
    const log = [
      "Overfull \\hbox (12pt too wide) in paragraph at lines 10--12",
      "[]\\OT1/cmr/m/n/10 text",
      "! Undefined control sequence.",
      "l.20 \\foo",
    ].join("\n");

    const diagnostics = parseLatexLog(log);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0].severity).toBe("error");
    expect(diagnostics[1].warningFamily).toBe("overfull-hbox");
  });
  it("parses a bare missing-character warning", () => {
    const log =
      "Missing character: There is no – in font [lmroman10-regular]:!";

    const [diagnostic] = parseLatexLog(log);

    expect(diagnostic.severity).toBe("warning");
    expect(diagnostic.warningFamily).toBe("missing-character");
    expect(diagnostic.warningPriority).toBe("medium");
  });

  it("parses a pdfTeX destination warning", () => {
    const log =
      "pdfTeX warning (ext4): destination with the same identifier (name{section.1}) has been already used, duplicate ignored";

    const [diagnostic] = parseLatexLog(log);

    expect(diagnostic.warningFamily).toBe("destination-duplicate");
    expect(diagnostic.warningPriority).toBe("medium");
  });
});

describe("parseLatexLog file attribution", () => {
  const wrap = (text: string, width = 79) =>
    text.match(new RegExp(`.{1,${width}}`, "g"))?.join("\n") ?? text;

  it("blames the main file once a nested library has closed", () => {
    const log = [
      "(./main.tex",
      "LaTeX2e <2025-11-01>",
      wrap(
        "(/Users/me/Library/Application Support/MiKTeX/texmfs/install/tex/generic/pgf/frontendlayer/tikz/libraries/tikzlibrarypositioning.code.tex",
      ),
      "File: tikzlibrarypositioning.code.tex 2025-08-29 v3.1.11a (3.1.11a)",
      ")",
      "(./main.aux)",
      "Runaway argument?",
      "! File ended while scanning use of \\\\@@coraddress.",
      "<*> ./main.tex",
    ].join("\n");

    const [diagnostic] = parseLatexLog(log, {
      mainFilePath: "source/main.tex",
    });

    expect(diagnostic.filePath).toBe("main.tex");
  });

  it("blames an \\input file while it is open, then returns to main", () => {
    const log = [
      "(./main.tex",
      "(./sections/a.tex",
      "! Undefined control sequence.",
      "l.3 \\foo",
      ")",
      "! Undefined control sequence.",
      "l.9 \\bar",
    ].join("\n");

    const [first, second] = parseLatexLog(log).sort(
      (a, b) => (a.line ?? 0) - (b.line ?? 0),
    );

    expect(first.filePath).toBe("sections/a.tex");
    expect(second.filePath).toBe("main.tex");
  });

  it("is not thrown off by parenthesised text like (Font)", () => {
    const log = [
      "(./main.tex",
      "(Font)              <7> on input line 2.",
      "(see the transcript file for additional information)",
      "! Undefined control sequence.",
      "l.4 \\foo",
    ].join("\n");

    expect(parseLatexLog(log)[0].filePath).toBe("main.tex");
  });

  it("trusts explicit file:line:error locations", () => {
    const log = [
      "(./main.tex",
      "./sections/b.tex:7: Undefined control sequence.",
      "l.7 \\foo",
    ].join("\n");

    expect(parseLatexLog(log)[0].filePath).toBe("sections/b.tex");
  });
});

describe("parseLatexLog runaway arguments", () => {
  const runawayLog = [
    "(./main.tex",
    "Runaway argument?",
    "{\\orgdiv {Mathematics Department, College of Science}, \\orgname {Bula\\ETC.",
    "! File ended while scanning use of \\\\@@coraddress.",
    "<inserted text> ",
    "                \\par ",
    "<*> ./main.tex",
    "              ",
    "I suspect you have forgotten a `}', causing me",
    "to read past where you wanted me to stop.",
  ].join("\n");

  it("classifies end-of-file inside an argument as a runaway argument", () => {
    const [diagnostic] = parseLatexLog(runawayLog);

    expect(diagnostic.kind).toBe("runaway-argument");
    expect(diagnostic.data.command).toBe("@@coraddress");
  });

  it("captures the runaway preview without TeX's truncation marker", () => {
    const [diagnostic] = parseLatexLog(runawayLog);

    expect(diagnostic.data.runaway).toBe(
      "{\\orgdiv {Mathematics Department, College of Science}, \\orgname {Bula",
    );
  });

  it("classifies a paragraph ending inside an argument too", () => {
    const log = [
      "Runaway argument?",
      "{Some text that never closes",
      "! Paragraph ended before \\textbf was complete.",
      "l.9 ",
    ].join("\n");

    const [diagnostic] = parseLatexLog(log);

    expect(diagnostic.kind).toBe("runaway-argument");
    expect(diagnostic.data.command).toBe("textbf");
    expect(diagnostic.data.runaway).toBe("{Some text that never closes");
  });

  it("leaves emergency stop and fatal errors as fatal", () => {
    const log = "! Emergency stop.\n<*> main.tex\n";
    expect(parseLatexLog(log)[0].kind).toBe("fatal");
  });
});

describe("parseLatexLog kinds used by deterministic repairs", () => {
  it("classifies a package loaded after \\begin{document}", () => {
    const log = [
      "(./main.tex",
      "! LaTeX Error: Can be used only in preamble.",
      "",
      "See the LaTeX manual or LaTeX Companion for explanation.",
      "l.12 \\usepackage",
      "                  {amsmath}",
    ].join("\n");

    const [d] = parseLatexLog(log);
    expect(d.kind).toBe("preamble-only");
    expect(d.line).toBe(12);
    expect(d.lineText).toBe("\\usepackage");
  });

  it("classifies a misplaced alignment tab and keeps the context", () => {
    const log = [
      "! Misplaced alignment tab character &.",
      "l.7 R&",
      "      D of the lab",
    ].join("\n");

    const [d] = parseLatexLog(log);
    expect(d.kind).toBe("misplaced-tab");
    expect(d.lineText).toBe("R&");
  });

  it("classifies a macro parameter character in text", () => {
    const log = [
      "! You can't use `macro parameter character #' in horizontal mode.",
      "l.3 costs #",
      "           5",
    ].join("\n");

    expect(parseLatexLog(log)[0].kind).toBe("misplaced-hash");
  });

  it("flags a fatal error that says no legal \\end was found", () => {
    const log = [
      "! Emergency stop.",
      "<*> ./main.tex",
      "              ",
      "*** (job aborted, no legal \\end found)",
    ].join("\n");

    const [d] = parseLatexLog(log);
    expect(d.kind).toBe("fatal");
    expect(d.data.noLegalEnd).toBe(true);
  });

  it("does not flag an ordinary emergency stop", () => {
    const [d] = parseLatexLog("! Emergency stop.\n<*> main.tex\n");
    expect(d.data.noLegalEnd).toBeUndefined();
  });
});
