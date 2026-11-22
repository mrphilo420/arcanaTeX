import { maskComments } from "@/lib/latex-active";
import type { LatexCompiler } from "@/lib/latex-compiler";
import { isLatexDocumentFile, type ProjectFile } from "@/lib/project-files";

export type PreprintServerId = "arxiv" | "biorxiv" | "hal-osf";

export type PreprintSubmissionMode = "tex-source" | "pdf-first";

export type PreprintCheckStatus = "pass" | "warning" | "blocker";

export type PreprintCheckCategory =
  | "structure"
  | "build"
  | "references"
  | "figures"
  | "portability"
  | "hygiene"
  | "anonymity";

export interface PreprintCheckItem {
  id: string;
  category: PreprintCheckCategory;
  status: PreprintCheckStatus;
  title: string;
  detail: string;
  filePath?: string;
  line?: number;
}

export interface PreprintServerMetadata {
  id: PreprintServerId;
  label: string;
  shortLabel: string;
  tagline: string;
  primarySubmissionMode: PreprintSubmissionMode;
  licenseSummary: string;
  screeningSummary: string;
  keyRules: string[];
}

export const PREPRINT_SERVERS: Record<
  PreprintServerId,
  PreprintServerMetadata
> = {
  arxiv: {
    id: "arxiv",
    label: "arXiv",
    shortLabel: "arXiv",
    tagline:
      "Physics, Mathematics, CS, Quantitative Biology & Finance — LaTeX source bundle",
    primarySubmissionMode: "tex-source",
    licenseSummary:
      "arXiv non-exclusive perpetual license plus optional CC BY 4.0, CC BY-SA 4.0, or CC0.",
    screeningSummary:
      "AutoTeX compiles submitted LaTeX sources with pre-built .bbl files; moderation verifies scope, scholarly formatting, and text extractability.",
    keyRules: [
      "Place the main .tex file at the archive root and bundle 00README.json to pin the TeX engine.",
      "Include the compiled .bbl file whenever \\bibliography{...} is used (arXiv does not run BibTeX).",
      "Avoid \\usepackage[...]{hyperref} option clashes; load \\usepackage{hyperref} then call \\hypersetup{...}.",
      "Disable shell-escape features (minted, \\write18, \\tikzexternalize) and avoid spaces or absolute paths.",
    ],
  },
  biorxiv: {
    id: "biorxiv",
    label: "bioRxiv / medRxiv",
    shortLabel: "bioRxiv / medRxiv",
    tagline:
      "Life Sciences & Health Sciences — PDF-first manuscript deposit with ethics and data screening",
    primarySubmissionMode: "pdf-first",
    licenseSummary:
      "Author selects CC BY 4.0, CC BY-NC 4.0, CC BY-ND 4.0, CC0, or all rights reserved.",
    screeningSummary:
      "PDF-first intake screens for completeness, plagiarism, Ethics/IRB & clinical trial registration (medRxiv), Data Availability, and Competing Interests.",
    keyRules: [
      "Upload a fresh compiled PDF as the primary manuscript (PDF-first submission).",
      "Include a clear Data Availability Statement with repository links or access conditions.",
      "State Competing Interests, Funding sources, and Author Contributions explicitly.",
      "For human/patient or clinical studies, include Ethics/IRB approval and trial registration IDs.",
    ],
  },
  "hal-osf": {
    id: "hal-osf",
    label: "HAL / OSF / ChemRxiv",
    shortLabel: "HAL / OSF / ChemRxiv",
    tagline:
      "Multidisciplinary open archives, chemistry, and social sciences — PDF + metadata deposit",
    primarySubmissionMode: "pdf-first",
    licenseSummary:
      "CC BY 4.0 or CC0 recommended; repositories mint persistent DOIs and archival records.",
    screeningSummary:
      "Checks domain classification/keywords, full institutional affiliations with ORCID iDs, explicit open license notice, and linked code/data DOIs.",
    keyRules: [
      "Provide keywords or subject classifications for repository indexing.",
      "Include full institutional affiliations and ORCID iDs for author disambiguation.",
      "State the open license (e.g., CC BY 4.0) or preprint non-peer-reviewed status notice.",
      "Link supporting code/data repositories (Zenodo, OSF, GitHub, or persistent DOI).",
    ],
  },
};

export const PREPRINT_SERVER_LIST: PreprintServerMetadata[] = [
  PREPRINT_SERVERS.arxiv,
  PREPRINT_SERVERS.biorxiv,
  PREPRINT_SERVERS["hal-osf"],
];

const ARTIFACT_EXTENSIONS = new Set([
  "aux",
  "log",
  "out",
  "toc",
  "lof",
  "lot",
  "fls",
  "fdb_latexmk",
  "synctex.gz",
  "bcf",
  "run.xml",
  "nav",
  "snm",
  "vrb",
  "blg",
  "gz",
  "idx",
  "ind",
  "ilg",
  "glo",
  "gls",
  "loa",
  "lol",
  "bak",
  "tmp",
]);

function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index + 1).toLowerCase();
}

function lineFor(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

/**
 * Generates an arXiv-compliant `00README.json` manifest pinning the toplevel
 * LaTeX source file and compiler engine.
 */
export function generateArxivReadmeJson(
  mainFilePath: string,
  compiler: LatexCompiler,
): string {
  const cleanMain = mainFilePath.replace(/^\/+/, "").trim() || "main.tex";
  const arxivCompiler =
    compiler === "xelatex" || compiler === "lualatex" ? compiler : "pdflatex";

  return `${JSON.stringify(
    {
      process: {
        compiler: arxivCompiler,
      },
      sources: [
        {
          filename: cleanMain,
          usage: "toplevel",
        },
      ],
    },
    null,
    2,
  )}\n`;
}

export interface EvaluatePreprintChecksInput {
  server: PreprintServerId;
  files: ProjectFile[];
  mainFile: ProjectFile | null;
  compiler: LatexCompiler;
  hasFreshPdf?: boolean;
}

function collectTexFiles(
  files: ProjectFile[],
  mainFile: ProjectFile | null,
): ProjectFile[] {
  const texFiles = files.filter(
    (file) => file.type === "tex" && isLatexDocumentFile(file),
  );
  if (
    mainFile &&
    mainFile.type === "tex" &&
    !texFiles.some((candidate) => candidate.id === mainFile.id)
  ) {
    return [mainFile, ...texFiles];
  }
  return texFiles;
}

function findFirstMatchInTexFiles(
  texFiles: ProjectFile[],
  pattern: RegExp,
): { filePath: string; line: number; match: RegExpMatchArray } | null {
  for (const file of texFiles) {
    const raw = file.content ?? "";
    const masked = maskComments(raw);
    const match = masked.match(pattern);
    if (match && match.index !== undefined) {
      return {
        filePath: file.path,
        line: lineFor(raw, match.index),
        match,
      };
    }
  }
  return null;
}

function evaluateArxivChecks(
  files: ProjectFile[],
  texFiles: ProjectFile[],
  mainFile: ProjectFile | null,
  compiler: LatexCompiler,
): PreprintCheckItem[] {
  const checks: PreprintCheckItem[] = [];
  const mainPath = mainFile?.path;
  const combinedMasked = texFiles
    .map((file) => maskComments(file.content ?? ""))
    .join("\n");

  if (mainFile) {
    const isNested = mainFile.path.includes("/");
    checks.push({
      id: "arxiv-main-root",
      category: "portability",
      status: isNested ? "warning" : "pass",
      title: isNested
        ? "Main file is nested in a subdirectory"
        : "Main .tex file is at project root",
      detail: isNested
        ? `${mainFile.path} is inside a folder; arXiv AutoTeX expects the toplevel .tex file at the archive root (or pinned in 00README.json).`
        : `${mainFile.path} sits at the archive root for AutoTeX.`,
      filePath: mainFile.path,
    });
  }

  const badFilenames = files
    .filter((file) => !ARTIFACT_EXTENSIONS.has(extensionOf(file.path)))
    .filter(
      (file) => /\s/.test(file.path) || /[^A-Za-z0-9._/-]/.test(file.path),
    );

  checks.push({
    id: "arxiv-filenames",
    category: "portability",
    status: badFilenames.length > 0 ? "warning" : "pass",
    title:
      badFilenames.length > 0
        ? "Filenames contain spaces or special characters"
        : "Project filenames are arXiv-safe",
    detail:
      badFilenames.length > 0
        ? `Rename files to use only ASCII letters, digits, '.', '-', and '_' (${badFilenames
            .slice(0, 3)
            .map((file) => file.path)
            .join(", ")}).`
        : "All project paths use clean ASCII characters without spaces.",
    filePath: badFilenames[0]?.path,
  });

  const absHits: Array<{ filePath: string; line: number; target: string }> = [];
  const pathCmdRegex =
    /\\(?:includegraphics|input|include)(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/g;
  for (const file of texFiles) {
    const raw = file.content ?? "";
    const masked = maskComments(raw);
    for (const match of masked.matchAll(pathCmdRegex)) {
      const target = match[1]?.trim() ?? "";
      if (/^(?:\/|~\/|[A-Za-z]:[\\/]|file:\/\/)/i.test(target)) {
        absHits.push({
          filePath: file.path,
          line: lineFor(raw, match.index ?? 0),
          target,
        });
      }
    }
  }

  checks.push({
    id: "arxiv-absolute-paths",
    category: "portability",
    status: absHits.length > 0 ? "blocker" : "pass",
    title:
      absHits.length > 0
        ? "Absolute path detected in \\includegraphics or \\input"
        : "No absolute file paths in LaTeX commands",
    detail:
      absHits.length > 0
        ? `Replace absolute path "${absHits[0]!.target}" with a project-relative path before uploading to arXiv.`
        : "All \\includegraphics, \\input, and \\include paths are relative.",
    filePath: absHits[0]?.filePath,
    line: absHits[0]?.line,
  });

  const bibHit = findFirstMatchInTexFiles(texFiles, /\\bibliography\s*\{/);
  const hasInlineTheBib = /\\begin\s*\{thebibliography\}/.test(combinedMasked);
  const bblFiles = files.filter((file) =>
    file.path.toLowerCase().endsWith(".bbl"),
  );
  if (bibHit && !hasInlineTheBib) {
    const expectedBbl = mainFile
      ? `${mainFile.path.replace(/\.(tex|ltx)$/i, "")}.bbl`
      : "main.bbl";
    const hasExpectedBbl =
      bblFiles.some((file) => file.path === expectedBbl) || bblFiles.length > 0;
    checks.push({
      id: "arxiv-bbl",
      category: "references",
      status: hasExpectedBbl ? "pass" : "warning",
      title: hasExpectedBbl
        ? "Compiled .bbl file included for arXiv"
        : "Pre-compiled .bbl file missing for arXiv",
      detail: hasExpectedBbl
        ? `Found ${bblFiles.map((file) => file.path).join(", ")} alongside \\bibliography{...}.`
        : `arXiv does not execute BibTeX during upload. Compile locally and include ${expectedBbl} (or inline \\begin{thebibliography}) in your source bundle.`,
      filePath: bibHit.filePath,
      line: bibHit.line,
    });
  } else {
    checks.push({
      id: "arxiv-bbl",
      category: "references",
      status: "pass",
      title: "Bibliography packaging ready for arXiv",
      detail: hasInlineTheBib
        ? "Inline thebibliography environment detected."
        : "No external BibTeX \\bibliography command requires a .bbl file.",
      filePath: mainPath,
    });
  }

  const biblatexHit = findFirstMatchInTexFiles(
    texFiles,
    /\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*\])?\s*\{[^}]*\bbiblatex\b|\\addbibresource(?:\s*\[[^\]]*\])?\s*\{/,
  );
  if (biblatexHit) {
    checks.push({
      id: "arxiv-biblatex",
      category: "references",
      status: "warning",
      title: "biblatex TeX Live version advisory for arXiv",
      detail:
        "arXiv uses a pinned TeX Live distribution and does not run biber; uploaded .bbl files from newer biblatex releases frequently fail with version-mismatch errors. Match arXiv's biblatex version or use BibTeX.",
      filePath: biblatexHit.filePath,
      line: biblatexHit.line,
    });
  }

  const hyperrefClashHit = findFirstMatchInTexFiles(
    texFiles,
    /\\(?:usepackage|RequirePackage)\s*\[[^\]]+\]\s*\{[^}]*\bhyperref\b[^}]*\}/,
  );
  if (hyperrefClashHit) {
    checks.push({
      id: "arxiv-hyperref-clash",
      category: "portability",
      status: "warning",
      title: "Potential hyperref option clash on arXiv",
      detail:
        "arXiv AutoTeX or publisher classes may preload hyperref. Replace \\usepackage[...]{hyperref} with \\usepackage{hyperref} followed by \\hypersetup{...}.",
      filePath: hyperrefClashHit.filePath,
      line: hyperrefClashHit.line,
    });
  } else {
    checks.push({
      id: "arxiv-hyperref-clash",
      category: "portability",
      status: "pass",
      title: "No \\usepackage[...]{hyperref} option clash",
      detail:
        "hyperref is not loaded with bracket options that conflict with AutoTeX.",
      filePath: mainPath,
    });
  }

  const loadsAmsymb =
    /\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*\])?\s*\{[^}]*\b(?:amssymb|amsfonts)\b/.test(
      combinedMasked,
    );
  const loadsConflictingMathFont =
    /\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*\])?\s*\{[^}]*\b(?:newtxmath|txfonts|pxfonts|mathdesign|stix2?|mtpro2)\b|\\documentclass(?:\s*\[[^\]]*\])?\s*\{acmart\}/.test(
      combinedMasked,
    );
  const guardsBbbk = /\\let\s*\\Bbbk\s*\\relax/.test(combinedMasked);
  if (loadsAmsymb && loadsConflictingMathFont && !guardsBbbk) {
    const conflictHit = findFirstMatchInTexFiles(
      texFiles,
      /\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*\])?\s*\{[^}]*\b(?:amssymb|newtxmath|txfonts|pxfonts|mathdesign|stix2?|mtpro2)\b/,
    );
    checks.push({
      id: "arxiv-bbbk-conflict",
      category: "portability",
      status: "warning",
      title: "Potential \\Bbbk package conflict",
      detail:
        "Loading amssymb alongside newtxmath/txfonts/pxfonts/stix or acmart often triggers '! LaTeX Error: Command \\Bbbk already defined'. Guard with \\let\\Bbbk\\relax or remove redundant amssymb.",
      filePath: conflictHit?.filePath ?? mainPath,
      line: conflictHit?.line,
    });
  }

  const shellEscapeHit = findFirstMatchInTexFiles(
    texFiles,
    /\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*\])?\s*\{[^}]*\bminted\b[^}]*\}|\\write18\b|\\ShellEscape\b|\\tikzexternalize\b/,
  );
  if (shellEscapeHit) {
    checks.push({
      id: "arxiv-shell-escape",
      category: "portability",
      status: "warning",
      title: "Shell-escape / minted / TikZ externalization detected",
      detail:
        "arXiv disables --shell-escape. Pre-freeze minted caches (frozencache) and replace \\tikzexternalize with pre-compiled PDF figures.",
      filePath: shellEscapeHit.filePath,
      line: shellEscapeHit.line,
    });
  }

  const readmeJson = files.find(
    (file) => file.path.toLowerCase() === "00readme.json",
  );
  const readmeXxx = files.find(
    (file) => file.path.toLowerCase() === "00readme.xxx",
  );

  if (readmeJson) {
    let validJson = true;
    try {
      const parsed = JSON.parse(readmeJson.content ?? "{}") as {
        process?: { compiler?: string };
        sources?: unknown[];
      };
      validJson = Boolean(
        parsed &&
          typeof parsed === "object" &&
          parsed.process?.compiler &&
          Array.isArray(parsed.sources),
      );
    } catch {
      validJson = false;
    }

    checks.push({
      id: "arxiv-00readme",
      category: "build",
      status: validJson ? "pass" : "warning",
      title: validJson
        ? "arXiv 00README.json manifest present"
        : "arXiv 00README.json appears malformed",
      detail: validJson
        ? "00README.json specifies compiler and toplevel source for AutoTeX."
        : "Regenerate 00README.json so process.compiler and sources are valid JSON.",
      filePath: readmeJson.path,
    });
  } else if (readmeXxx) {
    checks.push({
      id: "arxiv-00readme",
      category: "build",
      status: "pass",
      title: "Legacy 00README.XXX manifest present",
      detail:
        "Consider upgrading to 00README.json to explicitly pin modern TeX engines.",
      filePath: readmeXxx.path,
    });
  } else if (compiler === "xelatex" || compiler === "lualatex") {
    checks.push({
      id: "arxiv-00readme",
      category: "build",
      status: "warning",
      title: `00README.json recommended for ${compiler}`,
      detail: `arXiv defaults to pdfLaTeX unless 00README.json sets process.compiler to "${compiler}". Enable bundling 00README.json or add it to the project.`,
      filePath: mainPath,
    });
  } else if (compiler === "tectonic") {
    checks.push({
      id: "arxiv-00readme",
      category: "build",
      status: "warning",
      title: "Tectonic engine mapped to pdfLaTeX for arXiv",
      detail:
        "arXiv AutoTeX runs pdfLaTeX, XeLaTeX, or LuaLaTeX (not Tectonic). Bundle 00README.json and verify compilation under pdfLaTeX/XeLaTeX.",
      filePath: mainPath,
    });
  } else {
    checks.push({
      id: "arxiv-00readme",
      category: "build",
      status: "pass",
      title: "arXiv 00README.json ready to bundle",
      detail:
        "Can be auto-generated and included in your arXiv ZIP to pin pdfLaTeX and toplevel source.",
      filePath: mainPath,
    });
  }

  return checks;
}

function evaluateBiorxivChecks(
  texFiles: ProjectFile[],
  mainFile: ProjectFile | null,
  hasFreshPdf?: boolean,
): PreprintCheckItem[] {
  const checks: PreprintCheckItem[] = [];
  const mainPath = mainFile?.path;
  const combinedMasked = texFiles
    .map((file) => maskComments(file.content ?? ""))
    .join("\n");

  checks.push({
    id: "biorxiv-fresh-pdf",
    category: "build",
    status: hasFreshPdf === true ? "pass" : "warning",
    title:
      hasFreshPdf === true
        ? "Fresh compiled PDF ready for bioRxiv / medRxiv"
        : "Fresh compiled PDF missing or stale",
    detail:
      hasFreshPdf === true
        ? "Latest manuscript edits match the compiled PDF for PDF-first deposit."
        : "bioRxiv and medRxiv require a PDF-first manuscript upload. Compile the project to generate an up-to-date PDF.",
    filePath: mainPath,
  });

  const hasDataAvailability =
    /(?:data\s*(?:and\s+code\s+)?availability|availability\s+of\s+data|code\s+availability|deposited\s+in\s+(?:zenodo|figshare|dryad|osf|github|geo|ncbi|genbank)|accession\s+(?:number|code))/i.test(
      combinedMasked,
    );
  checks.push({
    id: "biorxiv-data-availability",
    category: "structure",
    status: hasDataAvailability ? "pass" : "warning",
    title: hasDataAvailability
      ? "Data Availability Statement detected"
      : "Data Availability Statement missing",
    detail: hasDataAvailability
      ? "Manuscript includes data/code availability details required at screening."
      : "bioRxiv and medRxiv mandate a Data Availability Statement specifying repository links, accession IDs, or access restrictions.",
    filePath: mainPath,
  });

  const hasCompetingOrFunding =
    /(?:competing\s+(?:financial\s+)?interests?|conflict(?:s)?\s+of\s+interest|funding|financial\s+support|grant\s+(?:number|no\.?|id))/i.test(
      combinedMasked,
    );
  checks.push({
    id: "biorxiv-competing-funding",
    category: "hygiene",
    status: hasCompetingOrFunding ? "pass" : "warning",
    title: hasCompetingOrFunding
      ? "Competing Interests / Funding disclosure present"
      : "Competing Interests or Funding statement missing",
    detail: hasCompetingOrFunding
      ? "Conflict-of-interest and/or funding declaration found."
      : "Add explicit Competing Interests and Funding statements before submitting to bioRxiv or medRxiv.",
    filePath: mainPath,
  });

  const clinicalTriggerHit = findFirstMatchInTexFiles(
    texFiles,
    /\b(?:patient|patients|clinical\s+trial|randomized\s+trial|irb|institutional\s+review\s+board|human\s+subjects?|participants?|informed\s+consent|cohort|biopsy|medical\s+records|animal\s+welfare|iacuc)\b/i,
  );
  const hasEthicsAndTrial =
    /\b(?:irb|institutional\s+review\s+board|ethics\s+(?:committee|approval|board)|declaration\s+of\s+helsinki|informed\s+consent|clinicaltrials\.gov|nct\d{6,}|isrctn\d+|trial\s+registration|iacuc|animal\s+care)\b/i.test(
      combinedMasked,
    );

  if (clinicalTriggerHit) {
    checks.push({
      id: "biorxiv-ethics-trial",
      category: "hygiene",
      status: hasEthicsAndTrial ? "pass" : "warning",
      title: hasEthicsAndTrial
        ? "Ethics / IRB & clinical trial registration statement present"
        : "Ethics / IRB or clinical trial registration missing",
      detail: hasEthicsAndTrial
        ? "Ethics oversight or trial registration identifier detected alongside clinical/participant terms."
        : "Clinical, patient, or participant terms were detected. medRxiv/bioRxiv screening requires an Ethics/IRB approval statement and clinical trial registry ID (e.g., NCT number) where applicable.",
      filePath: clinicalTriggerHit.filePath,
      line: clinicalTriggerHit.line,
    });
  } else {
    checks.push({
      id: "biorxiv-ethics-trial",
      category: "hygiene",
      status: "pass",
      title: "Ethics / IRB & clinical trial screening check",
      detail:
        "No human-subject, patient, or clinical trial terms triggered additional medRxiv ethics gates.",
      filePath: mainPath,
    });
  }

  const hasAuthorContributions =
    /(?:author\s+contributions?|credit\s+authorship|conceptualization.*methodology|contributed\s+to\s+(?:the\s+)?(?:study|manuscript|writing|analysis))/i.test(
      combinedMasked,
    );
  checks.push({
    id: "biorxiv-author-contributions",
    category: "structure",
    status: hasAuthorContributions ? "pass" : "warning",
    title: hasAuthorContributions
      ? "Author Contributions statement present"
      : "Author Contributions statement missing",
    detail: hasAuthorContributions
      ? "Author role / contribution statement detected."
      : "Include an Author Contributions (e.g., CRediT) section detailing each author's role.",
    filePath: mainPath,
  });

  return checks;
}

function evaluateHalOsfChecks(
  texFiles: ProjectFile[],
  mainFile: ProjectFile | null,
): PreprintCheckItem[] {
  const checks: PreprintCheckItem[] = [];
  const mainPath = mainFile?.path;
  const combinedMasked = texFiles
    .map((file) => maskComments(file.content ?? ""))
    .join("\n");

  const hasKeywordsOrClass =
    /\\begin\s*\{(?:keyword|IEEEkeywords|keywords|AMS)\}|\\(?:keywords|subjclass|pacs|ccsdesc|MSC|msc)\b|keywords\s*:/i.test(
      combinedMasked,
    );
  checks.push({
    id: "hal-osf-keywords",
    category: "structure",
    status: hasKeywordsOrClass ? "pass" : "warning",
    title: hasKeywordsOrClass
      ? "Keywords or subject classification present"
      : "Keywords or subject classification missing",
    detail: hasKeywordsOrClass
      ? "Index keywords or subject classification codes detected for repository discovery."
      : "HAL, OSF Preprints, and ChemRxiv expect domain classification and keywords for discoverability.",
    filePath: mainPath,
  });

  const hasAffiliation =
    /\\(?:affil|affiliation|address|institute|institution)\b|\b(?:department\s+of|university\s+of)\b/i.test(
      combinedMasked,
    );
  const hasOrcid =
    /\\orcid(?:link)?\b|orcid\.org\/\d{4}-\d{4}-\d{4}-\d{3}[\dX]|\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b/i.test(
      combinedMasked,
    );
  const missingAffilOrOrcid: string[] = [];
  if (!hasAffiliation) missingAffilOrOrcid.push("institutional affiliation");
  if (!hasOrcid) missingAffilOrOrcid.push("ORCID iD");

  checks.push({
    id: "hal-osf-affiliation-orcid",
    category: "structure",
    status: missingAffilOrOrcid.length === 0 ? "pass" : "warning",
    title:
      missingAffilOrOrcid.length === 0
        ? "Affiliation and ORCID metadata detected"
        : `Missing ${missingAffilOrOrcid.join(" & ")} metadata`,
    detail:
      missingAffilOrOrcid.length === 0
        ? "Author affiliation and ORCID identifier found for repository indexing."
        : `Include ${missingAffilOrOrcid.join(" and ")} metadata for HAL/OSF/ChemRxiv author attribution.`,
    filePath: mainPath,
  });

  const hasOpenLicenseOrPreprintNotice =
    /(?:cc[\s-]*by|creative\s+commons|open\s+access\s+license|mit\s+license|apache\s+2\.0|preprint\s+(?:submitted|posted|not\s+peer[- ]reviewed)|not\s+(?:yet\s+)?peer[- ]reviewed)/i.test(
      combinedMasked,
    );
  checks.push({
    id: "hal-osf-license-disclosure",
    category: "hygiene",
    status: hasOpenLicenseOrPreprintNotice ? "pass" : "warning",
    title: hasOpenLicenseOrPreprintNotice
      ? "Open license or preprint disclosure present"
      : "Open license / preprint disclosure note missing",
    detail: hasOpenLicenseOrPreprintNotice
      ? "License or preprint status note detected."
      : "Specify an explicit open license (e.g., CC BY 4.0) and preprint non-peer-reviewed notice.",
    filePath: mainPath,
  });

  const hasRepoStatement =
    /(?:zenodo|osf\.io|github\.com|gitlab\.com|figshare|dryad|codeocean|software\s+heritage|10\.5281\/zenodo|data\s*(?:and\s+code\s+)?availability|code\s+availability|available\s+at\s+https?:\/\/)/i.test(
      combinedMasked,
    );
  checks.push({
    id: "hal-osf-repository",
    category: "references",
    status: hasRepoStatement ? "pass" : "warning",
    title: hasRepoStatement
      ? "Data / code repository statement detected"
      : "Data / code repository link or DOI missing",
    detail: hasRepoStatement
      ? "Supporting repository or persistent archive reference found."
      : "Reference an archival code/data repository (Zenodo, OSF, GitHub, or DOI) to strengthen reproducibility.",
    filePath: mainPath,
  });

  return checks;
}

/**
 * Evaluates preprint-server-specific readiness checks across arXiv,
 * bioRxiv/medRxiv, and HAL/OSF/ChemRxiv/SSRN.
 */
export function evaluatePreprintChecks(
  input: EvaluatePreprintChecksInput,
): PreprintCheckItem[] {
  const texFiles = collectTexFiles(input.files, input.mainFile);

  switch (input.server) {
    case "arxiv":
      return evaluateArxivChecks(
        input.files,
        texFiles,
        input.mainFile,
        input.compiler,
      );
    case "biorxiv":
      return evaluateBiorxivChecks(texFiles, input.mainFile, input.hasFreshPdf);
    case "hal-osf":
      return evaluateHalOsfChecks(texFiles, input.mainFile);
  }
}
