import { describe, expect, it } from "vitest";
import {
  evaluatePreprintChecks,
  generateArxivReadmeJson,
  PREPRINT_SERVER_LIST,
  PREPRINT_SERVERS,
} from "@/lib/preprints";
import type { ProjectFile } from "@/lib/project-files";

const texFile = (path: string, content: string, id = path): ProjectFile => ({
  id,
  name: path.split("/").pop() ?? path,
  path,
  type: "tex",
  content,
});

describe("PREPRINT_SERVERS and generateArxivReadmeJson", () => {
  it("exposes metadata for arXiv, bioRxiv/medRxiv, and HAL/OSF/ChemRxiv", () => {
    expect(PREPRINT_SERVER_LIST).toHaveLength(3);
    expect(PREPRINT_SERVERS.arxiv.primarySubmissionMode).toBe("tex-source");
    expect(PREPRINT_SERVERS.biorxiv.primarySubmissionMode).toBe("pdf-first");
    expect(PREPRINT_SERVERS["hal-osf"].primarySubmissionMode).toBe("pdf-first");
    for (const server of PREPRINT_SERVER_LIST) {
      expect(server.keyRules.length).toBeGreaterThanOrEqual(3);
      expect(server.licenseSummary.length).toBeGreaterThan(10);
      expect(server.screeningSummary.length).toBeGreaterThan(10);
    }
  });

  it("generates valid arXiv 00README.json with compiler and toplevel source", () => {
    const xelatexReadme = JSON.parse(
      generateArxivReadmeJson("/paper/main.tex", "xelatex"),
    ) as {
      process: { compiler: string };
      sources: Array<{ filename: string; usage: string }>;
    };
    expect(xelatexReadme.process.compiler).toBe("xelatex");
    expect(xelatexReadme.sources).toEqual([
      { filename: "paper/main.tex", usage: "toplevel" },
    ]);

    const tectonicFallback = JSON.parse(
      generateArxivReadmeJson("main.tex", "tectonic"),
    ) as {
      process: { compiler: string };
      sources: Array<{ filename: string; usage: string }>;
    };
    expect(tectonicFallback.process.compiler).toBe("pdflatex");
  });
});

describe("evaluatePreprintChecks", () => {
  it("flags arXiv traps: nested main file, spaces in filenames, absolute paths, missing .bbl, biblatex, hyperref clash, \\Bbbk clash, and shell-escape", () => {
    const main = texFile(
      "paper/main.tex",
      `\\documentclass{article}
\\usepackage[colorlinks=true]{hyperref}
\\usepackage{amssymb}
\\usepackage{newtxmath}
\\usepackage{biblatex}
\\usepackage{minted}
\\addbibresource{refs.bib}
\\begin{document}
\\includegraphics{/Users/alice/fig 1.png}
\\bibliography{refs}
\\end{document}
`,
    );
    const badFig = texFile("figures/my plot.png", "");
    const refs = texFile("refs.bib", "@article{k,title={T}}");

    const checks = evaluatePreprintChecks({
      server: "arxiv",
      files: [main, badFig, refs],
      mainFile: main,
      compiler: "xelatex",
    });

    const byId = new Map(checks.map((c) => [c.id, c]));
    expect(byId.get("arxiv-main-root")?.status).toBe("warning");
    expect(byId.get("arxiv-filenames")?.status).toBe("warning");
    expect(byId.get("arxiv-absolute-paths")?.status).toBe("blocker");
    expect(byId.get("arxiv-bbl")?.status).toBe("warning");
    expect(byId.get("arxiv-biblatex")?.status).toBe("warning");
    expect(byId.get("arxiv-hyperref-clash")?.status).toBe("warning");
    expect(byId.get("arxiv-bbbk-conflict")?.status).toBe("warning");
    expect(byId.get("arxiv-shell-escape")?.status).toBe("warning");
    expect(byId.get("arxiv-00readme")?.status).toBe("warning");
  });

  it("ignores commented-out arXiv traps and passes when .bbl and 00README.json are present", () => {
    const main = texFile(
      "main.tex",
      `\\documentclass{article}
% \\usepackage[colorlinks=true]{hyperref}
% \\usepackage{minted}
% \\includegraphics{/Users/alice/bad.png}
\\usepackage{hyperref}
\\hypersetup{colorlinks=true}
\\begin{document}
\\section{Intro}
See~\\cite{saad1986gmres}.
\\bibliographystyle{plain}
\\bibliography{refs}
\\end{document}
`,
    );
    const bbl = texFile(
      "main.bbl",
      "\\begin{thebibliography}{1}\\end{thebibliography}",
    );
    const readme = texFile(
      "00README.json",
      generateArxivReadmeJson("main.tex", "pdflatex"),
    );

    const checks = evaluatePreprintChecks({
      server: "arxiv",
      files: [main, bbl, readme],
      mainFile: main,
      compiler: "pdflatex",
    });

    expect(checks.every((c) => c.status === "pass")).toBe(true);
  });

  it("validates bioRxiv / medRxiv PDF-first, Data Availability, Competing Interests, Ethics/IRB, and Author Contributions", () => {
    const clinicalDraft = texFile(
      "main.tex",
      `\\documentclass{article}
\\begin{document}
\\section{Methods}
We enrolled 120 patients in a randomized clinical trial cohort.
\\end{document}
`,
    );

    const missingChecks = evaluatePreprintChecks({
      server: "biorxiv",
      files: [clinicalDraft],
      mainFile: clinicalDraft,
      compiler: "pdflatex",
      hasFreshPdf: false,
    });
    expect(missingChecks.every((c) => c.status === "warning")).toBe(true);

    const completeDraft = texFile(
      "main.tex",
      `\\documentclass{article}
\\begin{document}
\\section{Methods}
We enrolled 120 patients in a clinical trial (ClinicalTrials.gov NCT01234567) approved by the Institutional Review Board (IRB).
\\section*{Data Availability}
Data are deposited in Zenodo (10.5281/zenodo.1234567).
\\section*{Competing Interests and Funding}
The authors declare no competing interests. Supported by NIH Grant R01-123456.
\\section*{Author Contributions}
A.B. and C.D. contributed to conceptualization, analysis, and writing.
\\end{document}
`,
    );

    const completeChecks = evaluatePreprintChecks({
      server: "biorxiv",
      files: [completeDraft],
      mainFile: completeDraft,
      compiler: "pdflatex",
      hasFreshPdf: true,
    });
    expect(completeChecks.every((c) => c.status === "pass")).toBe(true);
  });

  it("validates HAL / OSF / ChemRxiv metadata, ORCID, open license, and repository DOI", () => {
    const bare = texFile(
      "main.tex",
      `\\documentclass{article}
\\begin{document}
\\section{Intro}
Hello world.
\\end{document}
`,
    );
    const missing = evaluatePreprintChecks({
      server: "hal-osf",
      files: [bare],
      mainFile: bare,
      compiler: "pdflatex",
    });
    expect(missing.every((c) => c.status === "warning")).toBe(true);

    const complete = texFile(
      "main.tex",
      `\\documentclass{article}
\\title{Open Archive Study}
\\author{Elena Vance}
\\affiliation{University of Cambridge}
\\orcidlink{0000-0002-1825-0097}
\\keywords{reproducibility, open science}
\\begin{document}
\\section{Intro}
This preprint is distributed under a CC BY 4.0 license and has not been peer reviewed.
Code and datasets are archived at https://doi.org/10.5281/zenodo.999999.
\\end{document}
`,
    );
    const passing = evaluatePreprintChecks({
      server: "hal-osf",
      files: [complete],
      mainFile: complete,
      compiler: "pdflatex",
    });
    expect(passing.every((c) => c.status === "pass")).toBe(true);
  });
});
