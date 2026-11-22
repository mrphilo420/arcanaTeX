import { parseBibtex } from "@/lib/bibtex";
import type { CompileDiagnostic } from "@/lib/compile-diagnostics";
import { maskComments } from "@/lib/latex-active";
import type { LatexCompiler } from "@/lib/latex-compiler";
import { summarizeLeanFiles } from "@/lib/lean";
import {
  evaluatePreprintChecks,
  PREPRINT_SERVERS,
  type PreprintServerId,
} from "@/lib/preprints";
import {
  detectMainFile,
  isLatexDocumentFile,
  type ProjectFile,
} from "@/lib/project-files";
import {
  detectPublisherFromContent,
  evaluatePublisherCompliance,
  extractManuscriptParts,
  generatePreprintDisclosureSnippet,
  PUBLISHER_TEMPLATES,
  type PublisherId,
} from "@/lib/publishers";

export type ResearchStageId =
  | "literature-framing"
  | "manuscript-structuring"
  | "verification-hygiene"
  | "preprint-readiness"
  | "journal-alignment"
  | "submission-package";

export type ResearchStageStatus = "ready" | "in-progress" | "blocked";

export type ResearchStageActionTarget =
  | "literature"
  | "journal"
  | "submission"
  | "compile"
  | "create-cover-letter"
  | "create-response-letter"
  | "create-readme"
  | "insert-declarations";

export interface ResearchStageChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  severity: "blocker" | "warning" | "info";
  detail: string;
}

export interface ResearchStageAction {
  label: string;
  action: ResearchStageActionTarget;
}

export interface ResearchStageReport {
  id: ResearchStageId;
  step: number;
  title: string;
  subtitle: string;
  priorityBadge?: string;
  status: ResearchStageStatus;
  score: number;
  summary: string;
  items: ResearchStageChecklistItem[];
  blockers: string[];
  recommendedActions: ResearchStageAction[];
}

export interface ResearchWorkflowReport {
  readinessPercent: number;
  mainFilePath: string | null;
  detectedPublisherId: PublisherId | null;
  detectedPublisherName: string | null;
  preprintServer: PreprintServerId;
  hasLeanFiles: boolean;
  leanSummary: {
    fileCount: number;
    declarationCount: number;
    sorryCount: number;
    admitCount: number;
    axiomCount: number;
  };
  stages: ResearchStageReport[];
  totalBlockers: number;
  totalWarnings: number;
  metrics: {
    bibEntryCount: number;
    arxivOrCrossrefEntryCount: number;
    citationCount: number;
    sectionCount: number;
    mathOrTheoremCount: number;
    figureOrTableCount: number;
    hasAbstract: boolean;
    hasCoverLetter: boolean;
    hasResponseToReviewers: boolean;
    hasArxivReadme: boolean;
  };
}

export interface AnalyzeResearchWorkflowInput {
  files: ProjectFile[];
  mainFileId: string | null;
  compiler: LatexCompiler;
  diagnostics: CompileDiagnostic[];
  compileError: string | null;
  hasFreshPdf?: boolean;
  preprintServer?: PreprintServerId;
  publisherId?: PublisherId | null;
}

function fileBytes(file: ProjectFile): number {
  if (file.content) return new TextEncoder().encode(file.content).length;
  if (file.dataUrl) {
    const base64 = file.dataUrl.split(",")[1] ?? "";
    return Math.floor((base64.length * 3) / 4);
  }
  return 0;
}

function finalizeStage(input: {
  id: ResearchStageId;
  step: number;
  title: string;
  subtitle: string;
  priorityBadge?: string;
  items: ResearchStageChecklistItem[];
  recommendedActions: ResearchStageAction[];
  readySummary: string;
  progressSummary: string;
}): ResearchStageReport {
  const total = Math.max(1, input.items.length);
  const passedCount = input.items.filter((item) => item.passed).length;
  const score = Math.round((passedCount / total) * 100);
  const blockers = input.items
    .filter((item) => !item.passed && item.severity === "blocker")
    .map((item) => item.label);
  const status: ResearchStageStatus =
    blockers.length > 0 ? "blocked" : score === 100 ? "ready" : "in-progress";

  return {
    id: input.id,
    step: input.step,
    title: input.title,
    subtitle: input.subtitle,
    priorityBadge: input.priorityBadge,
    status,
    score,
    summary:
      status === "ready"
        ? input.readySummary
        : blockers.length > 0
          ? `${blockers.length} blocker${blockers.length === 1 ? "" : "s"}: ${blockers[0]}`
          : input.progressSummary,
    items: input.items,
    blockers,
    recommendedActions: input.recommendedActions,
  };
}

/**
 * Analyzes a research project end-to-end across 6 lifecycle stages:
 * 1. Literature & Framing
 * 2. Manuscript Structuring
 * 3. Verification & Hygiene (including Lean 4 proofs when present)
 * 4. Preprint Readiness — Priority 1 (arXiv / bioRxiv / HAL-OSF)
 * 5. Peer-Reviewed Journal Alignment
 * 6. Submission & Peer-Review Package
 */
export function analyzeResearchWorkflow(
  input: AnalyzeResearchWorkflowInput,
): ResearchWorkflowReport {
  const preprintServer: PreprintServerId = input.preprintServer ?? "arxiv";
  const texFiles = input.files.filter(
    (file) => file.type === "tex" && isLatexDocumentFile(file),
  );
  const mainFile =
    input.files.find((file) => file.id === input.mainFileId) ??
    detectMainFile(input.files) ??
    null;
  const mainContent = mainFile?.content ?? "";
  const combinedMaskedTex = texFiles
    .map((file) => maskComments(file.content ?? ""))
    .join("\n");
  const parts = extractManuscriptParts(mainContent);

  const detectedFromSource = mainFile
    ? detectPublisherFromContent(mainContent)
    : null;
  const effectivePublisher =
    input.publisherId && input.publisherId in PUBLISHER_TEMPLATES
      ? PUBLISHER_TEMPLATES[input.publisherId]
      : detectedFromSource;

  // -------------------------------------------------------------------------
  // Stage 1: Literature & Framing
  // -------------------------------------------------------------------------
  const bibFiles = input.files.filter((file) =>
    file.path.toLowerCase().endsWith(".bib"),
  );
  let bibEntryCount = 0;
  let bibErrorCount = 0;
  let arxivOrCrossrefEntryCount = 0;

  for (const bibFile of bibFiles) {
    const parsed = parseBibtex(bibFile.content ?? "");
    bibEntryCount += parsed.entries.length;
    bibErrorCount += parsed.problems.filter(
      (problem) => problem.severity === "error",
    ).length;
    for (const entry of parsed.entries) {
      const hasDoiOrArxiv = entry.fields.some(
        (field) =>
          field.name === "doi" ||
          field.name === "eprint" ||
          field.name === "archiveprefix" ||
          /arxiv|10\.\d{4,}/i.test(field.value),
      );
      if (hasDoiOrArxiv) arxivOrCrossrefEntryCount++;
    }
  }

  const inlineBibItems = (combinedMaskedTex.match(/\\bibitem\b/g) ?? []).length;
  const totalReferences = bibEntryCount + inlineBibItems;
  const citationMatches =
    combinedMaskedTex.match(
      /\\(?:cite|citep|citet|parencite|textcite|autocite|footcite)[a-zA-Z]*\*?(?:\s*\[[^\]]*\])?\s*\{[^}]+\}/g,
    ) ?? [];
  const citationCount = citationMatches.length;
  const hasAbstract = parts.abstractText.trim().length > 0;
  const hasTitle = parts.title.trim().length > 0;

  const stage1Items: ResearchStageChecklistItem[] = [
    {
      id: "lit-bib-entries",
      label:
        totalReferences > 0
          ? `${totalReferences} bibliography entries available`
          : "No bibliography entries found",
      passed: totalReferences > 0 && bibErrorCount === 0,
      severity: "warning",
      detail:
        totalReferences > 0
          ? bibErrorCount > 0
            ? `${totalReferences} entries found, but ${bibErrorCount} BibTeX syntax error(s) remain.`
            : `${totalReferences} entries (${arxivOrCrossrefEntryCount} with DOI/arXiv metadata).`
          : "Use Literature Search (Crossref / arXiv / Springer / Zotero) to build references.bib.",
    },
    {
      id: "lit-citations",
      label:
        citationCount > 0
          ? `${citationCount} active in-text citations`
          : "No in-text citations detected",
      passed: citationCount > 0,
      severity: "warning",
      detail:
        citationCount > 0
          ? "Citations link manuscript prose to your bibliography."
          : "Cite foundational literature with \\cite{...} to frame related work.",
    },
    {
      id: "lit-abstract",
      label: hasAbstract ? "Abstract framed" : "Abstract missing",
      passed: hasAbstract,
      severity: hasAbstract ? "info" : "blocker",
      detail: hasAbstract
        ? "Summary abstract is present for reader and screening intake."
        : "Add a clear \\begin{abstract}...\\end{abstract} summarizing problem, methods, and findings.",
    },
    {
      id: "lit-title",
      label: hasTitle ? "Manuscript title set" : "Manuscript title missing",
      passed: hasTitle,
      severity: "warning",
      detail: hasTitle
        ? parts.title.slice(0, 90)
        : "Add \\title{...} to frame the manuscript.",
    },
  ];

  const stage1 = finalizeStage({
    id: "literature-framing",
    step: 1,
    title: "Literature & Framing",
    subtitle: "Crossref / arXiv / Springer references, citations, and abstract",
    items: stage1Items,
    recommendedActions: [
      { label: "Open Literature Search", action: "literature" },
    ],
    readySummary: `${totalReferences} references and ${citationCount} citations frame the manuscript cleanly.`,
    progressSummary:
      "Connect bibliography entries, citations, and abstract framing.",
  });

  // -------------------------------------------------------------------------
  // Stage 2: Manuscript Structuring
  // -------------------------------------------------------------------------
  const hasDocumentClass = /\\documentclass\b/.test(maskComments(mainContent));
  const hasDocumentEnv =
    /\\begin\s*\{document\}/.test(maskComments(mainContent)) &&
    /\\end\s*\{document\}/.test(maskComments(mainContent));
  const sectionCount = (
    combinedMaskedTex.match(/\\(?:part|chapter|section|subsection)\*?\s*\{/g) ??
    []
  ).length;
  const mathOrTheoremCount = (
    combinedMaskedTex.match(
      /\\begin\s*\{(?:theorem|lemma|proposition|corollary|definition|remark|proof|equation\*?|align\*?|gather\*?|multline\*?)\}|\\\[/g,
    ) ?? []
  ).length;
  const figureOrTableCount = (
    combinedMaskedTex.match(
      /\\begin\s*\{(?:figure\*?|table\*?|longtable|tikzpicture)\}|\\includegraphics\b/g,
    ) ?? []
  ).length;

  const stage2Items: ResearchStageChecklistItem[] = [
    {
      id: "struct-main-doc",
      label:
        mainFile && hasDocumentClass && hasDocumentEnv
          ? "Main LaTeX skeleton complete"
          : "Main LaTeX skeleton incomplete",
      passed: Boolean(mainFile && hasDocumentClass && hasDocumentEnv),
      severity: mainFile ? "warning" : "blocker",
      detail: mainFile
        ? `${mainFile.path} defines \\documentclass and document environment.`
        : "Select a main .tex file containing \\documentclass and \\begin{document}.",
    },
    {
      id: "struct-sections",
      label:
        sectionCount >= 2
          ? `${sectionCount} structural sections`
          : "Add multi-section structure",
      passed: sectionCount >= 2,
      severity: "warning",
      detail:
        sectionCount >= 2
          ? "Manuscript organizes arguments into multiple \\section blocks."
          : `Found ${sectionCount} section command(s); scholarly papers typically need Introduction, Methods/Theory, Results, and Conclusion.`,
    },
    {
      id: "struct-math-theorems",
      label:
        mathOrTheoremCount > 0
          ? `${mathOrTheoremCount} equations / theorem blocks`
          : "Formal equations or theorems",
      passed: mathOrTheoremCount > 0,
      severity: "info",
      detail:
        mathOrTheoremCount > 0
          ? "Formal mathematical environments and/or numbered equations present."
          : "Add theorem/proof or numbered equation blocks if formalizing analytical claims.",
    },
    {
      id: "struct-figures-tables",
      label:
        figureOrTableCount > 0
          ? `${figureOrTableCount} figure / table elements`
          : "No figures or tables yet",
      passed: figureOrTableCount > 0,
      severity: "info",
      detail:
        figureOrTableCount > 0
          ? "Visual figures, TikZ diagrams, or tables included."
          : "Consider adding booktabs tables or TikZ/PDF figures to present empirical or structural results.",
    },
  ];

  const stage2 = finalizeStage({
    id: "manuscript-structuring",
    step: 2,
    title: "Manuscript Structuring",
    subtitle: "Sections, theorems/equations, figures, and tables",
    items: stage2Items,
    recommendedActions: [{ label: "Open Journal Studio", action: "journal" }],
    readySummary: `${sectionCount} sections, ${mathOrTheoremCount} math/theorem blocks, and ${figureOrTableCount} figures/tables structured.`,
    progressSummary:
      "Organize sections, formal blocks, and visual tables/figures.",
  });

  // -------------------------------------------------------------------------
  // Stage 3: Verification & Hygiene (including Lean 4)
  // -------------------------------------------------------------------------
  const errorDiagnostics = input.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  const buildClean = !input.compileError && errorDiagnostics.length === 0;
  const unresolvedRefs = input.diagnostics.filter(
    (diagnostic) =>
      diagnostic.kind === "undefined-reference" ||
      diagnostic.kind === "undefined-citation",
  );
  const hasTodos = /\b(?:TODO|FIXME|XXX)\b/.test(combinedMaskedTex);
  const hasDraftMode =
    /\\documentclass(?:\s*\[[^\]]*\bdraft\b[^\]]*\])?/.test(
      maskComments(mainContent),
    ) && /\\documentclass\s*\[[^\]]*\bdraft\b/.test(maskComments(mainContent));

  const leanSummaries = summarizeLeanFiles(input.files);
  const hasLeanFiles = leanSummaries.length > 0;
  const leanSummary = {
    fileCount: leanSummaries.length,
    declarationCount: leanSummaries.reduce(
      (sum, item) => sum + item.declarationCount,
      0,
    ),
    sorryCount: leanSummaries.reduce(
      (sum, item) => sum + item.sorryLines.length,
      0,
    ),
    admitCount: leanSummaries.reduce(
      (sum, item) => sum + item.admitLines.length,
      0,
    ),
    axiomCount: leanSummaries.reduce((sum, item) => sum + item.axiomCount, 0),
  };

  const stage3Items: ResearchStageChecklistItem[] = [
    {
      id: "verify-clean-build",
      label: buildClean ? "Clean LaTeX build" : "Compile errors present",
      passed: buildClean,
      severity: "blocker",
      detail: buildClean
        ? "Latest build finished with zero compile errors."
        : (input.compileError ??
          errorDiagnostics[0]?.message ??
          "Resolve LaTeX compile errors before export."),
    },
    {
      id: "verify-fresh-pdf",
      label:
        input.hasFreshPdf === false
          ? "Compiled PDF is stale"
          : "Compiled PDF matches latest source",
      passed: input.hasFreshPdf !== false && buildClean,
      severity: "warning",
      detail:
        input.hasFreshPdf === false
          ? "Source files changed after the last compile; run Compile to refresh the PDF."
          : input.hasFreshPdf === true
            ? "PDF preview is synchronized with the current edits."
            : "Compile state verified with no reported build error.",
    },
    {
      id: "verify-refs",
      label:
        unresolvedRefs.length === 0
          ? "All cross-references and citations resolved"
          : `${unresolvedRefs.length} unresolved reference/citation warning(s)`,
      passed: unresolvedRefs.length === 0,
      severity: "blocker",
      detail:
        unresolvedRefs.length === 0
          ? "Zero undefined \\ref or \\cite diagnostics."
          : unresolvedRefs[0]!.message,
    },
    {
      id: "verify-hygiene",
      label:
        !hasTodos && !hasDraftMode
          ? "No TODO/FIXME or draft flags"
          : "Draft markers or TODO notes remain",
      passed: !hasTodos && !hasDraftMode,
      severity: "warning",
      detail:
        !hasTodos && !hasDraftMode
          ? "Source is free of TODO/FIXME/XXX markers and draft options."
          : `${hasTodos ? "TODO/FIXME markers found. " : ""}${hasDraftMode ? "Remove draft option from \\documentclass." : ""}`.trim(),
    },
  ];

  if (hasLeanFiles) {
    const leanIncomplete = leanSummary.sorryCount + leanSummary.admitCount > 0;
    const leanAdvisory =
      leanSummary.axiomCount > 0 ||
      leanSummaries.some(
        (item) =>
          item.nativeDecideLines.length > 0 || item.unsafe || item.partial,
      );
    stage3Items.push({
      id: "verify-lean4",
      label: leanIncomplete
        ? `Lean 4 proofs incomplete (${leanSummary.sorryCount} sorry, ${leanSummary.admitCount} admit)`
        : leanAdvisory
          ? `Lean 4 proofs checked (${leanSummary.axiomCount} custom axiom(s))`
          : `Lean 4 proofs verified clean (${leanSummary.declarationCount} declarations)`,
      passed: !leanIncomplete && !leanAdvisory,
      severity: leanIncomplete ? "blocker" : "warning",
      detail: leanIncomplete
        ? `Resolve all sorry/admit placeholders across ${leanSummary.fileCount} .lean file(s) before submitting formal verification claims.`
        : leanAdvisory
          ? `Checked ${leanSummary.declarationCount} declarations; review custom axioms, native_decide, or unsafe/partial definitions.`
          : `${leanSummary.fileCount} .lean file(s), ${leanSummary.declarationCount} declarations, 0 sorry/admit.`,
    });
  }

  const stage3Actions: ResearchStageAction[] =
    !buildClean || input.hasFreshPdf === false
      ? [{ label: "Compile Project", action: "compile" }]
      : [];

  const stage3 = finalizeStage({
    id: "verification-hygiene",
    step: 3,
    title: "Verification & Hygiene",
    subtitle: hasLeanFiles
      ? "Clean build, references, hygiene, and Lean 4 proof audit"
      : "Clean build, unresolved references, and draft hygiene",
    items: stage3Items,
    recommendedActions: stage3Actions,
    readySummary: hasLeanFiles
      ? `Clean LaTeX build and ${leanSummary.declarationCount} Lean 4 declarations verified.`
      : "Clean build with zero unresolved references or draft markers.",
    progressSummary: "Clear remaining build, reference, or hygiene checks.",
  });

  // -------------------------------------------------------------------------
  // Stage 4: Preprint Readiness — Priority 1
  // -------------------------------------------------------------------------
  const preprintChecks = evaluatePreprintChecks({
    server: preprintServer,
    files: input.files,
    mainFile,
    compiler: input.compiler,
    hasFreshPdf: input.hasFreshPdf,
  });
  const stage4Items: ResearchStageChecklistItem[] = preprintChecks.map(
    (check) => ({
      id: check.id,
      label: check.title,
      passed: check.status === "pass",
      severity:
        check.status === "blocker"
          ? "blocker"
          : check.status === "warning"
            ? "warning"
            : "info",
      detail: check.detail,
    }),
  );

  const hasArxivReadme = input.files.some(
    (file) => file.path.toLowerCase() === "00readme.json",
  );
  const stage4Actions: ResearchStageAction[] = [
    { label: "Open Submission Readiness", action: "submission" },
  ];
  if (preprintServer === "arxiv" && !hasArxivReadme) {
    stage4Actions.unshift({
      label: "Create 00README.json",
      action: "create-readme",
    });
  }

  const serverLabel = PREPRINT_SERVERS[preprintServer].label;
  const stage4 = finalizeStage({
    id: "preprint-readiness",
    step: 4,
    title: `Preprint Readiness (${serverLabel})`,
    subtitle: `${PREPRINT_SERVERS[preprintServer].primarySubmissionMode === "tex-source" ? "LaTeX source deposit" : "PDF-first deposit"} checks`,
    priorityBadge: "Priority 1",
    items: stage4Items,
    recommendedActions: stage4Actions,
    readySummary: `All ${serverLabel} preprint screening and packaging checks pass.`,
    progressSummary: `Address ${serverLabel} preprint portability or screening checks.`,
  });

  // -------------------------------------------------------------------------
  // Stage 5: Peer-Reviewed Journal Alignment
  // -------------------------------------------------------------------------
  const complianceItems = evaluatePublisherCompliance(
    mainContent,
    input.files,
    effectivePublisher,
  );
  const stage5Items: ResearchStageChecklistItem[] = [
    {
      id: "journal-publisher-template",
      label: effectivePublisher
        ? `Formatted for ${effectivePublisher.name}`
        : "Using generic LaTeX class",
      passed: effectivePublisher !== null,
      severity: "info",
      detail: effectivePublisher
        ? `${effectivePublisher.columns} layout · recommended bibstyle ${effectivePublisher.recommendedBibStyle}.`
        : "Convert in Journal Studio to Elsevier, IEEE, Springer Nature, AMS, ACM, SIAM, APS, or Oxford/Wiley.",
    },
    ...complianceItems.map((item) => ({
      id: item.id,
      label: item.label,
      passed: item.passed,
      severity: (item.passed ? "info" : "warning") as "info" | "warning",
      detail: item.detail,
    })),
  ];

  const needsDeclarations = complianceItems.some(
    (item) =>
      !item.passed &&
      (item.id === "journal-declarations" ||
        item.id === "journal-data-availability" ||
        item.id === "journal-ai-disclosure"),
  );
  const stage5Actions: ResearchStageAction[] = [
    { label: "Open Journal Studio", action: "journal" },
  ];
  if (needsDeclarations) {
    stage5Actions.unshift({
      label: "Insert Journal Declarations",
      action: "insert-declarations",
    });
  }

  const stage5 = finalizeStage({
    id: "journal-alignment",
    step: 5,
    title: "Peer-Reviewed Journal Alignment",
    subtitle:
      "Publisher layout, CRediT, Data Availability, and Generative AI disclosure",
    items: stage5Items,
    recommendedActions: stage5Actions,
    readySummary: effectivePublisher
      ? `Aligned with ${effectivePublisher.name} guidelines and ethical declarations.`
      : "Core journal compliance and ethical disclosures satisfied.",
    progressSummary:
      "Align template formatting, data availability, and AI declarations.",
  });

  // -------------------------------------------------------------------------
  // Stage 6: Submission & Peer-Review Package
  // -------------------------------------------------------------------------
  const hasCoverLetter = input.files.some((file) =>
    /cover[-_]?letter\.tex$/i.test(file.path),
  );
  const hasResponseToReviewers = input.files.some((file) =>
    /(?:response[-_]?to[-_]?reviewers|rebuttal)\.tex$/i.test(file.path),
  );
  const totalBytes = input.files.reduce(
    (sum, file) => sum + fileBytes(file),
    0,
  );
  const bundleWithinLimit = totalBytes <= 50 * 1024 * 1024;

  const stage6Items: ResearchStageChecklistItem[] = [
    {
      id: "pkg-cover-letter",
      label: hasCoverLetter
        ? "cover-letter.tex prepared"
        : "cover-letter.tex missing",
      passed: hasCoverLetter,
      severity: "warning",
      detail: hasCoverLetter
        ? "Editorial cover letter with prior-preprint and compliance disclosures is in the project."
        : "Generate cover-letter.tex in 1 click to introduce manuscript novelty and disclosures to the Editor-in-Chief.",
    },
    {
      id: "pkg-response-reviewers",
      label: hasResponseToReviewers
        ? "response-to-reviewers.tex prepared"
        : "response-to-reviewers.tex missing",
      passed: hasResponseToReviewers,
      severity: "warning",
      detail: hasResponseToReviewers
        ? "Structured referee response letter template is ready for R1/R2 revisions."
        : "Generate response-to-reviewers.tex in 1 click to organize point-by-point referee replies.",
    },
    {
      id: "pkg-arxiv-readme",
      label: hasArxivReadme
        ? "00README.json manifest in project"
        : "00README.json not yet saved in project",
      passed: hasArxivReadme,
      severity: "info",
      detail: hasArxivReadme
        ? "arXiv compiler and toplevel manifest is saved in the workspace."
        : "Create 00README.json so arXiv AutoTeX pins the exact compiler and main file.",
    },
    {
      id: "pkg-bundle-size",
      label: bundleWithinLimit
        ? "Source bundle within 50 MB portal limit"
        : "Source bundle exceeds 50 MB portal limit",
      passed: bundleWithinLimit,
      severity: "blocker",
      detail: `${Math.max(1, Math.round(totalBytes / 1024))} KB across ${input.files.length} workspace file(s).`,
    },
  ];

  const stage6Actions: ResearchStageAction[] = [];
  if (!hasCoverLetter) {
    stage6Actions.push({
      label: "Create cover-letter.tex",
      action: "create-cover-letter",
    });
  }
  if (!hasResponseToReviewers) {
    stage6Actions.push({
      label: "Create response-to-reviewers.tex",
      action: "create-response-letter",
    });
  }
  if (!hasArxivReadme) {
    stage6Actions.push({
      label: "Create 00README.json",
      action: "create-readme",
    });
  }
  stage6Actions.push({
    label: "Open Submission Readiness",
    action: "submission",
  });

  const stage6 = finalizeStage({
    id: "submission-package",
    step: 6,
    title: "Submission & Peer-Review Package",
    subtitle: "cover-letter.tex, response-to-reviewers.tex, and 00README.json",
    items: stage6Items,
    recommendedActions: stage6Actions,
    readySummary:
      "Cover letter, referee response template, and arXiv manifest are all packaged.",
    progressSummary:
      "Generate cover letter, reviewer response template, and export bundle.",
  });

  const stages = [stage1, stage2, stage3, stage4, stage5, stage6];
  const readinessPercent = Math.round(
    stages.reduce((sum, stage) => sum + stage.score, 0) / stages.length,
  );
  const totalBlockers = stages.reduce(
    (sum, stage) => sum + stage.blockers.length,
    0,
  );
  const totalWarnings = stages.reduce(
    (sum, stage) =>
      sum +
      stage.items.filter((item) => !item.passed && item.severity === "warning")
        .length,
    0,
  );

  return {
    readinessPercent,
    mainFilePath: mainFile?.path ?? null,
    detectedPublisherId: effectivePublisher?.id ?? null,
    detectedPublisherName: effectivePublisher?.name ?? null,
    preprintServer,
    hasLeanFiles,
    leanSummary,
    stages,
    totalBlockers,
    totalWarnings,
    metrics: {
      bibEntryCount: totalReferences,
      arxivOrCrossrefEntryCount,
      citationCount,
      sectionCount,
      mathOrTheoremCount,
      figureOrTableCount,
      hasAbstract,
      hasCoverLetter,
      hasResponseToReviewers,
      hasArxivReadme,
    },
  };
}

/**
 * Generates a ready-to-compile LaTeX editorial cover letter for peer-reviewed
 * journal submission, pre-populated with manuscript metadata and prior-preprint
 * / ethical compliance statements.
 */
export function generateCoverLetterTex(
  input: {
    mainContent?: string;
    projectName?: string;
    publisherId?: PublisherId | null;
    preprintServer?: PreprintServerId;
    preprintId?: string;
  } = {},
): string {
  const parts = input.mainContent
    ? extractManuscriptParts(input.mainContent)
    : null;
  const detectedPublisher = input.mainContent
    ? detectPublisherFromContent(input.mainContent)
    : null;
  const publisher =
    (input.publisherId && input.publisherId in PUBLISHER_TEMPLATES
      ? PUBLISHER_TEMPLATES[input.publisherId]
      : null) ?? detectedPublisher;

  const title =
    parts?.title.trim() ||
    input.projectName?.trim() ||
    "Untitled Research Manuscript";
  const authors =
    parts?.authors.trim() || "Corresponding Author and Co-authors";
  const affiliation = parts?.affiliation.trim() || "Department and Institution";
  const email = parts?.email.trim() || "corresponding.author@university.edu";
  const journalName =
    publisher?.exampleJournals[0] ?? "Target Peer-Reviewed Journal";
  const publisherName = publisher?.name ?? "Editorial Board";
  const serverLabel = PREPRINT_SERVERS[input.preprintServer ?? "arxiv"].label;
  const preprintIdentifier = input.preprintId?.trim()
    ? ` (${input.preprintId.trim()})`
    : "";

  return `\\documentclass[11pt]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{parskip}
\\usepackage{hyperref}

\\begin{document}

\\noindent\\textbf{Date:} \\today\\\\
\\textbf{To:} Editor-in-Chief, \\textit{${journalName}} (${publisherName})\\\\
\\textbf{From:} ${authors} (${affiliation})\\\\
\\textbf{Corresponding Email:} \\href{mailto:${email}}{${email}}

\\bigskip
\\noindent\\textbf{Subject:} Manuscript Submission --- \`\`${title}''

\\medskip
Dear Editor-in-Chief,

We are pleased to submit our manuscript entitled \\textit{\`\`${title}''} by ${authors} for consideration as an original research article in \\textit{${journalName}}.

\\paragraph{Summary of Contributions.}
In this work, we address a central open problem in our field and establish new theoretical and empirical guarantees. [Briefly summarize your 2--3 main results and why they fit the journal's readership.]

\\paragraph{Originality and Prior Preprint Disclosure.}
We confirm that this manuscript is original, has not been published in any peer-reviewed venue, and is not under consideration elsewhere. A preliminary preprint version has been (or will be) deposited on ${serverLabel}${preprintIdentifier} in full compliance with publisher preprint-sharing policies.

\\paragraph{Ethics, Data Availability, and Declarations.}
All authors have approved the manuscript and agree with its submission. The authors declare no competing financial or personal interests. Code and data availability details, authorship contributions (CRediT), and generative AI editorial transparency statements are included in the manuscript.

\\medskip
Thank you for your time and consideration. We look forward to the editorial evaluation of our work.

\\bigskip
\\noindent Sincerely,\\\\[0.5em]
${authors}\\\\
${affiliation}\\\\
\\texttt{${email}}

\\end{document}
`;
}

/**
 * Generates a ready-to-compile LaTeX point-by-point response to reviewers
 * template with a summary-of-revisions table and color-coded reply blocks.
 */
export function generateResponseToReviewersTex(
  input: {
    mainContent?: string;
    projectName?: string;
    manuscriptId?: string;
  } = {},
): string {
  const parts = input.mainContent
    ? extractManuscriptParts(input.mainContent)
    : null;
  const title =
    parts?.title.trim() ||
    input.projectName?.trim() ||
    "Untitled Research Manuscript";
  const authors = parts?.authors.trim() || "The Authors";
  const manuscriptId = input.manuscriptId?.trim() || "MS-2025-XXXX";

  return `\\documentclass[11pt]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{booktabs}
\\usepackage{parskip}
\\usepackage{xcolor}
\\usepackage{hyperref}

\\definecolor{revgray}{RGB}{245,245,245}
\\definecolor{respblue}{RGB}{24,78,136}

\\newcommand{\\reviewercomment}[2]{%
  \\par\\medskip
  \\noindent\\colorbox{revgray}{%
    \\parbox{\\dimexpr\\linewidth-2\\fboxsep\\relax}{%
      \\textbf{Comment #1:} #2%
    }%
  }\\par\\smallskip
}

\\newcommand{\\authorresponse}[2]{%
  \\noindent\\textcolor{respblue}{\\textbf{Response:}} #1\\\\
  \\textit{Manuscript change:} #2\\par\\medskip
}

\\begin{document}

\\begin{center}
  {\\Large\\bfseries Response to Reviewers}\\\\[0.5em]
  {\\large \`\`${title}''}\\\\[0.3em]
  {\\normalsize Manuscript ID: \\texttt{${manuscriptId}} \\quad|\\quad Authors: ${authors}}
\\end{center}

\\medskip
Dear Editor and Reviewers,

We sincerely thank the Associate Editor and all reviewers for their thorough reading and constructive comments. We have revised the manuscript carefully to address every concern; all textual modifications are highlighted in the marked-up revision.

\\section*{Summary of Major Revisions}
\\begin{table}[h!]
\\centering
\\begin{tabular}{@{}lll@{}}
\\toprule
Item & Reviewer / Section & Summary of Revision \\\\
\\midrule
R1.1 & Reviewer 1 (Theory) & Clarified assumptions and tightened Theorem~1 proof \\\\
R1.2 & Reviewer 1 (Experiments) & Added baseline comparison and runtime table \\\\
R2.1 & Reviewer 2 (Presentation) & Expanded related-work discussion and fixed notation \\\\
\\bottomrule
\\end{tabular}
\\end{table}

\\section*{Response to Reviewer 1}

\\reviewercomment{1.1}{Please clarify the assumptions required for the main convergence bound and compare against recent preconditioned baselines.}
\\authorresponse{We thank the reviewer for this helpful suggestion. We now state the bounded-conditioning assumption explicitly in Section~2 and added benchmark comparisons in Table~1.}{Updated Section~2 (Assumption~2.1) and added Table~1 in Section~4.}

\\reviewercomment{1.2}{Several symbols in Section~3 are overloaded, and the caption of Figure~1 is brief.}
\\authorresponse{We harmonized the operator notation throughout Section~3 and expanded Figure~1's caption with parameter settings.}{Revised Section~3 and Figure~1 caption.}

\\section*{Response to Reviewer 2}

\\reviewercomment{2.1}{Can the authors discuss reproducibility, runtime scaling, and code availability?}
\\authorresponse{We included asymptotic scaling benchmarks and added an explicit Data and Code Availability section linking our reproducibility scripts.}{Added scaling discussion in Section~4 and Data and Code Availability statement before References.}

\\end{document}
`;
}

/**
 * Generates a publisher-appropriate combined declarations block covering
 * CRediT / Author Contributions, Competing Interests & Funding, Data & Code
 * Availability, Generative AI Disclosure, and optional Prior Preprint notice.
 */
export function generateDeclarationsSnippet(
  publisherId?: PublisherId | null,
  options?: {
    authorName?: string;
    funding?: string;
    repoUrl?: string;
    preprintNote?: boolean;
    serverLabel?: string;
    preprintId?: string;
  },
): string {
  const authorName = options?.authorName?.trim() || "Author Name";
  const funding =
    options?.funding?.trim() || "Supported by institutional research funds.";
  const repoUrl =
    options?.repoUrl?.trim() || "https://doi.org/10.5281/zenodo.XXXXXXX";

  const blocks: string[] = [];

  if (publisherId === "springer-nature") {
    blocks.push(
      `\\bmhead{Declarations}
\\textbf{Funding:} ${funding}
\\textbf{Competing interests:} The authors declare no competing interests.
\\textbf{Author contributions:} ${authorName} contributed to conceptualization, methodology, formal analysis, software, and writing.
\\textbf{Data and code availability:} All code, datasets, and reproducibility scripts are available at \\url{${repoUrl}}.
\\textbf{Generative AI disclosure:} No generative AI tools were used to fabricate data, results, proofs, or citations; any AI-assisted language or typesetting checks were reviewed under full author oversight.`,
    );
  } else {
    if (publisherId === "elsevier") {
      blocks.push(
        `\\section*{CRediT authorship contribution statement}
\\textbf{${authorName}:} Conceptualization, Methodology, Formal analysis, Software, Writing -- original draft, Writing -- review \\& editing.`,
      );
      blocks.push(
        `\\section*{Declaration of competing interest}
The authors declare that they have no known competing financial interests or personal relationships that could have appeared to influence the work reported in this paper.`,
      );
      blocks.push(
        `\\section*{Funding}
${funding}`,
      );
    } else {
      blocks.push(
        `\\section*{Author contributions and declarations}
\\textbf{Author contributions:} ${authorName} contributed to conceptualization, formal analysis, implementation, and manuscript preparation.
\\textbf{Funding:} ${funding}
\\textbf{Competing interests:} The authors declare no competing financial or non-financial interests.`,
      );
    }

    blocks.push(
      `\\section*{Data and code availability}
All data, LaTeX sources, and reproducibility scripts supporting this study are archived at \\url{${repoUrl}} and available upon reasonable request.`,
    );

    blocks.push(
      publisherId === "elsevier"
        ? `\\section*{Declaration of generative AI and AI-assisted technologies in the writing process}
During the preparation of this work, any AI-assisted editorial tooling was used strictly for language clarity and formatting verification under full author oversight; the authors take full responsibility for the content of the publication.`
        : `\\section*{Generative AI and ethics disclosure}
All scientific claims, proofs, data, and citations are the sole responsibility of the authors. Any generative AI assistance during preparation was strictly limited to language polishing and formatting under full human oversight.`,
    );
  }

  if (options?.preprintNote) {
    blocks.push(
      generatePreprintDisclosureSnippet(publisherId, {
        serverLabel: options.serverLabel,
        preprintId: options.preprintId,
      }).trimEnd(),
    );
  }

  return `${blocks.join("\n\n")}\n`;
}

/**
 * Inserts a declarations snippet cleanly before `\bibliographystyle`,
 * `\bibliography`, or `\end{document}` in a LaTeX source document.
 */
export function insertDeclarationsIntoLatex(
  content: string,
  snippet: string,
): string {
  const masked = maskComments(content);
  const candidates = [
    masked.indexOf("\\bibliographystyle"),
    masked.indexOf("\\bibliography"),
    masked.indexOf("\\printbibliography"),
    masked.lastIndexOf("\\end{document}"),
  ].filter((idx) => idx !== -1);

  const pos = candidates.length > 0 ? Math.min(...candidates) : content.length;
  const prefix =
    pos === 0
      ? ""
      : content.slice(0, pos).endsWith("\n\n")
        ? ""
        : content.slice(0, pos).endsWith("\n")
          ? "\n"
          : "\n\n";
  const normalizedSnippet = snippet.endsWith("\n") ? snippet : `${snippet}\n`;
  const suffix =
    pos < content.length && !normalizedSnippet.endsWith("\n\n") ? "\n" : "";

  return `${content.slice(0, pos)}${prefix}${normalizedSnippet}${suffix}${content.slice(pos)}`;
}
