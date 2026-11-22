import { isLatexRelatedFile } from "@/lib/file-kind";
import type { LatexCompiler } from "@/lib/latex-compiler";
import { maskComments } from "@/lib/latex-active";
import {
  applyAllSafeLintFixes,
  type LintProjectFile,
  lintLatexProject,
} from "@/lib/latex-linter";
import {
  detectMainFile,
  getBaseName,
  getExtension,
  getParentPath,
  isLatexDocumentFile,
  mimeTypeForName,
  type ProjectFile,
} from "@/lib/project-files";
import {
  detectPublisherFromContent,
  type PublisherTemplate,
} from "@/lib/publishers";

export const ARCHIVE_EXTENSIONS = [
  ".tar.gz",
  ".tgz",
  ".tar.bz2",
  ".tbz2",
  ".tar.xz",
  ".txz",
  ".zip",
  ".tar",
  ".gz",
  ".rar",
  ".7z",
  ".cpio",
  ".cab",
] as const;

export const CONVERTIBLE_RESEARCH_EXTENSIONS = [
  ".ipynb",
  ".qmd",
  ".rmd",
] as const;

export interface PackageFileCounts {
  total: number;
  tex: number;
  bib: number;
  figures: number;
  styles: number;
  codeAndData: number;
  other: number;
}

export interface PackagePreflightReport {
  projectName: string;
  mainFilePath: string | null;
  recommendedCompiler: LatexCompiler;
  detectedPublisher: PublisherTemplate | null;
  isFullLatexProject: boolean;
  counts: PackageFileCounts;
  missingReferences: string[];
  localClassesAndStyles: string[];
  lintErrorCount: number;
  lintWarningCount: number;
  fixableLintCount: number;
  notes: string[];
}

export function isArchiveFileName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  if (!lower || lower.endsWith(".synctex.gz")) return false;
  return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isConvertibleResearchFileName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return CONVERTIBLE_RESEARCH_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isResearchPackageFileName(name: string): boolean {
  return isArchiveFileName(name) || isConvertibleResearchFileName(name);
}

/**
 * Strictly validates arXiv identifiers and arXiv URLs while rejecting
 * arbitrary third-party URLs to prevent SSRF.
 */
export function parseArxivIdentifier(input: string): string | null {
  const trimmed = input
    .trim()
    .replace(/^arxiv:\s*/i, "")
    .replace(/#.*$/, "")
    .replace(/\?.*$/, "");
  if (!trimmed) return null;

  const urlMatch = trimmed.match(
    /^https?:\/\/(?:export\.)?arxiv\.org\/(?:abs|pdf|e-print|src|html)\/(.+?)(?:\.pdf)?$/i,
  );
  const candidate = (urlMatch ? urlMatch[1] : trimmed)
    .replace(/\.pdf$/i, "")
    .replace(/\/+$/, "");

  // Reject anything that still looks like an arbitrary URL or path traversal
  if (/https?:\/\/|\.\.|[\s<>"'`\\]/i.test(candidate)) {
    return null;
  }

  // Modern format: YYMM.NNNNN(vN) or YYMM.NNNN(vN)
  if (/^\d{4}\.\d{4,5}(?:v\d+)?$/i.test(candidate)) {
    return candidate;
  }

  // Legacy archive format: category/YYMMNNN(vN) or category.XX/YYMMNNN(vN)
  if (/^[a-z-]+(?:\.[a-z-]+)?\/\d{7}(?:v\d+)?$/i.test(candidate)) {
    return candidate;
  }

  return null;
}

function slugifyPackageName(name: string): string {
  const slug = name
    .replace(/\.(?:ipynb|qmd|rmd|md|tex|ltx)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "notebook";
}

function escapeLatexTextForGenerated(text: string): string {
  return text.replace(/\\/g, "\\textbackslash{}").replace(/([%&#_$])/g, "\\$1");
}

function convertInlineMarkdownToLatex(line: string): string {
  // Protect inline math $...$ before escaping or formatting prose
  const mathSpans: string[] = [];
  let working = line.replace(/(?:\$\$[\s\S]+?\$\$|\$[^$\n]+\$)/g, (m) => {
    const idx = mathSpans.length;
    mathSpans.push(m);
    return `ARCANAMATHKEEP${idx}END`;
  });

  // Pandoc citations [@key1; @key2] -> \cite{key1,key2}
  working = working.replace(
    /\[((?:@[a-zA-Z0-9_.:-]+(?:\s*[;,]\s*)?)+)\]/g,
    (_full, rawKeys: string) => {
      const keys = rawKeys
        .split(/[;,]+/)
        .map((k) => k.trim().replace(/^@/, ""))
        .filter(Boolean);
      return keys.length > 0 ? `\\cite{${keys.join(",")}}` : _full;
    },
  );

  // Markdown bold/italic
  working = working
    .replace(/\*\*([^*\n]+)\*\*/g, "\\textbf{$1}")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "\\emph{$1}")
    .replace(/`([^`\n]+)`/g, "\\texttt{$1}");

  // Mask newly created LaTeX commands before escaping % & # _
  const cmdSpans: string[] = [];
  working = working.replace(/\\(?:cite|textbf|emph|texttt)\{[^}]*\}/g, (m) => {
    const idx = cmdSpans.length;
    cmdSpans.push(m);
    return `ARCANACMDKEEP${idx}END`;
  });

  working = working
    .replace(/(?<!\\)%/g, "\\%")
    .replace(/(?<!\\)&/g, "\\&")
    .replace(/(?<!\\)#/g, "\\#")
    .replace(/(?<!\\)_/g, "\\_");

  working = working.replace(
    /ARCANACMDKEEP(\d+)END/g,
    (_full, idx: string) => cmdSpans[Number(idx)] ?? "",
  );
  working = working.replace(
    /ARCANAMATHKEEP(\d+)END/g,
    (_full, idx: string) => mathSpans[Number(idx)] ?? "",
  );
  return working;
}

function convertMarkdownBodyToLatex(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inList: "itemize" | "enumerate" | null = null;
  let inCodeBlock = false;
  let inDisplayMath = false;

  const closeList = () => {
    if (inList) {
      out.push(`\\end{${inList}}`);
      inList = null;
    }
  };

  for (const raw of lines) {
    const trimmed = raw.trim();

    if (/^```/.test(trimmed)) {
      closeList();
      if (!inCodeBlock) {
        out.push("\\begin{verbatim}");
        inCodeBlock = true;
      } else {
        out.push("\\end{verbatim}");
        inCodeBlock = false;
      }
      continue;
    }

    if (inCodeBlock) {
      out.push(raw);
      continue;
    }

    if (/^\$\$/.test(trimmed)) {
      closeList();
      if (trimmed.length > 4 && trimmed.endsWith("$$")) {
        out.push(`\\[\n${trimmed.slice(2, -2).trim()}\n\\]`);
      } else if (!inDisplayMath) {
        out.push("\\[");
        inDisplayMath = true;
      } else {
        out.push("\\]");
        inDisplayMath = false;
      }
      continue;
    }

    if (inDisplayMath) {
      out.push(raw);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      const headingText = convertInlineMarkdownToLatex(headingMatch[2].trim());
      if (level === 1) out.push(`\\section{${headingText}}`);
      else if (level === 2) out.push(`\\subsection{${headingText}}`);
      else out.push(`\\subsubsection{${headingText}}`);
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bulletMatch) {
      if (inList === "enumerate") closeList();
      if (!inList) {
        out.push("\\begin{itemize}");
        inList = "itemize";
      }
      out.push(`  \\item ${convertInlineMarkdownToLatex(bulletMatch[1])}`);
      continue;
    }

    const enumMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (enumMatch) {
      if (inList === "itemize") closeList();
      if (!inList) {
        out.push("\\begin{enumerate}");
        inList = "enumerate";
      }
      out.push(`  \\item ${convertInlineMarkdownToLatex(enumMatch[1])}`);
      continue;
    }

    if (!trimmed) {
      closeList();
      out.push("");
      continue;
    }

    closeList();
    out.push(convertInlineMarkdownToLatex(trimmed));
  }

  closeList();
  if (inCodeBlock) out.push("\\end{verbatim}");
  if (inDisplayMath) out.push("\\]");

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sourceToString(src: unknown): string {
  if (typeof src === "string") return src;
  if (Array.isArray(src)) {
    return src
      .filter((item): item is string => typeof item === "string")
      .join("");
  }
  return "";
}

function utf8ToBase64BrowserSafe(str: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf-8").toString("base64");
  }
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a Jupyter Notebook (.ipynb) JSON file into a LaTeX manuscript,
 * companion Python/R script containing all code cells, and extracted figure assets.
 */
export function convertIpynbToLatexPackage(
  rawJson: string,
  baseName: string,
): { files: Omit<ProjectFile, "id">[]; notes: string[] } {
  const slug = slugifyPackageName(baseName);
  const notes: string[] = [];

  let parsed: {
    cells?: Array<{
      cell_type?: string;
      source?: unknown;
      outputs?: Array<{
        output_type?: string;
        data?: Record<string, unknown>;
        text?: unknown;
      }>;
    }>;
    metadata?: {
      kernelspec?: { language?: string; display_name?: string };
      title?: string;
    };
  };

  try {
    parsed = JSON.parse(rawJson) as typeof parsed;
  } catch {
    throw new Error(`Invalid Jupyter Notebook JSON in ${baseName}.`);
  }

  const cells = Array.isArray(parsed.cells) ? parsed.cells : [];
  const kernelLang =
    parsed.metadata?.kernelspec?.language?.toLowerCase() ?? "python";
  const isRLang = kernelLang === "r";

  const generatedFiles: Omit<ProjectFile, "id">[] = [];
  const texBody: string[] = [];
  const scriptChunks: string[] = [];
  let figCounter = 0;
  let notebookTitle =
    typeof parsed.metadata?.title === "string"
      ? parsed.metadata.title.trim()
      : "";

  for (const cell of cells) {
    const cellType = cell.cell_type;
    const src = sourceToString(cell.source).trim();

    if (cellType === "markdown" && src) {
      if (!notebookTitle) {
        const firstH1 = src.match(/^#\s+(.+)$/m);
        if (firstH1) {
          notebookTitle = firstH1[1].trim();
        }
      }
      const converted = convertMarkdownBodyToLatex(src);
      if (converted) texBody.push(converted);
      continue;
    }

    if (cellType === "code" && src) {
      scriptChunks.push(src);
      texBody.push(`\\begin{verbatim}\n${src}\n\\end{verbatim}`);

      const outputs = Array.isArray(cell.outputs) ? cell.outputs : [];
      for (const output of outputs) {
        const data = output.data;
        if (!data || typeof data !== "object") continue;

        let ext: string | null = null;
        let mime: string | null = null;
        let base64Payload: string | null = null;

        if (data["image/png"]) {
          ext = "png";
          mime = "image/png";
          base64Payload = sourceToString(data["image/png"]).replace(/\s+/g, "");
        } else if (data["image/jpeg"]) {
          ext = "jpg";
          mime = "image/jpeg";
          base64Payload = sourceToString(data["image/jpeg"]).replace(
            /\s+/g,
            "",
          );
        } else if (data["image/svg+xml"]) {
          ext = "svg";
          mime = "image/svg+xml";
          const svgText = sourceToString(data["image/svg+xml"]);
          base64Payload = utf8ToBase64BrowserSafe(svgText);
        }

        if (ext && mime && base64Payload) {
          figCounter += 1;
          const figName = `${slug}-fig-${figCounter}.${ext}`;
          const figPath = `figures/${figName}`;
          const rawSvg =
            ext === "svg" ? sourceToString(data["image/svg+xml"]) : undefined;

          generatedFiles.push({
            name: figName,
            path: figPath,
            type: ext === "svg" ? "tex" : "image",
            mimeType: mime,
            dataUrl: `data:${mime};base64,${base64Payload}`,
            ...(rawSvg !== undefined ? { content: rawSvg } : {}),
          });

          if (ext !== "svg") {
            texBody.push(
              `\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.85\\textwidth]{${figPath}}\n  \\caption{Notebook cell output figure ${figCounter}.}\n  \\label{fig:${slug}-${figCounter}}\n\\end{figure}`,
            );
          }
        }
      }
    }
  }

  const resolvedTitle =
    notebookTitle || baseName.replace(/\.ipynb$/i, "") || "Notebook Manuscript";
  const texName = `${slug}.tex`;
  const hasFigures = generatedFiles.some((f) => f.type === "image");

  const texContent = [
    "\\documentclass[11pt]{article}",
    "",
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage{amsmath,amssymb}",
    ...(hasFigures ? ["\\usepackage{graphicx}"] : []),
    "\\usepackage{hyperref}",
    "",
    `\\title{${escapeLatexTextForGenerated(resolvedTitle)}}`,
    "\\author{Notebook Author}",
    "\\date{}",
    "",
    "\\begin{document}",
    "\\maketitle",
    "",
    texBody.length > 0
      ? texBody.join("\n\n")
      : "\\section{Introduction}\n\nConverted from Jupyter Notebook.",
    "",
    "\\end{document}",
    "",
  ].join("\n");

  generatedFiles.unshift({
    name: texName,
    path: texName,
    type: "tex",
    content: texContent,
  });

  if (scriptChunks.length > 0) {
    const scriptExt = isRLang ? "R" : "py";
    const scriptName = `${slug}.${scriptExt}`;
    generatedFiles.push({
      name: scriptName,
      path: `scripts/${scriptName}`,
      type: "tex",
      content: `${scriptChunks.join("\n\n# ---\n\n")}\n`,
    });
  }

  notes.push(
    `Converted Jupyter Notebook (${cells.length} cell(s), ${figCounter} extracted figure(s)).`,
  );

  return { files: generatedFiles, notes };
}

/**
 * Converts Markdown / Quarto (.qmd) / RMarkdown (.Rmd) research drafts with
 * optional YAML frontmatter and Pandoc citations into a clean `.tex` manuscript.
 */
export function convertMarkdownResearchToLatex(
  rawText: string,
  fileName: string,
): { texFile: Omit<ProjectFile, "id">; notes: string[] } {
  const notes: string[] = [];
  let working = rawText.replace(/\r\n/g, "\n");
  let title = "";
  let author = "";
  let abstractText = "";
  let bibliography = "";

  const fmMatch = working.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fmMatch) {
    const yaml = fmMatch[1];
    working = working.slice(fmMatch[0].length);
    const pickField = (key: string): string => {
      const m = yaml.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, "m"));
      return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
    };
    title = pickField("title");
    author = pickField("author");
    abstractText = pickField("abstract");
    bibliography = pickField("bibliography").replace(/\.bib$/i, "");
  }

  const slug = slugifyPackageName(fileName);
  const body = convertMarkdownBodyToLatex(working);
  const resolvedTitle = title || slug.replace(/-/g, " ");

  const docLines: string[] = [
    "\\documentclass[11pt]{article}",
    "",
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage{amsmath,amssymb}",
    "\\usepackage{hyperref}",
    "",
    `\\title{${escapeLatexTextForGenerated(resolvedTitle)}}`,
    `\\author{${escapeLatexTextForGenerated(author || "Research Author")}}`,
    "\\date{}",
    "",
    "\\begin{document}",
    "\\maketitle",
    "",
  ];

  if (abstractText) {
    docLines.push(
      `\\begin{abstract}\n${convertInlineMarkdownToLatex(abstractText)}\n\\end{abstract}`,
      "",
    );
  }

  docLines.push(body || "\\section{Introduction}\n");

  if (bibliography) {
    docLines.push(
      "",
      "\\bibliographystyle{plain}",
      `\\bibliography{${bibliography}}`,
    );
  }

  docLines.push("", "\\end{document}", "");

  notes.push(`Converted ${getBaseName(fileName)} into ${slug}.tex.`);

  return {
    texFile: {
      name: `${slug}.tex`,
      path: `${slug}.tex`,
      type: "tex",
      content: docLines.join("\n").replace(/\n{3,}/g, "\n\n"),
    },
    notes,
  };
}

/**
 * Extracts a human-readable document title from `\title[short]{...}` with
 * brace-balanced parsing and basic LaTeX command stripping.
 */
export function extractLatexTitle(content: string): string | null {
  const masked = maskComments(content);
  const match = masked.match(/\\title(?:\[[^\]]*\])?\s*\{/);
  if (!match || match.index === undefined) return null;

  const braceStart = match.index + match[0].length;
  let depth = 1;
  let end = braceStart;

  while (end < content.length && depth > 0) {
    const ch = content[end];
    if (ch === "\\" && end + 1 < content.length) {
      end += 2;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    end += 1;
  }

  if (depth !== 0) return null;

  const rawTitle = content.slice(braceStart, end - 1);
  const cleaned = rawTitle
    .replace(/\\thanks\s*\{[^{}]*\}/g, "")
    .replace(
      /\\(?:textbf|textit|emph|textrm|textsf|texttt|large|Large|LARGE|huge)\s*\{([^{}]*)\}/g,
      "$1",
    )
    .replace(/\\\\/g, " ")
    .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length >= 2 ? cleaned.slice(0, 80) : null;
}

function normalizeCompilerToken(
  raw: string | undefined,
): LatexCompiler | undefined {
  if (!raw) return undefined;
  const lower = raw.trim().toLowerCase();
  if (lower.includes("xelatex")) return "xelatex";
  if (lower.includes("lualatex")) return "lualatex";
  if (lower.includes("tectonic")) return "tectonic";
  if (lower.includes("pdflatex")) return "pdflatex";
  return undefined;
}

export function parseArxivReadmeDirectives(
  files: Array<Pick<ProjectFile, "path" | "name" | "content">>,
): { toplevel?: string; compiler?: LatexCompiler } {
  const readmeJson = files.find(
    (f) => f.path.toLowerCase() === "00readme.json",
  );
  if (readmeJson?.content) {
    try {
      const parsed = JSON.parse(readmeJson.content) as {
        sources?: Array<{ filename?: string; usage?: string }>;
        process?: { compiler?: string };
        toplevel?: string;
      };
      const topSource = parsed.sources?.find(
        (s) => s.usage === "toplevel" && typeof s.filename === "string",
      );
      return {
        toplevel: topSource?.filename ?? parsed.toplevel,
        compiler: normalizeCompilerToken(parsed.process?.compiler),
      };
    } catch {
      // Ignore malformed JSON and continue to 00README.XXX
    }
  }

  const readmeXxx = files.find((f) => f.path.toLowerCase() === "00readme.xxx");
  if (readmeXxx?.content) {
    const lines = readmeXxx.content.split(/\r?\n/);
    let toplevel: string | undefined;
    let compiler: LatexCompiler | undefined;
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2 && parts[1] === "toplevelfile") {
        toplevel = parts[0];
      } else if (parts[0]?.toLowerCase() === "xelatex") {
        compiler = "xelatex";
      } else if (parts[0]?.toLowerCase() === "lualatex") {
        compiler = "lualatex";
      }
    }
    if (toplevel || compiler) return { toplevel, compiler };
  }

  return {};
}

export function detectRecommendedCompiler(
  files: Array<Pick<ProjectFile, "path" | "name" | "content">>,
  mainFilePath?: string | null,
): LatexCompiler {
  const readme = parseArxivReadmeDirectives(files);
  if (readme.compiler) return readme.compiler;

  const texFiles = files.filter((f) =>
    isLatexDocumentFile({ name: f.name || f.path, type: "tex" }),
  );
  const prioritized = mainFilePath
    ? [
        ...texFiles.filter((f) => f.path === mainFilePath),
        ...texFiles.filter((f) => f.path !== mainFilePath),
      ]
    : texFiles;

  for (const file of prioritized) {
    const content = file.content ?? "";
    const magicMatch = content.match(
      /^\s*%\s*!(?:TeX|TEX)\s+(?:TS-)?program\s*=\s*([a-zA-Z0-9_-]+)/im,
    );
    const magic = normalizeCompilerToken(magicMatch?.[1]);
    if (magic) return magic;
  }

  for (const file of prioritized) {
    const masked = maskComments(file.content ?? "");
    if (
      /\\usepackage(?:\[[^\]]*\])?\{[^}]*\b(?:fontspec|unicode-math|xeCJK|polyglossia)\b[^}]*\}/.test(
        masked,
      )
    ) {
      return "xelatex";
    }
    if (
      /\\usepackage(?:\[[^\]]*\])?\{[^}]*\b(?:luacode|luatexbase)\b[^}]*\}|\\directlua\b/.test(
        masked,
      )
    ) {
      return "lualatex";
    }
  }

  return "pdflatex";
}

function normalizeRelPath(baseDir: string, refTarget: string): string {
  const clean = refTarget.trim().replace(/^\.\//, "").replace(/^\/+/, "");
  if (!baseDir) return clean;
  const segments = `${baseDir}/${clean}`.split("/").filter(Boolean);
  const stack: string[] = [];
  for (const seg of segments) {
    if (seg === "..") stack.pop();
    else if (seg !== ".") stack.push(seg);
  }
  return stack.join("/");
}

function referenceExistsInPackage(
  allPathsLower: Set<string>,
  texFilePath: string,
  target: string,
  candidateExts: string[],
): boolean {
  const clean = target.trim();
  if (!clean || /^https?:\/\//i.test(clean)) return true;

  const dir = getParentPath(texFilePath);
  const candidates = [
    clean.replace(/^\.\//, "").replace(/^\/+/, "").toLowerCase(),
    normalizeRelPath(dir, clean).toLowerCase(),
  ];

  for (const base of candidates) {
    if (allPathsLower.has(base)) return true;
    for (const ext of candidateExts) {
      if (allPathsLower.has(`${base}${ext}`)) return true;
    }
  }
  return false;
}

export function analyzeImportedPackage(
  files: Omit<ProjectFile, "id">[],
  fallbackName: string,
): PackagePreflightReport {
  const directives = parseArxivReadmeDirectives(files);
  const tempFiles: ProjectFile[] = files.map((f, idx) => ({
    ...f,
    id: `pkg-${idx}`,
  }));

  const directiveMain = directives.toplevel
    ? files.find(
        (f) =>
          f.path === directives.toplevel ||
          f.path.toLowerCase() === directives.toplevel?.toLowerCase(),
      )
    : undefined;
  const detectedMain = detectMainFile(tempFiles);
  const mainFile = directiveMain ?? detectedMain;
  const mainFilePath = mainFile?.path ?? null;

  const recommendedCompiler = detectRecommendedCompiler(files, mainFilePath);
  const detectedPublisher = mainFile?.content
    ? detectPublisherFromContent(mainFile.content)
    : null;

  const extractedTitle = mainFile?.content
    ? extractLatexTitle(mainFile.content)
    : null;
  const projectName = (
    extractedTitle ||
    fallbackName.trim() ||
    "Imported Project"
  ).slice(0, 80);

  const counts: PackageFileCounts = {
    total: files.length,
    tex: 0,
    bib: 0,
    figures: 0,
    styles: 0,
    codeAndData: 0,
    other: 0,
  };
  const localClassesAndStyles: string[] = [];

  for (const file of files) {
    const ext = getExtension(file.path || file.name);
    if (ext === "tex" || ext === "ltx") {
      counts.tex += 1;
    } else if (ext === "bib" || ext === "bbl") {
      counts.bib += 1;
    } else if (
      ext === "cls" ||
      ext === "sty" ||
      ext === "bst" ||
      ext === "bbx" ||
      ext === "cbx" ||
      ext === "lbx"
    ) {
      counts.styles += 1;
      localClassesAndStyles.push(file.path);
    } else if (
      file.type === "image" ||
      ["png", "jpg", "jpeg", "svg", "eps"].includes(ext) ||
      (ext === "pdf" && !file.content)
    ) {
      counts.figures += 1;
    } else if (
      [
        "py",
        "r",
        "rmd",
        "qmd",
        "csv",
        "tsv",
        "json",
        "dat",
        "ipynb",
        "md",
      ].includes(ext)
    ) {
      counts.codeAndData += 1;
    } else {
      counts.other += 1;
    }
  }

  // Audit missing \input, \include, \includegraphics, \bibliography, \addbibresource
  const allPathsLower = new Set(files.map((f) => f.path.toLowerCase()));
  const missingSet = new Set<string>();
  const graphicsExts = [".pdf", ".png", ".jpg", ".jpeg", ".eps", ".svg"];
  const texExts = [".tex", ".ltx"];
  const bibExts = [".bib", ".bbl"];

  for (const file of files) {
    if (!isLatexDocumentFile({ name: file.name, type: file.type })) continue;
    const masked = maskComments(file.content ?? "");

    for (const m of masked.matchAll(/\\(?:input|include)\s*\{([^}]+)\}/g)) {
      const target = m[1].trim();
      if (
        target &&
        !target.includes("#") &&
        !referenceExistsInPackage(allPathsLower, file.path, target, texExts)
      ) {
        missingSet.add(target);
      }
    }

    for (const m of masked.matchAll(
      /\\includegraphics(?:\[[^\]]*\])?\s*\{([^}]+)\}/g,
    )) {
      const target = m[1].trim();
      if (
        target &&
        !target.includes("#") &&
        !referenceExistsInPackage(
          allPathsLower,
          file.path,
          target,
          graphicsExts,
        )
      ) {
        missingSet.add(target);
      }
    }

    for (const m of masked.matchAll(
      /\\(?:bibliography|addbibresource(?:\[[^\]]*\])?)\s*\{([^}]+)\}/g,
    )) {
      const rawList = m[1].split(",").map((s) => s.trim());
      for (const target of rawList) {
        if (
          target &&
          !target.includes("#") &&
          !referenceExistsInPackage(allPathsLower, file.path, target, bibExts)
        ) {
          missingSet.add(target);
        }
      }
    }
  }

  const lintInput: LintProjectFile[] = files
    .filter((f) => isLatexRelatedFile({ name: f.name, path: f.path }))
    .map((f) => ({
      path: f.path,
      name: f.name,
      type: f.type,
      content: f.content ?? "",
    }));
  const lintSummary = lintLatexProject(lintInput);
  const fixableLintCount = lintSummary.issues.filter((i) =>
    Boolean(i.fix),
  ).length;

  const isFullLatexProject = Boolean(
    mainFile &&
      counts.tex > 0 &&
      /\\documentclass\b|\\begin\{document\}/.test(
        maskComments(mainFile.content ?? ""),
      ),
  );

  const notes: string[] = [];
  if (directives.toplevel) {
    notes.push(`Main file from 00README: ${directives.toplevel}`);
  }
  if (detectedPublisher) {
    notes.push(`Detected publisher class: ${detectedPublisher.shortName}`);
  }
  if (localClassesAndStyles.length > 0) {
    notes.push(
      `Includes ${localClassesAndStyles.length} custom class/style file(s)`,
    );
  }
  if (missingSet.size > 0) {
    notes.push(`${missingSet.size} referenced asset(s) missing from archive`);
  }

  return {
    projectName,
    mainFilePath,
    recommendedCompiler,
    detectedPublisher,
    isFullLatexProject,
    counts,
    missingReferences: Array.from(missingSet),
    localClassesAndStyles,
    lintErrorCount: lintSummary.counts.error,
    lintWarningCount: lintSummary.counts.warning,
    fixableLintCount,
    notes,
  };
}

export function applySafePackageFixes(files: Omit<ProjectFile, "id">[]): {
  files: Omit<ProjectFile, "id">[];
  fixedCount: number;
} {
  const lintInput: LintProjectFile[] = files.map((f) => ({
    path: f.path,
    name: f.name,
    type: f.type,
    content: f.content ?? "",
  }));
  const lintResult = lintLatexProject(lintInput);
  let fixedCount = 0;

  const nextFiles = files.map((file) => {
    if (!isLatexDocumentFile({ name: file.name, type: file.type })) {
      return file;
    }
    const issues = lintResult.byFile[file.path] ?? [];
    const safeIssues = issues.filter((i) => Boolean(i.fix));
    if (safeIssues.length === 0) return file;

    const current = file.content ?? "";
    const patched = applyAllSafeLintFixes(current, safeIssues);
    if (patched !== current) {
      fixedCount += safeIssues.length;
      return { ...file, content: patched };
    }
    return file;
  });

  return { files: nextFiles, fixedCount };
}

export { getBaseName, getExtension, mimeTypeForName };
