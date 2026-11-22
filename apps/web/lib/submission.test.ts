import { describe, expect, it } from "vitest";
import { generateArxivReadmeJson } from "@/lib/preprints";
import type { ProjectFile } from "@/lib/project-files";
import { analyzeSubmission, createSourceZip } from "@/lib/submission";
import { PUBLISHER_TEMPLATES } from "@/lib/publishers";

const texFile = (path: string, content: string, id = path): ProjectFile => ({
  id,
  name: path.split("/").pop() ?? path,
  path,
  type: "tex",
  content,
});

const imageFile = (path: string): ProjectFile => ({
  id: path,
  name: path.split("/").pop() ?? path,
  path,
  type: "image",
  dataUrl: "data:image/png;base64,iVBORw0KGgo=",
});

describe("analyzeSubmission", () => {
  it("ignores commented-out blockers, TODO markers, figures, and anonymity markers", () => {
    const main = texFile(
      "main.tex",
      `\\documentclass{article}
% \\documentclass[draft]{article}
% \\usepackage{fontspec}
% \\usepackage{minted}
% \\write18{ls}
% \\input{missing_chapter}
% \\includegraphics{figures/missing.png}
% \\bibliography{missing_bib}
% \\author{Alice Researcher}
% https://secret-lab.example.edu
% TODO: polish before camera ready
\\begin{document}
\\begin{abstract}
Clean double-blind submission.
\\end{abstract}
\\section{Introduction}
No unmasked issues remain.
\\end{document}
`,
    );

    const report = analyzeSubmission({
      files: [main],
      mainFileId: main.id,
      compiler: "pdflatex",
      diagnostics: [],
      compileError: null,
      target: "conference",
      anonymous: true,
    });

    expect(report.counts.blocker).toBe(0);
    expect(report.counts.warning).toBe(0);
    expect(report.checks.some((c) => c.id === "submission-clean")).toBe(true);
  });

  it("does not emit a false case warning for extension-less or relative figure paths", () => {
    const main = texFile(
      "main.tex",
      `\\documentclass{article}
\\usepackage{graphicx}
\\begin{document}
\\includegraphics{figures/plot}
\\includegraphics{./figures/diagram.png}
\\input{sections/intro}
\\end{document}
`,
    );
    const intro = texFile(
      "sections/intro.tex",
      `\\section{Intro}
\\includegraphics{../figures/plot.pdf}
`,
    );
    const fig1 = imageFile("figures/plot.pdf");
    const fig2 = imageFile("figures/diagram.png");

    const report = analyzeSubmission({
      files: [main, intro, fig1, fig2],
      mainFileId: main.id,
      compiler: "pdflatex",
      diagnostics: [],
      compileError: null,
      target: "arxiv",
      anonymous: false,
    });

    expect(report.counts.blocker).toBe(0);
    expect(report.checks.filter((c) => c.id.startsWith("case-path-"))).toEqual(
      [],
    );
  });

  it("emits exact-case warning when figure path matches only case-insensitively", () => {
    const main = texFile(
      "main.tex",
      `\\documentclass{article}
\\usepackage{graphicx}
\\begin{document}
\\includegraphics{Figures/Plot.pdf}
\\includegraphics{Figures/Plot}
\\end{document}
`,
    );
    const fig = imageFile("figures/plot.pdf");

    const report = analyzeSubmission({
      files: [main, fig],
      mainFileId: main.id,
      compiler: "pdflatex",
      diagnostics: [],
      compileError: null,
      target: "arxiv",
      anonymous: false,
    });

    const caseWarnings = report.checks.filter((c) =>
      c.id.startsWith("case-path-"),
    );
    expect(caseWarnings).toHaveLength(2);
    expect(caseWarnings[0].title).toBe(
      "Figure reference is not an exact-case path",
    );
    expect(caseWarnings[0].status).toBe("warning");
  });

  it("validates \\addbibresource{...} files just like \\bibliography{...}", () => {
    const mainMissing = texFile(
      "main.tex",
      `\\documentclass{article}
\\usepackage{biblatex}
\\addbibresource{missing.bib}
\\begin{document}
Hi.
\\end{document}
`,
    );

    const missingReport = analyzeSubmission({
      files: [mainMissing],
      mainFileId: mainMissing.id,
      compiler: "pdflatex",
      diagnostics: [],
      compileError: null,
      target: "arxiv",
      anonymous: false,
    });
    expect(
      missingReport.checks.some(
        (c) => c.status === "blocker" && c.detail === "missing.bib",
      ),
    ).toBe(true);

    const mainOk = texFile(
      "main.tex",
      `\\documentclass{article}
\\usepackage{biblatex}
\\addbibresource{refs.bib}
\\begin{document}
Hi.
\\end{document}
`,
    );
    const refs = texFile(
      "refs.bib",
      "@article{k,title={T},author={A},journal={J},year={2024}}",
    );
    const okReport = analyzeSubmission({
      files: [mainOk, refs],
      mainFileId: mainOk.id,
      compiler: "pdflatex",
      diagnostics: [],
      compileError: null,
      target: "arxiv",
      anonymous: false,
    });
    expect(okReport.counts.blocker).toBe(0);
  });

  it("detects publisher and runs journal compliance checks when target is journal or publisher class is detected", () => {
    const ieeeIncomplete = texFile(
      "main.tex",
      `\\documentclass[journal]{IEEEtran}
\\begin{document}
\\title{Test}
\\maketitle
\\section{Intro}
Hello.
\\bibliographystyle{plain}
\\bibliography{references}
\\end{document}
`,
    );
    const bib = texFile(
      "references.bib",
      "@article{k,title={T},author={A},journal={J},year={2024}}",
    );

    const report = analyzeSubmission({
      files: [ieeeIncomplete, bib],
      mainFileId: ieeeIncomplete.id,
      compiler: "pdflatex",
      diagnostics: [],
      compileError: null,
      target: "arxiv",
      anonymous: false,
    });

    expect(report.detectedPublisher?.id).toBe("ieee");
    expect(
      report.checks.some(
        (c) => c.id === "journal-abstract" && c.status === "warning",
      ),
    ).toBe(true);
    expect(
      report.checks.some(
        (c) => c.id === "journal-keywords" && c.status === "warning",
      ),
    ).toBe(true);
    expect(
      report.checks.some(
        (c) =>
          c.id === "journal-bibstyle" &&
          c.status === "warning" &&
          c.detail.includes("IEEEtran"),
      ),
    ).toBe(true);

    // Clean Elsevier template passes all checks cleanly
    const elsevierFiles = PUBLISHER_TEMPLATES.elsevier.files.map((f, idx) => ({
      ...f,
      id: `el-${idx}`,
    }));
    const cleanReport = analyzeSubmission({
      files: elsevierFiles,
      mainFileId: elsevierFiles[0].id,
      compiler: "pdflatex",
      diagnostics: [],
      compileError: null,
      target: "journal",
      anonymous: false,
    });

    expect(cleanReport.detectedPublisher?.id).toBe("elsevier");
    expect(cleanReport.counts.blocker).toBe(0);
    expect(cleanReport.counts.warning).toBe(0);
    expect(cleanReport.checks.some((c) => c.id === "submission-clean")).toBe(
      true,
    );
  });

  it("integrates preprint server checks for arxiv, biorxiv, and hal-osf", () => {
    const bioDraft = texFile(
      "main.tex",
      `\\documentclass{article}
\\begin{document}
\\section{Methods}
Patient cohort data are analyzed.
\\end{document}
`,
    );

    const bioReport = analyzeSubmission({
      files: [bioDraft],
      mainFileId: bioDraft.id,
      compiler: "pdflatex",
      diagnostics: [],
      compileError: null,
      target: "biorxiv",
      anonymous: false,
      hasFreshPdf: false,
    });
    expect(
      bioReport.checks.some(
        (c) => c.id === "biorxiv-fresh-pdf" && c.status === "warning",
      ),
    ).toBe(true);
    expect(
      bioReport.checks.some(
        (c) => c.id === "biorxiv-ethics-trial" && c.status === "warning",
      ),
    ).toBe(true);

    const halDraft = texFile(
      "main.tex",
      `\\documentclass{article}
\\begin{document}
\\section{Intro}
Minimal note.
\\end{document}
`,
    );
    const halReport = analyzeSubmission({
      files: [halDraft],
      mainFileId: halDraft.id,
      compiler: "pdflatex",
      diagnostics: [],
      compileError: null,
      target: "hal-osf",
      anonymous: false,
    });
    expect(
      halReport.checks.some(
        (c) => c.id === "hal-osf-affiliation-orcid" && c.status === "warning",
      ),
    ).toBe(true);
  });

  it("flags strengthened double-blind anonymity leaks (GitHub URLs, grant numbers, ORCID, \\pdfauthor, prior work)", () => {
    const leaky = texFile(
      "main.tex",
      `\\documentclass{article}
\\usepackage{hyperref}
\\hypersetup{pdfauthor={Alice Researcher}}
\\begin{document}
\\section{Intro}
Code is available at https://github.com/alice-lab/secret-repo.
Supported by NSF Grant DMS-2401234.
ORCID: 0000-0002-1825-0097.
In our previous work~\\cite{k}, we proved the base case.
\\end{document}
`,
    );

    const report = analyzeSubmission({
      files: [leaky],
      mainFileId: leaky.id,
      compiler: "pdflatex",
      diagnostics: [],
      compileError: null,
      target: "conference",
      anonymous: true,
    });

    const ids = new Set(report.checks.map((c) => c.id));
    expect(ids.has("anonymity-url")).toBe(true);
    expect(ids.has("anonymity-grant")).toBe(true);
    expect(ids.has("anonymity-orcid")).toBe(true);
    expect(ids.has("anonymity-pdfauthor")).toBe(true);
    expect(ids.has("anonymity-prior-work")).toBe(true);
  });

  it("bundles extraFiles like 00README.json into createSourceZip without duplicating existing paths", () => {
    const main = texFile(
      "main.tex",
      "\\documentclass{article}\\begin{document}Hi\\end{document}",
    );
    const readme = generateArxivReadmeJson("main.tex", "xelatex");
    const zipBytes = createSourceZip([main], null, [
      { path: "00README.json", content: readme },
    ]);
    const text = new TextDecoder().decode(zipBytes);
    expect(text).toContain("00README.json");
    expect(text).toContain('"compiler": "xelatex"');
  });

  it("surfaces structural LaTeX linter errors and arXiv hyperref warnings in analyzeSubmission", () => {
    const broken = texFile(
      "main.tex",
      `\\documentclass{article}
\\usepackage[pdftex]{hyperref}
\\begin{document}
\\begin{proof}
Unclosed environment and \\textbf{unclosed brace.
\\end{document}
`,
    );

    const report = analyzeSubmission({
      files: [broken],
      mainFileId: broken.id,
      compiler: "pdflatex",
      diagnostics: [],
      compileError: null,
      target: "arxiv",
      anonymous: false,
    });

    expect(
      report.checks.some(
        (c) =>
          c.status === "blocker" &&
          (c.id.startsWith("lint-") ||
            c.title.includes("brace") ||
            c.title.includes("environment")),
      ),
    ).toBe(true);
    expect(
      report.checks.some(
        (c) => c.id.startsWith("lint-") || c.detail.includes("hyperref"),
      ),
    ).toBe(true);
  });
});
