import { describe, expect, it } from "vitest";
import { generateArxivReadmeJson } from "@/lib/preprints";
import type { ProjectFile } from "@/lib/project-files";
import { PUBLISHER_TEMPLATES } from "@/lib/publishers";
import {
  analyzeResearchWorkflow,
  generateCoverLetterTex,
  generateDeclarationsSnippet,
  generateResponseToReviewersTex,
  insertDeclarationsIntoLatex,
} from "@/lib/research-workflow";

const texFile = (path: string, content: string, id = path): ProjectFile => ({
  id,
  name: path.split("/").pop() ?? path,
  path,
  type: "tex",
  content,
});

describe("analyzeResearchWorkflow", () => {
  it("evaluates all 6 research stages and computes higher readiness when preprint, journal, and package artifacts exist", () => {
    const bareMain = texFile(
      "main.tex",
      `\\documentclass{article}
\\begin{document}
\\section{Intro}
% TODO inside comment should be ignored
TODO: finish proofs.
\\end{document}
`,
    );

    const bareReport = analyzeResearchWorkflow({
      files: [bareMain],
      mainFileId: bareMain.id,
      compiler: "pdflatex",
      diagnostics: [],
      compileError: "Undefined control sequence",
      hasFreshPdf: false,
    });

    expect(bareReport.stages).toHaveLength(6);
    expect(bareReport.stages[3]?.id).toBe("preprint-readiness");
    expect(bareReport.stages[3]?.priorityBadge).toBe("Priority 1");
    expect(bareReport.totalBlockers).toBeGreaterThan(0);
    expect(bareReport.readinessPercent).toBeLessThan(65);

    const elsevierMain = PUBLISHER_TEMPLATES.elsevier.files[0];
    const elsevierBib = PUBLISHER_TEMPLATES.elsevier.files[1];
    const completeFiles: ProjectFile[] = [
      { ...elsevierMain, id: "main" },
      { ...elsevierBib, id: "bib" },
      texFile("main.bbl", "\\begin{thebibliography}{1}\\end{thebibliography}"),
      texFile("00README.json", generateArxivReadmeJson("main.tex", "pdflatex")),
      texFile(
        "cover-letter.tex",
        generateCoverLetterTex({
          mainContent: elsevierMain.content,
          publisherId: "elsevier",
        }),
      ),
      texFile(
        "response-to-reviewers.tex",
        generateResponseToReviewersTex({ mainContent: elsevierMain.content }),
      ),
    ];

    const readyReport = analyzeResearchWorkflow({
      files: completeFiles,
      mainFileId: "main",
      compiler: "pdflatex",
      diagnostics: [],
      compileError: null,
      hasFreshPdf: true,
    });

    expect(readyReport.totalBlockers).toBe(0);
    expect(readyReport.detectedPublisherId).toBe("elsevier");
    expect(readyReport.readinessPercent).toBe(100);
    expect(readyReport.stages.every((s) => s.status === "ready")).toBe(true);
  });

  it("audits Lean 4 files inside Verification & Hygiene when .lean sources exist", () => {
    const main = texFile(
      "main.tex",
      `\\documentclass{article}
\\begin{document}
\\begin{abstract}Formalized bounds.\\end{abstract}
\\section{Intro}
See Lean proof.
\\end{document}
`,
    );
    const leanIncomplete = texFile(
      "Proofs/Main.lean",
      `theorem main_bound : 1 + 1 = 2 := by
  sorry
`,
    );

    const blockedReport = analyzeResearchWorkflow({
      files: [main, leanIncomplete],
      mainFileId: main.id,
      compiler: "pdflatex",
      diagnostics: [],
      compileError: null,
      hasFreshPdf: true,
    });

    expect(blockedReport.hasLeanFiles).toBe(true);
    expect(blockedReport.leanSummary.sorryCount).toBe(1);
    const stage3 = blockedReport.stages.find(
      (s) => s.id === "verification-hygiene",
    );
    expect(stage3?.status).toBe("blocked");
    expect(
      stage3?.items.some((item) => item.id === "verify-lean4" && !item.passed),
    ).toBe(true);

    const leanClean = texFile(
      "Proofs/Main.lean",
      `theorem main_bound : 1 + 1 = 2 := by
  rfl
`,
    );
    const cleanReport = analyzeResearchWorkflow({
      files: [main, leanClean],
      mainFileId: main.id,
      compiler: "pdflatex",
      diagnostics: [],
      compileError: null,
      hasFreshPdf: true,
    });

    const cleanStage3 = cleanReport.stages.find(
      (s) => s.id === "verification-hygiene",
    );
    expect(cleanStage3?.status).toBe("ready");
    expect(
      cleanStage3?.items.some(
        (item) => item.id === "verify-lean4" && item.passed,
      ),
    ).toBe(true);
  });
});

describe("1-click research workflow generators", () => {
  it("generates cover-letter.tex, response-to-reviewers.tex, and publisher declarations", () => {
    const source = PUBLISHER_TEMPLATES.elsevier.files[0].content ?? "";
    const coverLetter = generateCoverLetterTex({
      mainContent: source,
      publisherId: "elsevier",
      preprintServer: "arxiv",
      preprintId: "arXiv:2502.01234",
    });
    expect(coverLetter).toContain("\\documentclass");
    expect(coverLetter).toContain("Preconditioned Krylov Subspace Bounds");
    expect(coverLetter).toContain("arXiv:2502.01234");
    expect(coverLetter).toContain("\\end{document}");

    const responseLetter = generateResponseToReviewersTex({
      mainContent: source,
      manuscriptId: "JCAM-2025-42",
    });
    expect(responseLetter).toContain("Response to Reviewers");
    expect(responseLetter).toContain("JCAM-2025-42");
    expect(responseLetter).toContain("\\reviewercomment");
    expect(responseLetter).toContain("\\authorresponse");

    const elsevierDecl = generateDeclarationsSnippet("elsevier", {
      authorName: "Elena M. Vance",
      preprintNote: true,
      serverLabel: "arXiv",
    });
    expect(elsevierDecl).toContain("CRediT authorship contribution statement");
    expect(elsevierDecl).toContain("Declaration of competing interest");
    expect(elsevierDecl).toContain("Data and code availability");
    expect(elsevierDecl).toContain("generative AI");
    expect(elsevierDecl).toContain("Prior preprint disclosure");

    const springerDecl = generateDeclarationsSnippet("springer-nature");
    expect(springerDecl).toContain("\\bmhead{Declarations}");

    const bareDoc = `\\documentclass{article}
\\begin{document}
\\section{Intro}
Hello.
\\bibliographystyle{plain}
\\bibliography{references}
\\end{document}`;
    const merged = insertDeclarationsIntoLatex(bareDoc, elsevierDecl);
    expect(merged.indexOf("CRediT authorship")).toBeLessThan(
      merged.indexOf("\\bibliographystyle{plain}"),
    );
  });
});
