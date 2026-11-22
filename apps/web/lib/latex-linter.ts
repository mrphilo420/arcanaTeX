import { maskComments } from "@/lib/latex-active";
import { isLatexDocumentFile } from "@/lib/project-files";

export type LintSeverity = "error" | "warning" | "info";

export type LintCategory =
  | "syntax"
  | "math"
  | "references"
  | "typography"
  | "portability"
  | "prose";

export type LintFix = {
  start: number;
  end: number;
  replacement: string;
  label: string;
};

export type LatexLintIssue = {
  id: string;
  code: string;
  severity: LintSeverity;
  category: LintCategory;
  message: string;
  suggestion?: string;
  filePath: string;
  line: number;
  column: number;
  start: number;
  end: number;
  snippet?: string;
  fix?: LintFix;
};

export interface LintProjectFile {
  id?: string;
  path: string;
  name?: string;
  type?: string;
  content?: string | null;
}

export interface LabelLocation {
  label: string;
  filePath: string;
  line: number;
  column: number;
  start: number;
  end: number;
}

export interface LintProjectContext {
  files?: LintProjectFile[];
  labels?: Set<string>;
  labelLocations?: Map<string, LabelLocation[]>;
  bibKeys?: Set<string>;
  hasBibliography?: boolean;
}

export type LintCounts = Record<LintSeverity, number>;

export interface LatexLintProjectResult {
  issues: LatexLintIssue[];
  activeIssues: LatexLintIssue[];
  byFile: Record<string, LatexLintIssue[]>;
  counts: LintCounts;
  activeCounts: LintCounts;
  labels: string[];
  bibKeys: string[];
}

export interface LatexEditIntegrityResult {
  ok: boolean;
  introduced: LatexLintIssue[];
}

interface Span {
  start: number;
  end: number;
}

interface LineIndex {
  starts: number[];
}

const MATH_ENVS = new Set([
  "math",
  "displaymath",
  "equation",
  "equation*",
  "align",
  "align*",
  "alignat",
  "alignat*",
  "flalign",
  "flalign*",
  "gather",
  "gather*",
  "multline",
  "multline*",
  "eqnarray",
  "eqnarray*",
  "split",
  "cases",
  "dcases",
  "rcases",
  "matrix",
  "pmatrix",
  "bmatrix",
  "Bmatrix",
  "vmatrix",
  "Vmatrix",
  "smallmatrix",
  "array",
  "aligned",
  "alignedat",
  "gathered",
]);

const ALIGNMENT_ENVS = new Set([
  "tabular",
  "tabular*",
  "tabularx",
  "longtable",
  "array",
  "align",
  "align*",
  "alignat",
  "alignat*",
  "flalign",
  "flalign*",
  "gather",
  "gather*",
  "multline",
  "multline*",
  "split",
  "cases",
  "dcases",
  "rcases",
  "matrix",
  "pmatrix",
  "bmatrix",
  "Bmatrix",
  "vmatrix",
  "Vmatrix",
  "smallmatrix",
  "aligned",
  "alignedat",
  "gathered",
  "eqnarray",
  "eqnarray*",
  "IEEEeqnarray",
  "IEEEeqnarray*",
  "tikzcd",
  "tikzpicture",
  "xltabular",
  "tabu",
  "supertabular",
  "tblr",
  "longtblr",
  "deluxetable",
  "deluxetable*",
]);

const TEXT_IN_MATH_COMMANDS = new Set([
  "text",
  "textrm",
  "textit",
  "textbf",
  "textsf",
  "texttt",
  "textsc",
  "textup",
  "textsl",
  "mbox",
  "hbox",
  "intertext",
  "shortintertext",
  "tag",
]);

const NON_OPERATOR_ARG_COMMANDS = new Set([
  "text",
  "textrm",
  "textit",
  "textbf",
  "textsf",
  "texttt",
  "textsc",
  "textup",
  "textsl",
  "mbox",
  "hbox",
  "intertext",
  "shortintertext",
  "tag",
  "operatorname",
  "operatorname*",
  "mathrm",
  "mathit",
  "mathbf",
  "mathsf",
  "mathtt",
  "mathcal",
  "mathbb",
  "mathfrak",
  "mathscr",
  "label",
  "ref",
  "eqref",
  "pageref",
  "autoref",
  "cref",
  "Cref",
  "color",
  "textcolor",
]);

const DEFINITION_COMMANDS = new Set([
  "newcommand",
  "renewcommand",
  "providecommand",
  "DeclareMathOperator",
  "DeclareRobustCommand",
  "newenvironment",
  "renewenvironment",
  "def",
  "edef",
  "gdef",
  "xdef",
  "let",
]);

const URL_COMMANDS = new Set(["url", "nolinkurl"]);

const MATH_OPERATORS = new Set([
  "sin",
  "cos",
  "tan",
  "log",
  "ln",
  "exp",
  "lim",
  "max",
  "min",
  "sup",
  "inf",
  "det",
  "dim",
  "ker",
  "arg",
]);

const OBSOLETE_PACKAGES: Record<string, string> = {
  subfigure: "Replace obsolete `subfigure` with `subcaption` (or `subfig`).",
  epsfig: "Replace obsolete `epsfig` with `graphicx` and `\\includegraphics`.",
  times:
    "Replace obsolete `times` with `mathptmx` or `newtxtext,newtxmath` for proper math font support.",
};

const DOUBLED_WORD_WHITELIST = new Set(["had", "that"]);

const INTEGRITY_CODES = new Set(["L01", "L02", "L03", "L04"]);

const SEVERITY_ORDER: Record<LintSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function buildLineIndex(text: string): LineIndex {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      starts.push(i + 1);
    } else if (text[i] === "\r" && text[i + 1] !== "\n") {
      starts.push(i + 1);
    }
  }
  return { starts };
}

function positionAt(
  index: LineIndex,
  offset: number,
): { line: number; column: number } {
  const { starts } = index;
  let lo = 0;
  let hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= offset) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const lineIdx = Math.max(0, hi);
  return {
    line: lineIdx + 1,
    column: offset - starts[lineIdx] + 1,
  };
}

function snippetAt(content: string, index: LineIndex, offset: number): string {
  const { line } = positionAt(index, offset);
  const start = index.starts[line - 1] ?? 0;
  const nextStart =
    line < index.starts.length ? index.starts[line] : content.length;
  let end = nextStart;
  while (
    end > start &&
    (content[end - 1] === "\n" || content[end - 1] === "\r")
  ) {
    end--;
  }
  const raw = content.slice(start, end).trim();
  return raw.length > 140 ? `${raw.slice(0, 137)}...` : raw;
}

function createIssue(
  content: string,
  lineIndex: LineIndex,
  params: {
    code: string;
    severity: LintSeverity;
    category: LintCategory;
    message: string;
    suggestion?: string;
    filePath: string;
    start: number;
    end: number;
    fix?: LintFix;
  },
): LatexLintIssue {
  const clampedStart = Math.max(0, Math.min(params.start, content.length));
  const clampedEnd = Math.max(
    clampedStart,
    Math.min(params.end, content.length),
  );
  const { line, column } = positionAt(lineIndex, clampedStart);
  return {
    id: `${params.code}:${params.filePath}:${line}:${column}:${clampedStart}`,
    code: params.code,
    severity: params.severity,
    category: params.category,
    message: params.message,
    ...(params.suggestion ? { suggestion: params.suggestion } : {}),
    filePath: params.filePath,
    line,
    column,
    start: clampedStart,
    end: clampedEnd,
    snippet: snippetAt(content, lineIndex, clampedStart),
    ...(params.fix ? { fix: params.fix } : {}),
  };
}

function blankPreservingNewlines(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    out += ch === "\n" || ch === "\r" ? ch : " ";
  }
  return out;
}

function fillPreservingNewlines(text: string, fillChar: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    out += ch === "\n" || ch === "\r" ? ch : fillChar;
  }
  return out;
}

function skipBalancedBraces(text: string, openBraceIdx: number): number {
  if (text[openBraceIdx] !== "{") return openBraceIdx;
  let depth = 0;
  let i = openBraceIdx;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return text.length;
}

function skipOptionalBracket(text: string, start: number): number {
  let i = start;
  while (i < text.length && (text[i] === " " || text[i] === "\t")) i++;
  if (text[i] !== "[") return start;
  let depth = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      if (depth > 0) depth--;
    } else if (ch === "]" && depth === 0) {
      return i + 1;
    } else if (ch === "\n" || ch === "\r") {
      return start;
    }
    i++;
  }
  return start;
}

interface MaskedLatex {
  /** Comments and verbatim bodies/inline verb replaced with spaces (same length). */
  masked: string;
  /** Same as masked, except verbatim/\verb spans use `\u0001` sentinel instead of space. */
  sentinelMasked: string;
  verbatimSpans: Span[];
}

/**
 * Masks comments (via `maskComments` from `@/lib/latex-active`) and masks
 * `verbatim`, `verbatim*`, `lstlisting`, `minted` bodies plus `\verb*?|...|`,
 * `\lstinline`, and `\mintinline` spans while keeping offsets 1:1.
 *
 * `%` inside `\verb` or verbatim environments is protected from comment
 * masking, while `\begin{verbatim}` inside a `%` comment is masked by
 * `maskComments` and ignored.
 */
function maskLatexSource(content: string): MaskedLatex {
  let masked = "";
  let sentinelMasked = "";
  const verbatimSpans: Span[] = [];
  let i = 0;

  while (i < content.length) {
    const ch = content[i];

    if (ch === "\\") {
      // Check \verb or \verb*
      if (
        content.startsWith("\\verb", i) &&
        !/^[a-zA-Z]/.test(content[i + 5] ?? "")
      ) {
        let j = i + 5;
        if (content[j] === "*") j++;
        const delim = content[j];
        if (delim && delim !== "\n" && delim !== "\r") {
          let close = j + 1;
          while (
            close < content.length &&
            content[close] !== delim &&
            content[close] !== "\n" &&
            content[close] !== "\r"
          ) {
            close++;
          }
          const end =
            close < content.length && content[close] === delim
              ? close + 1
              : close;
          const spanText = content.slice(i, end);
          masked += blankPreservingNewlines(spanText);
          sentinelMasked += fillPreservingNewlines(spanText, "\u0001");
          verbatimSpans.push({ start: i, end });
          i = end;
          continue;
        }
      }

      // Check \lstinline or \mintinline
      if (
        (content.startsWith("\\lstinline", i) &&
          !/^[a-zA-Z]/.test(content[i + 10] ?? "")) ||
        (content.startsWith("\\mintinline", i) &&
          !/^[a-zA-Z]/.test(content[i + 11] ?? ""))
      ) {
        const isMint = content.startsWith("\\mintinline", i);
        let j = i + (isMint ? 11 : 10);
        j = skipOptionalBracket(content, j);
        while (
          j < content.length &&
          (content[j] === " " || content[j] === "\t")
        ) {
          j++;
        }
        if (isMint && content[j] === "{") {
          j = skipBalancedBraces(content, j);
          while (
            j < content.length &&
            (content[j] === " " || content[j] === "\t")
          ) {
            j++;
          }
        }
        const delim = content[j];
        if (delim === "{") {
          const end = skipBalancedBraces(content, j);
          const spanText = content.slice(i, end);
          masked += blankPreservingNewlines(spanText);
          sentinelMasked += fillPreservingNewlines(spanText, "\u0001");
          verbatimSpans.push({ start: i, end });
          i = end;
          continue;
        }
        if (delim && delim !== "\n" && delim !== "\r") {
          let close = j + 1;
          while (
            close < content.length &&
            content[close] !== delim &&
            content[close] !== "\n" &&
            content[close] !== "\r"
          ) {
            close++;
          }
          if (close < content.length && content[close] === delim) {
            const end = close + 1;
            const spanText = content.slice(i, end);
            masked += blankPreservingNewlines(spanText);
            sentinelMasked += fillPreservingNewlines(spanText, "\u0001");
            verbatimSpans.push({ start: i, end });
            i = end;
            continue;
          }
        }
      }

      // Check \begin{verbatim|verbatim*|lstlisting|minted}
      if (content.startsWith("\\begin", i)) {
        const beginMatch = content
          .slice(i)
          .match(/^\\begin\s*\{(verbatim\*?|lstlisting|minted)\}/);
        if (beginMatch) {
          const envName = beginMatch[1];
          const beginTagEnd = i + beginMatch[0].length;
          let bodyStart = beginTagEnd;
          bodyStart = skipOptionalBracket(content, bodyStart);
          if (envName === "minted") {
            while (
              bodyStart < content.length &&
              (content[bodyStart] === " " || content[bodyStart] === "\t")
            ) {
              bodyStart++;
            }
            if (content[bodyStart] === "{") {
              bodyStart = skipBalancedBraces(content, bodyStart);
            }
          }
          const endRegex = new RegExp(
            `\\\\end\\s*\\{${escapeRegExp(envName)}\\}`,
          );
          const endMatch = endRegex.exec(content.slice(bodyStart));
          const bodyEnd =
            endMatch !== null ? bodyStart + endMatch.index : content.length;

          // Keep \begin{env} visible for L02 environment matching, mask options + body
          const beginTag = content.slice(i, beginTagEnd);
          const bodyText = content.slice(beginTagEnd, bodyEnd);
          masked += beginTag + blankPreservingNewlines(bodyText);
          sentinelMasked +=
            beginTag + fillPreservingNewlines(bodyText, "\u0001");
          if (bodyEnd > beginTagEnd) {
            verbatimSpans.push({ start: beginTagEnd, end: bodyEnd });
          }
          i = bodyEnd;
          continue;
        }
      }

      // Escaped single non-letter symbol (\\, \%, \{, \}, \$, \&, \#, \=, \", etc.)
      if (i + 1 < content.length && !/[a-zA-Z]/.test(content[i + 1])) {
        const pair = content.slice(i, i + 2);
        masked += pair;
        sentinelMasked += pair;
        i += 2;
        continue;
      }

      masked += ch;
      sentinelMasked += ch;
      i++;
      continue;
    }

    if (ch === "%") {
      let eol = i;
      while (
        eol < content.length &&
        content[eol] !== "\n" &&
        content[eol] !== "\r"
      ) {
        eol++;
      }
      const commentBlanked = maskComments(content.slice(i, eol));
      masked += commentBlanked;
      sentinelMasked += commentBlanked;
      i = eol;
      continue;
    }

    masked += ch;
    sentinelMasked += ch;
    i++;
  }

  return { masked, sentinelMasked, verbatimSpans };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSpanCovered(spans: Span[], offset: number): boolean {
  let lo = 0;
  let hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const span = spans[mid];
    if (offset < span.start) hi = mid - 1;
    else if (offset >= span.end) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Collects all active `\label{...}` declarations from a single masked file. */
function collectFileLabels(
  content: string,
  masked: string,
  filePath: string,
  lineIndex: LineIndex,
): LabelLocation[] {
  const found: LabelLocation[] = [];
  const labelRegex = /\\label\s*\{([^}]+)\}/g;
  for (const match of masked.matchAll(labelRegex)) {
    if (match.index === undefined) continue;
    const rawKey = match[1]?.trim() ?? "";
    if (!rawKey || rawKey.includes("#") || rawKey.includes("\\")) continue;
    const start = match.index;
    const end = start + match[0].length;
    const { line, column } = positionAt(lineIndex, start);
    found.push({
      label: rawKey,
      filePath,
      line,
      column,
      start,
      end,
    });
  }
  // Keep `content` unused warning silent if unused; needed only when lineIndex aligns
  void content;
  return found;
}

/** Extracts citation keys from `.bib` content (`@type{key,`) and `\bibitem{key}` in `.tex`. */
export function extractBibKeysFromFile(file: LintProjectFile): string[] {
  const raw = file.content ?? "";
  if (!raw.trim()) return [];
  const keys: string[] = [];
  const lowerPath = file.path.toLowerCase();

  if (lowerPath.endsWith(".bib")) {
    const entryRegex = /@\s*([a-zA-Z]+)\s*[{(]\s*([^,\s{}()]+)\s*,/g;
    for (const match of raw.matchAll(entryRegex)) {
      const entryType = (match[1] ?? "").toLowerCase();
      if (
        entryType === "comment" ||
        entryType === "string" ||
        entryType === "preamble"
      ) {
        continue;
      }
      const key = match[2]?.trim();
      if (key) keys.push(key);
    }
    return keys;
  }

  const { masked } = maskLatexSource(raw);
  const bibItemRegex = /\\bibitem(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/g;
  for (const match of masked.matchAll(bibItemRegex)) {
    const key = match[1]?.trim();
    if (key && !key.includes("#")) keys.push(key);
  }
  return keys;
}

function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

const MAX_LINT_CACHE_ENTRIES = 160;

interface CachedFileMeta {
  content: string;
  length: number;
  hash: string;
  isTex: boolean;
  isBib: boolean;
  labels: LabelLocation[];
  bibKeys: string[];
}

const fileMetaCache = new Map<string, CachedFileMeta>();
const fileHashCache = new Map<string, { content: string; hash: string }>();
const lintProjectFileCache = new Map<
  string,
  { content: string; issues: LatexLintIssue[] }
>();

function touchLru<K, V>(cache: Map<K, V>, key: K, value: V): void {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= MAX_LINT_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

function getFastContentHash(cacheKey: string, content: string): string {
  const existing = fileHashCache.get(cacheKey);
  if (existing && existing.content === content) {
    return existing.hash;
  }
  const hash = fnv1a32(content);
  touchLru(fileHashCache, cacheKey, { content, hash });
  return hash;
}

/**
 * Clears the internal incremental lint caches (primarily for deterministic benchmarks/tests).
 */
export function clearLatexLintCache(): void {
  fileMetaCache.clear();
  fileHashCache.clear();
  lintProjectFileCache.clear();
}

function buildProjectContextFromFiles(
  files: LintProjectFile[],
): Required<
  Pick<
    LintProjectContext,
    "files" | "labels" | "labelLocations" | "bibKeys" | "hasBibliography"
  >
> {
  const labels = new Set<string>();
  const labelLocations = new Map<string, LabelLocation[]>();
  const bibKeys = new Set<string>();

  for (const file of files) {
    const content = file.content ?? "";
    const isBib = file.path.toLowerCase().endsWith(".bib");
    const isTex = isLatexDocumentFile({
      name: file.name ?? file.path,
      type: (file.type as "tex" | "image" | "binary") ?? "tex",
    });

    if (!isBib && !isTex) continue;

    let cached = fileMetaCache.get(file.path);
    if (
      !cached ||
      cached.isTex !== isTex ||
      cached.isBib !== isBib ||
      cached.length !== content.length ||
      cached.content !== content
    ) {
      const hash = fnv1a32(content);
      const extractedBibKeys = extractBibKeysFromFile(file);
      let extractedLabels: LabelLocation[] = [];
      if (isTex) {
        const { masked } = maskLatexSource(content);
        const lineIndex = buildLineIndex(content);
        extractedLabels = collectFileLabels(
          content,
          masked,
          file.path,
          lineIndex,
        );
      }
      cached = {
        content,
        length: content.length,
        hash,
        isTex,
        isBib,
        labels: extractedLabels,
        bibKeys: extractedBibKeys,
      };
      touchLru(fileMetaCache, file.path, cached);
      touchLru(fileHashCache, file.path, { content, hash });
    } else {
      touchLru(fileMetaCache, file.path, cached);
    }

    for (const key of cached.bibKeys) {
      bibKeys.add(key);
    }
    for (const loc of cached.labels) {
      labels.add(loc.label);
      const existing = labelLocations.get(loc.label);
      if (existing) existing.push(loc);
      else labelLocations.set(loc.label, [loc]);
    }
  }

  return {
    files,
    labels,
    labelLocations,
    bibKeys,
    hasBibliography: bibKeys.size > 0,
  };
}

function buildContextCacheKey(
  context: ReturnType<typeof buildProjectContextFromFiles>,
): string {
  const labelSig = [...context.labelLocations.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([label, locs]) =>
        `${label}:${locs
          .map((loc) => `${loc.filePath}@${loc.line}`)
          .sort()
          .join(",")}`,
    )
    .join(";");
  const bibSig = [...context.bibKeys].sort().join(",");
  return fnv1a32(
    `${context.hasBibliography ? "1" : "0"}|${labelSig}|${bibSig}`,
  );
}

interface EnvEntry {
  env: string;
  start: number;
  end: number;
}

/**
 * Checks L01 (braces) and L02 (begin/end environments), plus returns
 * environment spans for alignment/math awareness and document boundaries for L09.
 */
function analyzeBracesAndEnvironments(
  content: string,
  masked: string,
  filePath: string,
  lineIndex: LineIndex,
  issues: LatexLintIssue[],
): {
  alignmentSpans: Span[];
  documentStart: number;
  endDocumentSpan: Span | null;
  hasBeginDocument: boolean;
} {
  // L01: Braces
  const braceStack: number[] = [];
  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === "\\") {
      if (i + 1 < masked.length && !/[a-zA-Z]/.test(masked[i + 1])) {
        i++;
      }
      continue;
    }
    if (ch === "{") {
      braceStack.push(i);
    } else if (ch === "}") {
      if (braceStack.length === 0) {
        issues.push(
          createIssue(content, lineIndex, {
            code: "L01",
            severity: "error",
            category: "syntax",
            message: "Unexpected closing brace '}' without a matching '{'.",
            suggestion: "Remove the extra '}' or add its opening '{'.",
            filePath,
            start: i,
            end: i + 1,
          }),
        );
      } else {
        braceStack.pop();
      }
    }
  }
  for (const openIdx of braceStack) {
    issues.push(
      createIssue(content, lineIndex, {
        code: "L01",
        severity: "error",
        category: "syntax",
        message: "Unclosed opening brace '{'.",
        suggestion: "Add a matching '}' to close this group.",
        filePath,
        start: openIdx,
        end: openIdx + 1,
      }),
    );
  }

  // L02 & L09: \begin{env} / \end{env}
  const envTokens: {
    kind: "begin" | "end";
    env: string;
    start: number;
    end: number;
  }[] = [];

  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === "\\") {
      if (i + 1 < masked.length && !/[a-zA-Z]/.test(masked[i + 1])) {
        i++;
        continue;
      }
      const slice = masked.slice(i);
      const match = slice.match(/^\\(begin|end)\s*\{([^}]+)\}/);
      if (match) {
        envTokens.push({
          kind: match[1] as "begin" | "end",
          env: match[2].trim(),
          start: i,
          end: i + match[0].length,
        });
        i += match[0].length - 1;
      }
    }
  }

  const envStack: EnvEntry[] = [];
  const alignmentSpans: Span[] = [];
  let hasBeginDocument = false;
  let documentStart = 0;
  let endDocumentSpan: Span | null = null;

  for (let idx = 0; idx < envTokens.length; idx++) {
    const token = envTokens[idx];
    if (token.kind === "begin") {
      if (token.env === "document" && !hasBeginDocument) {
        hasBeginDocument = true;
        documentStart = token.end;
      }
      envStack.push({
        env: token.env,
        start: token.start,
        end: token.end,
      });
      continue;
    }

    // token.kind === "end"
    if (token.env === "document" && endDocumentSpan === null) {
      endDocumentSpan = { start: token.start, end: token.end };
    }

    if (envStack.length === 0) {
      issues.push(
        createIssue(content, lineIndex, {
          code: "L02",
          severity: "error",
          category: "syntax",
          message: `Unexpected \\end{${token.env}} with no matching \\begin{${token.env}}.`,
          suggestion: `Add \\begin{${token.env}} earlier or remove this \\end{${token.env}}.`,
          filePath,
          start: token.start,
          end: token.end,
        }),
      );
      continue;
    }

    const top = envStack[envStack.length - 1];
    if (top.env === token.env) {
      envStack.pop();
      if (ALIGNMENT_ENVS.has(token.env)) {
        alignmentSpans.push({ start: top.start, end: token.end });
      }
      continue;
    }

    // Look down the stack for token.env
    let matchIndex = -1;
    for (let s = envStack.length - 1; s >= 0; s--) {
      if (envStack[s].env === token.env) {
        matchIndex = s;
        break;
      }
    }

    if (matchIndex !== -1) {
      // Unclosed inner environments closed implicitly by outer \end (e.g. \end{document})
      for (let s = envStack.length - 1; s > matchIndex; s--) {
        const unclosed = envStack[s];
        const fixLabel =
          token.env === "document"
            ? `Insert \\end{${unclosed.env}} before \\end{document}`
            : `Insert \\end{${unclosed.env}} before \\end{${token.env}}`;
        const lineStart = content.lastIndexOf("\n", token.start - 1) + 1;
        const prefix = content.slice(lineStart, token.start);
        const needsNewline = /\S/.test(prefix);
        const indent = prefix.match(/^[ \t]*/)?.[0] ?? "";
        const replacement = needsNewline
          ? `\n${indent}\\end{${unclosed.env}}\n${indent}`
          : `\\end{${unclosed.env}}\n${indent}`;
        issues.push(
          createIssue(content, lineIndex, {
            code: "L02",
            severity: "error",
            category: "syntax",
            message: `Unclosed environment \\begin{${unclosed.env}} before \\end{${token.env}}.`,
            suggestion: `Close it with \\end{${unclosed.env}}.`,
            filePath,
            start: unclosed.start,
            end: unclosed.end,
            fix: {
              start: token.start,
              end: token.start,
              replacement,
              label: fixLabel,
            },
          }),
        );
        if (ALIGNMENT_ENVS.has(unclosed.env)) {
          alignmentSpans.push({ start: unclosed.start, end: token.start });
        }
      }
      const matched = envStack[matchIndex];
      envStack.length = matchIndex;
      if (ALIGNMENT_ENVS.has(matched.env)) {
        alignmentSpans.push({ start: matched.start, end: token.end });
      }
      continue;
    }

    // token.env is not on stack
    if (top.env === "document") {
      issues.push(
        createIssue(content, lineIndex, {
          code: "L02",
          severity: "error",
          category: "syntax",
          message: `Unexpected \\end{${token.env}} with no matching \\begin{${token.env}}.`,
          filePath,
          start: token.start,
          end: token.end,
        }),
      );
      continue;
    }

    const topHasLaterEnd = envTokens
      .slice(idx + 1)
      .some((later) => later.kind === "end" && later.env === top.env);

    if (topHasLaterEnd) {
      issues.push(
        createIssue(content, lineIndex, {
          code: "L02",
          severity: "error",
          category: "syntax",
          message: `Unexpected \\end{${token.env}} inside \\begin{${top.env}}.`,
          filePath,
          start: token.start,
          end: token.end,
        }),
      );
    } else {
      const openPos = positionAt(lineIndex, top.start);
      issues.push(
        createIssue(content, lineIndex, {
          code: "L02",
          severity: "error",
          category: "syntax",
          message: `Mismatched environment: \\end{${token.env}} does not match \\begin{${top.env}} (line ${openPos.line}).`,
          suggestion: `Change \\end{${token.env}} to \\end{${top.env}}.`,
          filePath,
          start: token.start,
          end: token.end,
          fix: {
            start: token.start,
            end: token.end,
            replacement: `\\end{${top.env}}`,
            label: `Change to \\end{${top.env}}`,
          },
        }),
      );
      envStack.pop();
    }
  }

  // Remaining unclosed environments at EOF
  for (let s = envStack.length - 1; s >= 0; s--) {
    const unclosed = envStack[s];
    if (unclosed.env === "document") {
      // L09 reports missing \end{document} cleanly
      continue;
    }
    const suffix = content.endsWith("\n")
      ? `\\end{${unclosed.env}}\n`
      : `\n\\end{${unclosed.env}}\n`;
    issues.push(
      createIssue(content, lineIndex, {
        code: "L02",
        severity: "error",
        category: "syntax",
        message: `Unclosed environment \\begin{${unclosed.env}}.`,
        suggestion: `Add \\end{${unclosed.env}} to close the environment.`,
        filePath,
        start: unclosed.start,
        end: unclosed.end,
        fix: {
          start: content.length,
          end: content.length,
          replacement: suffix,
          label: `Append \\end{${unclosed.env}}`,
        },
      }),
    );
    if (ALIGNMENT_ENVS.has(unclosed.env)) {
      alignmentSpans.push({ start: unclosed.start, end: content.length });
    }
  }

  // L09: Missing \end{document} or non-comment content after \end{document}
  if (hasBeginDocument && endDocumentSpan === null) {
    const beginMatch = /\\begin\s*\{document\}/.exec(masked);
    const beginOffset = beginMatch?.index ?? 0;
    const beginEnd = beginOffset + (beginMatch?.[0].length ?? 16);
    const replacement = content.endsWith("\n")
      ? "\\end{document}\n"
      : "\n\\end{document}\n";
    issues.push(
      createIssue(content, lineIndex, {
        code: "L09",
        severity: "error",
        category: "syntax",
        message: "Missing \\end{document} for \\begin{document}.",
        suggestion: "Add \\end{document} at the end of the manuscript.",
        filePath,
        start: beginOffset,
        end: beginEnd,
        fix: {
          start: content.length,
          end: content.length,
          replacement,
          label: "Append \\end{document}",
        },
      }),
    );
  } else if (endDocumentSpan !== null) {
    const trailingMasked = masked.slice(endDocumentSpan.end);
    const firstNonWs = trailingMasked.search(/\S/);
    if (firstNonWs !== -1) {
      const start = endDocumentSpan.end + firstNonWs;
      issues.push(
        createIssue(content, lineIndex, {
          code: "L09",
          severity: "error",
          category: "syntax",
          message:
            "Non-comment text or commands appear after \\end{document} and will be ignored by LaTeX.",
          suggestion:
            "Move active content before \\end{document} or comment it out with %.",
          filePath,
          start,
          end: content.length,
        }),
      );
    }
  }

  // If file has \documentclass but no \begin{document}, treat whole file as preamble
  if (!hasBeginDocument && /\\documentclass\b/.test(masked)) {
    documentStart = content.length;
  }

  return {
    alignmentSpans,
    documentStart,
    endDocumentSpan,
    hasBeginDocument,
  };
}

interface LeftToken {
  start: number;
  end: number;
}

interface MathScope {
  kind: "delim" | "env";
  delim?: "$" | "$$" | "\\(" | "\\[";
  env?: string;
  start: number;
  end: number;
  leftStack: LeftToken[];
}

interface TextBraceScope {
  kind: "text-brace";
  braceDepthAtOpen: number;
  skipOperatorsOnly: boolean;
}

type ActiveScope = MathScope | TextBraceScope;

function checkUnclosedLeftStack(
  content: string,
  lineIndex: LineIndex,
  filePath: string,
  leftStack: LeftToken[],
  issues: LatexLintIssue[],
): void {
  for (const left of leftStack) {
    issues.push(
      createIssue(content, lineIndex, {
        code: "L04",
        severity: "error",
        category: "math",
        message: "Unbalanced \\left without a matching \\right delimiter.",
        suggestion:
          "Add a matching \\right delimiter (or \\right. for an invisible delimiter).",
        filePath,
        start: left.start,
        end: left.end,
      }),
    );
  }
}

function isBlankLineBetween(masked: string, pos: number): number | null {
  if (masked[pos] !== "\n") return null;
  let i = pos + 1;
  while (
    i < masked.length &&
    (masked[i] === " " || masked[i] === "\t" || masked[i] === "\r")
  ) {
    i++;
  }
  if (i < masked.length && masked[i] === "\n") {
    return i;
  }
  return null;
}

/**
 * Analyzes math delimiters (`L03`), `\left`/`\right` pairing (`L04`),
 * legacy `$$...$$` (`W04`), unescaped math operators (`W05`), and returns
 * math spans so prose rules skip math mode cleanly.
 */
function analyzeMath(
  content: string,
  masked: string,
  filePath: string,
  lineIndex: LineIndex,
  endDocumentSpan: Span | null,
  issues: LatexLintIssue[],
): { mathSpans: Span[]; commandArgSpans: Span[] } {
  const scopes: ActiveScope[] = [];
  const mathSpans: Span[] = [];
  const commandArgSpans: Span[] = [];
  let braceDepth = 0;

  const limit = endDocumentSpan ? endDocumentSpan.start : masked.length;

  const currentMathScope = (): MathScope | null => {
    const top = scopes[scopes.length - 1];
    return top && top.kind !== "text-brace" ? top : null;
  };

  const inActiveMath = (): boolean => currentMathScope() !== null;

  let i = 0;
  while (i < limit) {
    const ch = masked[i];

    // Check blank line crossing inside $...$
    if (ch === "\n") {
      const top = scopes[scopes.length - 1];
      if (top && top.kind === "delim" && top.delim === "$") {
        const blank = isBlankLineBetween(masked, i);
        if (blank !== null) {
          issues.push(
            createIssue(content, lineIndex, {
              code: "L03",
              severity: "error",
              category: "math",
              message:
                "Inline math '$' crosses a blank-line paragraph boundary without closing.",
              suggestion:
                "Close inline math with '$' before the blank line, or use \\[...\\] for display math.",
              filePath,
              start: top.start,
              end: top.end,
            }),
          );
          checkUnclosedLeftStack(
            content,
            lineIndex,
            filePath,
            top.leftStack,
            issues,
          );
          scopes.pop();
          mathSpans.push({ start: top.start, end: i });
        }
      }
      i++;
      continue;
    }

    if (ch === "\\") {
      // Escaped two-char command / symbol (\\, \$, \{, \}, \=, etc.)
      if (i + 1 < limit) {
        const next = masked[i + 1];

        // \( and \)
        if (next === "(") {
          if (inActiveMath()) {
            issues.push(
              createIssue(content, lineIndex, {
                code: "L03",
                severity: "error",
                category: "math",
                message:
                  "Math delimiter \\( opened while already inside math mode.",
                filePath,
                start: i,
                end: i + 2,
              }),
            );
          } else {
            scopes.push({
              kind: "delim",
              delim: "\\(",
              start: i,
              end: i + 2,
              leftStack: [],
            });
          }
          i += 2;
          continue;
        }

        if (next === ")") {
          const top = scopes[scopes.length - 1];
          if (top && top.kind === "delim" && top.delim === "\\(") {
            scopes.pop();
            checkUnclosedLeftStack(
              content,
              lineIndex,
              filePath,
              top.leftStack,
              issues,
            );
            mathSpans.push({ start: top.start, end: i + 2 });
          } else {
            issues.push(
              createIssue(content, lineIndex, {
                code: "L03",
                severity: "error",
                category: "math",
                message: "Unmatched closing math delimiter \\) without \\(.",
                filePath,
                start: i,
                end: i + 2,
              }),
            );
          }
          i += 2;
          continue;
        }

        // \[ and \]
        if (next === "[") {
          if (inActiveMath()) {
            issues.push(
              createIssue(content, lineIndex, {
                code: "L03",
                severity: "error",
                category: "math",
                message:
                  "Display math delimiter \\[ opened while already inside math mode.",
                filePath,
                start: i,
                end: i + 2,
              }),
            );
          } else {
            scopes.push({
              kind: "delim",
              delim: "\\[",
              start: i,
              end: i + 2,
              leftStack: [],
            });
          }
          i += 2;
          continue;
        }

        if (next === "]") {
          const top = scopes[scopes.length - 1];
          if (top && top.kind === "delim" && top.delim === "\\[") {
            scopes.pop();
            checkUnclosedLeftStack(
              content,
              lineIndex,
              filePath,
              top.leftStack,
              issues,
            );
            mathSpans.push({ start: top.start, end: i + 2 });
          } else {
            issues.push(
              createIssue(content, lineIndex, {
                code: "L03",
                severity: "error",
                category: "math",
                message:
                  "Unmatched closing display math delimiter \\] without \\[.",
                filePath,
                start: i,
                end: i + 2,
              }),
            );
          }
          i += 2;
          continue;
        }

        // Any other escaped non-letter (\\, \$, \{, \}, \&, \#, \%, \=, \", etc.)
        if (!/[a-zA-Z]/.test(next)) {
          i += 2;
          continue;
        }
      }

      // Control word
      const cmdMatch = masked.slice(i).match(/^\\([a-zA-Z]+\*?)/);
      if (cmdMatch) {
        const cmdName = cmdMatch[1];
        const cmdEnd = i + cmdMatch[0].length;

        // \begin{...} / \end{...}
        if (cmdName === "begin" || cmdName === "end") {
          const envMatch = masked.slice(cmdEnd).match(/^\s*\{([^}]+)\}/);
          if (envMatch) {
            const envName = envMatch[1].trim();
            const fullEnd = cmdEnd + envMatch[0].length;
            commandArgSpans.push({ start: i, end: fullEnd });
            if (MATH_ENVS.has(envName)) {
              if (cmdName === "begin") {
                scopes.push({
                  kind: "env",
                  env: envName,
                  start: i,
                  end: fullEnd,
                  leftStack: [],
                });
              } else {
                const top = scopes[scopes.length - 1];
                if (top && top.kind === "env" && top.env === envName) {
                  scopes.pop();
                  checkUnclosedLeftStack(
                    content,
                    lineIndex,
                    filePath,
                    top.leftStack,
                    issues,
                  );
                  mathSpans.push({ start: top.start, end: fullEnd });
                } else {
                  for (let s = scopes.length - 1; s >= 0; s--) {
                    const sc = scopes[s];
                    if (sc.kind === "env" && sc.env === envName) {
                      for (let k = scopes.length - 1; k > s; k--) {
                        const popped = scopes[k];
                        if (popped.kind === "delim") {
                          issues.push(
                            createIssue(content, lineIndex, {
                              code: "L03",
                              severity: "error",
                              category: "math",
                              message: `Unclosed math delimiter '${popped.delim}' inside '${envName}'.`,
                              filePath,
                              start: popped.start,
                              end: popped.end,
                            }),
                          );
                          checkUnclosedLeftStack(
                            content,
                            lineIndex,
                            filePath,
                            popped.leftStack,
                            issues,
                          );
                        } else if (popped.kind === "env") {
                          checkUnclosedLeftStack(
                            content,
                            lineIndex,
                            filePath,
                            popped.leftStack,
                            issues,
                          );
                        }
                      }
                      checkUnclosedLeftStack(
                        content,
                        lineIndex,
                        filePath,
                        sc.leftStack,
                        issues,
                      );
                      scopes.length = s;
                      mathSpans.push({ start: sc.start, end: fullEnd });
                      break;
                    }
                  }
                }
              }
            }
            i = fullEnd;
            continue;
          }
        }

        // \left / \right inside math (note cmdName excludes \leftarrow etc.)
        if (cmdName === "left") {
          const mathScope = currentMathScope();
          if (mathScope) {
            mathScope.leftStack.push({ start: i, end: cmdEnd });
          }
          i = cmdEnd;
          continue;
        }
        if (cmdName === "right") {
          const mathScope = currentMathScope();
          if (mathScope) {
            if (mathScope.leftStack.length === 0) {
              issues.push(
                createIssue(content, lineIndex, {
                  code: "L04",
                  severity: "error",
                  category: "math",
                  message:
                    "Unmatched \\right without a matching \\left delimiter.",
                  suggestion:
                    "Add a matching \\left delimiter (or \\left. for an invisible delimiter).",
                  filePath,
                  start: i,
                  end: cmdEnd,
                }),
              );
            } else {
              mathScope.leftStack.pop();
            }
          }
          i = cmdEnd;
          continue;
        }

        // Handle commands whose arguments are text or non-operator tokens
        if (NON_OPERATOR_ARG_COMMANDS.has(cmdName)) {
          let argStart = cmdEnd;
          if (cmdName === "tag" && masked[argStart] === "*") argStart++;
          while (
            argStart < limit &&
            (masked[argStart] === " " || masked[argStart] === "\t")
          ) {
            argStart++;
          }
          if (masked[argStart] === "{") {
            const argEnd = skipBalancedBraces(masked, argStart);
            commandArgSpans.push({ start: i, end: argEnd });
            if (inActiveMath()) {
              scopes.push({
                kind: "text-brace",
                braceDepthAtOpen: braceDepth,
                skipOperatorsOnly: !TEXT_IN_MATH_COMMANDS.has(cmdName),
              });
              braceDepth++;
              i = argStart + 1;
              continue;
            }
            i = argEnd;
            continue;
          }
        }

        // Record general \command[...]{...} spans for prose rules (W01)
        const baseName = cmdName.replace(/\*$/, "");
        if (baseName !== "begin" && baseName !== "end" && baseName !== "item") {
          let probe = cmdEnd;
          probe = skipOptionalBracket(masked, probe);
          while (
            probe < limit &&
            (masked[probe] === " " || masked[probe] === "\t")
          ) {
            probe++;
          }
          let spanEnd = probe > cmdEnd ? probe : cmdEnd;
          // Consume brace args of commands (such as \texttt{...}, \href{...}{...}, \newcommand{...}{...})
          let argGuard = 0;
          while (probe < limit && masked[probe] === "{" && argGuard < 4) {
            probe = skipBalancedBraces(masked, probe);
            spanEnd = probe;
            argGuard++;
            while (
              probe < limit &&
              (masked[probe] === " " || masked[probe] === "\t")
            ) {
              probe++;
            }
          }
          if (spanEnd > cmdEnd) {
            commandArgSpans.push({ start: i, end: spanEnd });
          }
        }

        i = cmdEnd;
        continue;
      }

      i++;
      continue;
    }

    if (ch === "{") {
      braceDepth++;
      i++;
      continue;
    }

    if (ch === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      const top = scopes[scopes.length - 1];
      if (
        top &&
        top.kind === "text-brace" &&
        braceDepth <= top.braceDepthAtOpen
      ) {
        scopes.pop();
      }
      i++;
      continue;
    }

    if (ch === "$") {
      const top = scopes[scopes.length - 1];
      if (masked[i + 1] === "$") {
        if (top && top.kind === "delim" && top.delim === "$$") {
          scopes.pop();
          checkUnclosedLeftStack(
            content,
            lineIndex,
            filePath,
            top.leftStack,
            issues,
          );
          const closeEnd = i + 2;
          mathSpans.push({ start: top.start, end: closeEnd });
          const inner = content.slice(top.start + 2, i);
          issues.push(
            createIssue(content, lineIndex, {
              code: "W04",
              severity: "warning",
              category: "math",
              message:
                "Prefer LaTeX \\[...\\] over legacy TeX $$...$$ display math.",
              suggestion: "Replace $$...$$ with \\[...\\].",
              filePath,
              start: top.start,
              end: closeEnd,
              fix: {
                start: top.start,
                end: closeEnd,
                replacement: `\\[${inner}\\]`,
                label: "Replace $$...$$ with \\[...\\]",
              },
            }),
          );
          i += 2;
          continue;
        }
        if (top && top.kind === "delim" && top.delim === "$") {
          // Close the first inline math block; the second '$' starts the next one ($a$$b$)
          scopes.pop();
          checkUnclosedLeftStack(
            content,
            lineIndex,
            filePath,
            top.leftStack,
            issues,
          );
          mathSpans.push({ start: top.start, end: i + 1 });
          i += 1;
          continue;
        }
        if (inActiveMath()) {
          issues.push(
            createIssue(content, lineIndex, {
              code: "L03",
              severity: "error",
              category: "math",
              message: "Unexpected '$$' inside an active math environment.",
              filePath,
              start: i,
              end: i + 2,
            }),
          );
          i += 2;
          continue;
        }
        scopes.push({
          kind: "delim",
          delim: "$$",
          start: i,
          end: i + 2,
          leftStack: [],
        });
        i += 2;
        continue;
      }

      // Single '$'
      if (top && top.kind === "delim" && top.delim === "$") {
        scopes.pop();
        checkUnclosedLeftStack(
          content,
          lineIndex,
          filePath,
          top.leftStack,
          issues,
        );
        mathSpans.push({ start: top.start, end: i + 1 });
        i++;
        continue;
      }
      if (!inActiveMath()) {
        scopes.push({
          kind: "delim",
          delim: "$",
          start: i,
          end: i + 1,
          leftStack: [],
        });
      }
      i++;
      continue;
    }

    // W05: Unescaped math operator names inside math mode (not inside \text / \operatorname / \mathrm etc.)
    const topScope = scopes[scopes.length - 1];
    const inPureMath = topScope !== undefined && topScope.kind !== "text-brace";
    if (inPureMath && /[a-z]/.test(ch)) {
      const prevChar = i > 0 ? masked[i - 1] : "";
      if (!/[a-zA-Z\\]/.test(prevChar)) {
        const wordMatch = masked.slice(i).match(/^[a-zA-Z]+/);
        if (wordMatch) {
          const word = wordMatch[0];
          if (MATH_OPERATORS.has(word)) {
            const end = i + word.length;
            issues.push(
              createIssue(content, lineIndex, {
                code: "W05",
                severity: "warning",
                category: "math",
                message: `Unescaped math operator '${word}' in math mode.`,
                suggestion: `Use \\${word} for proper upright operator spacing.`,
                filePath,
                start: i,
                end,
                fix: {
                  start: i,
                  end,
                  replacement: `\\${word}`,
                  label: `Replace ${word} with \\${word}`,
                },
              }),
            );
          }
          i += word.length;
          continue;
        }
      }
    }

    i++;
  }

  // Unclosed math delimiters at \end{document} or EOF
  for (let s = scopes.length - 1; s >= 0; s--) {
    const sc = scopes[s];
    if (sc.kind === "delim") {
      issues.push(
        createIssue(content, lineIndex, {
          code: "L03",
          severity: "error",
          category: "math",
          message: `Unclosed math delimiter '${sc.delim}'.`,
          suggestion:
            sc.delim === "\\["
              ? "Close display math with \\]."
              : sc.delim === "\\("
                ? "Close inline math with \\)."
                : `Close math with '${sc.delim}'.`,
          filePath,
          start: sc.start,
          end: sc.end,
        }),
      );
      checkUnclosedLeftStack(
        content,
        lineIndex,
        filePath,
        sc.leftStack,
        issues,
      );
      mathSpans.push({ start: sc.start, end: limit });
    } else if (sc.kind === "env") {
      checkUnclosedLeftStack(
        content,
        lineIndex,
        filePath,
        sc.leftStack,
        issues,
      );
      mathSpans.push({ start: sc.start, end: limit });
    }
  }

  mathSpans.sort((a, b) => a.start - b.start);
  commandArgSpans.sort((a, b) => a.start - b.start);
  return { mathSpans, commandArgSpans };
}

/** Collects spans of macro definitions, URLs, and \href first arguments so prose rules skip them. */
function collectSpecialProtectedSpans(masked: string): {
  definitionSpans: Span[];
  urlSpans: Span[];
} {
  const definitionSpans: Span[] = [];
  const urlSpans: Span[] = [];

  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === "\\") {
      const cmdMatch = masked.slice(i).match(/^\\([a-zA-Z]+\*?)/);
      if (cmdMatch) {
        const baseName = cmdMatch[1].replace(/\*$/, "");
        let j = i + cmdMatch[0].length;

        if (DEFINITION_COMMANDS.has(baseName)) {
          // Handle \def\foo#1#2{...} or \newcommand{\foo}[2][opt]{...}
          if (
            baseName === "def" ||
            baseName === "edef" ||
            baseName === "gdef" ||
            baseName === "xdef"
          ) {
            while (
              j < masked.length &&
              masked[j] !== "{" &&
              masked[j] !== "\n"
            ) {
              j++;
            }
            if (masked[j] === "{") {
              const end = skipBalancedBraces(masked, j);
              definitionSpans.push({ start: i, end });
              i = end - 1;
              continue;
            }
          } else if (baseName === "let") {
            let eol = j;
            while (eol < masked.length && masked[eol] !== "\n") eol++;
            definitionSpans.push({ start: i, end: eol });
            i = eol;
            continue;
          } else {
            while (
              j < masked.length &&
              (masked[j] === " " || masked[j] === "\t")
            ) {
              j++;
            }
            if (masked[j] === "{") {
              j = skipBalancedBraces(masked, j);
            } else if (masked[j] === "\\") {
              const targetCmd = masked.slice(j).match(/^\\[a-zA-Z]+/);
              if (targetCmd) j += targetCmd[0].length;
            }
            j = skipOptionalBracket(masked, j);
            j = skipOptionalBracket(masked, j);
            while (
              j < masked.length &&
              (masked[j] === " " || masked[j] === "\t")
            ) {
              j++;
            }
            if (masked[j] === "{") {
              j = skipBalancedBraces(masked, j);
            }
            while (
              j < masked.length &&
              (masked[j] === " " || masked[j] === "\t")
            ) {
              j++;
            }
            if (
              (baseName === "newenvironment" ||
                baseName === "renewenvironment") &&
              masked[j] === "{"
            ) {
              j = skipBalancedBraces(masked, j);
            }
            definitionSpans.push({ start: i, end: j });
            i = j - 1;
            continue;
          }
        }

        if (URL_COMMANDS.has(baseName)) {
          while (
            j < masked.length &&
            (masked[j] === " " || masked[j] === "\t")
          ) {
            j++;
          }
          if (masked[j] === "{") {
            const end = skipBalancedBraces(masked, j);
            urlSpans.push({ start: i, end });
            i = end - 1;
            continue;
          }
        }

        if (baseName === "href") {
          j = skipOptionalBracket(masked, j);
          while (
            j < masked.length &&
            (masked[j] === " " || masked[j] === "\t")
          ) {
            j++;
          }
          if (masked[j] === "{") {
            const urlEnd = skipBalancedBraces(masked, j);
            urlSpans.push({ start: i, end: urlEnd });
            i = urlEnd - 1;
            continue;
          }
        }

        if (baseName === "hyperref") {
          const optEnd = skipOptionalBracket(masked, j);
          if (optEnd > j) {
            urlSpans.push({ start: i, end: optEnd });
          }
        }
      }
    }
  }

  // Bare URLs https://... or http://...
  for (const match of masked.matchAll(/https?:\/\/[^\s{}()<>]+/g)) {
    if (match.index === undefined) continue;
    urlSpans.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  definitionSpans.sort((a, b) => a.start - b.start);
  urlSpans.sort((a, b) => a.start - b.start);
  return { definitionSpans, urlSpans };
}

/** Checks L05 (duplicate labels), L06 (undefined refs), and L07 (undefined cites). */
function analyzeCrossReferencesAndCitations(
  content: string,
  masked: string,
  filePath: string,
  lineIndex: LineIndex,
  definitionSpans: Span[],
  projectContext: ReturnType<typeof buildProjectContextFromFiles> | null,
  explicitContext: LintProjectContext | undefined,
  issues: LatexLintIssue[],
): void {
  const localLabels = collectFileLabels(content, masked, filePath, lineIndex);
  const labelSet = new Set<string>(explicitContext?.labels ?? []);
  const labelOccurrences = new Map<string, LabelLocation[]>();

  if (projectContext) {
    for (const key of projectContext.labels) labelSet.add(key);
    for (const [key, locs] of projectContext.labelLocations) {
      labelOccurrences.set(key, [...locs]);
    }
  } else {
    for (const loc of localLabels) {
      labelSet.add(loc.label);
      const list = labelOccurrences.get(loc.label);
      if (list) list.push(loc);
      else labelOccurrences.set(loc.label, [loc]);
    }
  }

  // Ensure local labels are represented if projectContext didn't include this file
  const hasThisFileInProject =
    projectContext?.files.some((f) => f.path === filePath) ?? false;
  if (projectContext && !hasThisFileInProject) {
    for (const loc of localLabels) {
      labelSet.add(loc.label);
      const list = labelOccurrences.get(loc.label);
      if (list) list.push(loc);
      else labelOccurrences.set(loc.label, [loc]);
    }
  }

  // L05: Duplicate labels (within file 2nd+, or across multiple files)
  const seenLocal = new Map<string, LabelLocation>();
  for (const loc of localLabels) {
    if (isSpanCovered(definitionSpans, loc.start)) continue;
    const prevLocal = seenLocal.get(loc.label);
    if (prevLocal) {
      issues.push(
        createIssue(content, lineIndex, {
          code: "L05",
          severity: "error",
          category: "references",
          message: `Duplicate \\label{${loc.label}} (first defined at line ${prevLocal.line}).`,
          suggestion:
            "Rename one of the duplicate labels so references remain unambiguous.",
          filePath,
          start: loc.start,
          end: loc.end,
        }),
      );
      continue;
    }
    seenLocal.set(loc.label, loc);

    const allLocs = labelOccurrences.get(loc.label) ?? [];
    const otherFileLoc = allLocs.find(
      (candidate) => candidate.filePath !== filePath,
    );
    if (otherFileLoc) {
      issues.push(
        createIssue(content, lineIndex, {
          code: "L05",
          severity: "error",
          category: "references",
          message: `Duplicate \\label{${loc.label}} (also defined in ${otherFileLoc.filePath}:${otherFileLoc.line}).`,
          suggestion: "Ensure every \\label across project files is unique.",
          filePath,
          start: loc.start,
          end: loc.end,
        }),
      );
    }
  }

  // L06: Undefined \ref, \eqref, \autoref, \cref, \Cref, \pageref
  const refRegex = /\\(ref|eqref|autoref|cref|Cref|pageref)\*?\s*\{([^}]+)\}/g;
  for (const match of masked.matchAll(refRegex)) {
    if (match.index === undefined) continue;
    if (isSpanCovered(definitionSpans, match.index)) continue;
    const cmd = match[1];
    const keys = (match[2] ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0 && !k.includes("#") && !k.includes("\\"));

    for (const key of keys) {
      if (!labelSet.has(key)) {
        issues.push(
          createIssue(content, lineIndex, {
            code: "L06",
            severity: "error",
            category: "references",
            message: `Undefined reference \\${cmd}{${key}} (no matching \\label{${key}} in project).`,
            suggestion: `Add \\label{${key}} or verify the label spelling.`,
            filePath,
            start: match.index,
            end: match.index + match[0].length,
          }),
        );
      }
    }
  }

  // L07: Undefined citations (only when project/file defines at least one .bib entry or \bibitem)
  const bibKeys = new Set<string>(explicitContext?.bibKeys ?? []);
  if (projectContext) {
    for (const key of projectContext.bibKeys) bibKeys.add(key);
  } else {
    for (const key of extractBibKeysFromFile({ path: filePath, content })) {
      bibKeys.add(key);
    }
  }

  const hasBibliography = explicitContext?.hasBibliography ?? bibKeys.size > 0;

  if (hasBibliography) {
    const citeRegex =
      /\\(cite|citep|citet|parencite|textcite|autocite)\*?(?:\s*\[[^\]]*\]){0,2}\s*\{([^}]+)\}/g;
    for (const match of masked.matchAll(citeRegex)) {
      if (match.index === undefined) continue;
      if (isSpanCovered(definitionSpans, match.index)) continue;
      const cmd = match[1];
      const keys = (match[2] ?? "")
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && !k.includes("#") && !k.includes("\\"));

      for (const key of keys) {
        if (!bibKeys.has(key)) {
          issues.push(
            createIssue(content, lineIndex, {
              code: "L07",
              severity: "error",
              category: "references",
              message: `Undefined citation \\${cmd}{${key}} (key not found in .bib or \\bibitem entries).`,
              suggestion: `Add '@...{${key}, ...}' to your .bib file or check the citation key.`,
              filePath,
              start: match.index,
              end: match.index + match[0].length,
            }),
          );
        }
      }
    }
  }
}

/** Checks L08 (unescaped `&` and `#` in prose). */
function analyzeReservedProseChars(
  content: string,
  masked: string,
  filePath: string,
  lineIndex: LineIndex,
  alignmentSpans: Span[],
  mathSpans: Span[],
  definitionSpans: Span[],
  urlSpans: Span[],
  endDocumentSpan: Span | null,
  issues: LatexLintIssue[],
): void {
  const limit = endDocumentSpan ? endDocumentSpan.start : masked.length;
  for (let i = 0; i < limit; i++) {
    const ch = masked[i];
    if (ch === "\\") {
      if (i + 1 < limit && !/[a-zA-Z]/.test(masked[i + 1])) {
        i++;
      }
      continue;
    }
    if (ch !== "&" && ch !== "#") continue;

    if (
      isSpanCovered(mathSpans, i) ||
      isSpanCovered(definitionSpans, i) ||
      isSpanCovered(urlSpans, i)
    ) {
      continue;
    }

    if (ch === "&" && isSpanCovered(alignmentSpans, i)) {
      continue;
    }

    if (ch === "&") {
      issues.push(
        createIssue(content, lineIndex, {
          code: "L08",
          severity: "error",
          category: "syntax",
          message:
            "Unescaped '&' in prose outside table or alignment environments.",
          suggestion: "Escape literal ampersands as \\&.",
          filePath,
          start: i,
          end: i + 1,
          fix: {
            start: i,
            end: i + 1,
            replacement: "\\&",
            label: "Escape & as \\&",
          },
        }),
      );
    } else {
      issues.push(
        createIssue(content, lineIndex, {
          code: "L08",
          severity: "error",
          category: "syntax",
          message: "Unescaped '#' in prose outside macro definitions.",
          suggestion: "Escape literal hash characters as \\#.",
          filePath,
          start: i,
          end: i + 1,
          fix: {
            start: i,
            end: i + 1,
            replacement: "\\#",
            label: "Escape # as \\#",
          },
        }),
      );
    }
  }
}

function looksLikeFilePath(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return /\.(tex|ltx|bib|pdf|png|jpe?g|eps|svg|cls|sty|csv|json|py|lean)$/i.test(
      trimmed,
    );
  }
  return (
    trimmed.includes("/") ||
    /^https?:\/\//i.test(trimmed) ||
    /\.(tex|ltx|bib|pdf|png|jpe?g|eps|svg|cls|sty|csv|json|py|lean)$/i.test(
      trimmed,
    )
  );
}

/** Checks W01-W03 and W06-W08 typography, prose, and portability rules. */
function analyzeTypographyAndProse(
  content: string,
  masked: string,
  sentinelMasked: string,
  filePath: string,
  lineIndex: LineIndex,
  documentStart: number,
  endDocumentSpan: Span | null,
  mathSpans: Span[],
  commandArgSpans: Span[],
  definitionSpans: Span[],
  urlSpans: Span[],
  issues: LatexLintIssue[],
): void {
  const limit = endDocumentSpan ? endDocumentSpan.start : masked.length;

  // W01: Straight ASCII double quotes "..." in prose -> ``...''
  const quoteRegex = /"([^"\n\r\\{}]{1,220})"/g;
  for (const match of masked.matchAll(quoteRegex)) {
    if (match.index === undefined) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (start < documentStart || end > limit) continue;
    if (start > 0 && masked[start - 1] === "\\") continue;
    if (
      isSpanCovered(mathSpans, start) ||
      isSpanCovered(commandArgSpans, start) ||
      isSpanCovered(definitionSpans, start) ||
      isSpanCovered(urlSpans, start)
    ) {
      continue;
    }
    const inner = content.slice(start + 1, end - 1);
    if (looksLikeFilePath(inner)) continue;

    issues.push(
      createIssue(content, lineIndex, {
        code: "W01",
        severity: "warning",
        category: "typography",
        message:
          "Use LaTeX typographic quotes ``...'' instead of straight ASCII quotes.",
        suggestion: `Replace "${inner}" with \`\`${inner}''.`,
        filePath,
        start,
        end,
        fix: {
          start,
          end,
          replacement: `\`\`${inner}''`,
          label: "Convert to ``...''",
        },
      }),
    );
  }

  // W02: Bare ... ellipsis -> \dots
  const ellipsisRegex = /(?<!\.)\.\.\.(?!\.)/g;
  for (const match of masked.matchAll(ellipsisRegex)) {
    if (match.index === undefined) continue;
    const start = match.index;
    const end = start + 3;
    if (end > limit) continue;
    const beforeChar = start > 0 ? masked[start - 1] : "";
    const afterChar = end < masked.length ? masked[end] : "";
    if (beforeChar === "/" || afterChar === "/") continue;
    if (
      isSpanCovered(urlSpans, start) ||
      isSpanCovered(definitionSpans, start)
    ) {
      continue;
    }
    // Skip file path arguments like \includegraphics{../fig} or \input{...}
    if (isSpanCovered(commandArgSpans, start)) {
      const argSlice = masked.slice(
        Math.max(0, start - 32),
        Math.min(limit, end + 16),
      );
      if (
        /\\(?:input|include|includegraphics|bibliography|addbibresource|label|ref|eqref|cite|url|href)\b/.test(
          argSlice,
        )
      ) {
        continue;
      }
    }

    issues.push(
      createIssue(content, lineIndex, {
        code: "W02",
        severity: "warning",
        category: "typography",
        message: "Use \\dots instead of bare '...' ellipsis.",
        suggestion: "Replace '...' with '\\dots'.",
        filePath,
        start,
        end,
        fix: {
          start,
          end,
          replacement: "\\dots",
          label: "Replace ... with \\dots",
        },
      }),
    );
  }

  // W03: Missing non-breaking tie ~ before \ref, \eqref, \cite (plus autoref/pageref/citep/parencite/autocite)
  const tieRegex =
    /(?<=[A-Za-z0-9.)])([ \t]+)(?=\\(?:ref|eqref|pageref|autoref|cite|citep|parencite|autocite)\*?(?:\s*\[[^\]]*\]){0,2}\s*\{)/g;
  for (const match of masked.matchAll(tieRegex)) {
    if (match.index === undefined) continue;
    const spaceStart = match.index;
    const spaceEnd = spaceStart + match[1].length;
    if (spaceStart < documentStart || spaceEnd > limit) continue;
    if (
      isSpanCovered(mathSpans, spaceStart) ||
      isSpanCovered(definitionSpans, spaceStart) ||
      isSpanCovered(urlSpans, spaceStart)
    ) {
      continue;
    }
    issues.push(
      createIssue(content, lineIndex, {
        code: "W03",
        severity: "warning",
        category: "typography",
        message:
          "Use a non-breaking tie '~' before \\ref/\\eqref/\\cite to prevent awkward line breaks.",
        suggestion: "Replace the space with '~'.",
        filePath,
        start: spaceStart,
        end: spaceEnd,
        fix: {
          start: spaceStart,
          end: spaceEnd,
          replacement: "~",
          label: "Insert non-breaking tie ~",
        },
      }),
    );
  }

  // W06: Deprecated LaTeX 2.09 font switches ({\bf ...}, {\it ...}, {\tt ...})
  const fontSwitchRegex = /\{[ \t]*\\(bf|it|tt)(?![a-zA-Z])/g;
  for (const match of masked.matchAll(fontSwitchRegex)) {
    if (match.index === undefined) continue;
    const groupStart = match.index;
    if (groupStart < documentStart || groupStart >= limit) continue;
    if (
      isSpanCovered(mathSpans, groupStart) ||
      isSpanCovered(definitionSpans, groupStart)
    ) {
      continue;
    }

    const groupEnd = skipBalancedBraces(masked, groupStart);
    if (groupEnd > limit || masked[groupEnd - 1] !== "}") continue;

    const cmd = match[1];
    const modern =
      cmd === "bf" ? "\\textbf" : cmd === "it" ? "\\textit" : "\\texttt";
    const cmdTokenEnd = groupStart + match[0].length;
    let innerStart = cmdTokenEnd;
    while (
      innerStart < groupEnd - 1 &&
      (content[innerStart] === " " || content[innerStart] === "\t")
    ) {
      innerStart++;
    }
    const innerRaw = content.slice(innerStart, groupEnd - 1);
    const innerMasked = masked.slice(innerStart, groupEnd - 1);
    const hasParagraphBreak = /\n[ \t\r]*\n/.test(innerMasked);
    const hasNestedFontSwitch = /\\(?:bf|it|tt|rm|sf|sc|sl)(?![a-zA-Z])/.test(
      innerMasked,
    );

    const safeToFix = !hasParagraphBreak && !hasNestedFontSwitch;
    issues.push(
      createIssue(content, lineIndex, {
        code: "W06",
        severity: "warning",
        category: "typography",
        message: `Deprecated LaTeX 2.09 font switch '{\\${cmd} ...}'; prefer '${modern}{...}'.`,
        suggestion: `Replace '{\\${cmd} ...}' with '${modern}{...}'.`,
        filePath,
        start: groupStart,
        end: groupEnd,
        ...(safeToFix
          ? {
              fix: {
                start: groupStart,
                end: groupEnd,
                replacement: `${modern}{${innerRaw}}`,
                label: `Convert to ${modern}{...}`,
              },
            }
          : {}),
      }),
    );
  }

  // W07 (part 1): Doubled consecutive words in prose
  // Mask math, command invocations, URLs, and definitions with \u0001 sentinel so
  // "the $x$ the" or "the \verb|x| the" does not collapse to "the the".
  const proseChars = sentinelMasked.slice(0, limit).split("");
  const maskSpanWithSentinel = (span: Span) => {
    const lo = Math.max(0, span.start);
    const hi = Math.min(limit, span.end);
    for (let k = lo; k < hi; k++) {
      if (proseChars[k] !== "\n" && proseChars[k] !== "\r") {
        proseChars[k] = "\u0001";
      }
    }
  };
  for (const s of mathSpans) maskSpanWithSentinel(s);
  for (const s of definitionSpans) maskSpanWithSentinel(s);
  for (const s of urlSpans) maskSpanWithSentinel(s);

  // Also mask control words (e.g. \section, \textbf, \item) and pure command arg spans
  for (let k = 0; k < limit; k++) {
    if (proseChars[k] === "\\") {
      if (k + 1 < limit && !/[a-zA-Z]/.test(proseChars[k + 1])) {
        proseChars[k] = "\u0001";
        proseChars[k + 1] = "\u0001";
        k++;
      } else {
        const m = proseChars
          .slice(k, Math.min(limit, k + 40))
          .join("")
          .match(/^\\[a-zA-Z]+\*?/);
        if (m) {
          for (let x = 0; x < m[0].length; x++) proseChars[k + x] = "\u0001";
          k += m[0].length - 1;
        }
      }
    }
  }
  // Mask \begin{...} / \end{...} / \label{...} / \ref{...} / \cite{...} etc.
  for (const s of commandArgSpans) {
    // Only mask non-textual formatting commands or all commandArgSpans? Wait:
    // If someone writes "\textbf{the the}", masking commandArgSpans would hide "the the" inside \textbf{...}!
    // Instead mask ONLY structural/citation/label/env/path command spans!
    const head = masked.slice(s.start, Math.min(s.end, s.start + 30));
    if (
      /^\\(?:begin|end|label|ref|eqref|pageref|autoref|cref|Cref|cite|citep|citet|parencite|textcite|autocite|includegraphics|input|include|bibliography|bibliographystyle|addbibresource|usepackage|RequirePackage|documentclass|url|href|texttt|lstinline|mintinline)\b/.test(
        head,
      )
    ) {
      maskSpanWithSentinel(s);
    }
  }

  const proseString = proseChars.join("");
  const wordRegex = /\b([A-Za-z]{2,}|a)\b/g;
  let prevWord: { text: string; start: number; end: number } | null = null;
  for (const match of proseString.matchAll(wordRegex)) {
    if (match.index === undefined) continue;
    const wStart = match.index;
    const wText = match[1];
    const wEnd = wStart + wText.length;
    if (wStart < documentStart) {
      prevWord = null;
      continue;
    }

    if (prevWord) {
      const gap = proseString.slice(prevWord.end, wStart);
      const onlyWhitespace = /^[ \t\r\n]+$/.test(gap);
      const hasBlankLine = /\n[ \t\r]*\n/.test(gap);
      const isSingleLetterA = wText.length === 1;
      const sameWord = isSingleLetterA
        ? prevWord.text === "a" && wText === "a"
        : prevWord.text.toLowerCase() === wText.toLowerCase();
      if (
        onlyWhitespace &&
        !hasBlankLine &&
        sameWord &&
        !DOUBLED_WORD_WHITELIST.has(wText.toLowerCase())
      ) {
        issues.push(
          createIssue(content, lineIndex, {
            code: "W07",
            severity: "warning",
            category: "prose",
            message: `Doubled consecutive word '${prevWord.text} ${wText}' in prose.`,
            suggestion: `Remove the repeated word '${wText}'.`,
            filePath,
            start: prevWord.start,
            end: wEnd,
            fix: {
              start: prevWord.start,
              end: wEnd,
              replacement: prevWord.text,
              label: `Remove duplicate '${wText}'`,
            },
          }),
        );
      }
    }

    prevWord = { text: wText, start: wStart, end: wEnd };
  }

  // W07 (part 2): TODO / FIXME / TBD / [citation needed] markers in active source
  const markerRegex = /\b(TODO|FIXME|TBD)\b|\[citation needed\]/gi;
  for (const match of masked.matchAll(markerRegex)) {
    if (match.index === undefined) continue;
    const raw = match[0];
    // Require uppercase for TODO/FIXME/TBD so normal words like "tbd" only if uppercase
    if (raw !== "[citation needed]" && !/^(TODO|FIXME|TBD)$/.test(raw)) {
      continue;
    }
    const start = match.index;
    const end = start + raw.length;
    if (end > limit) continue;
    if (
      isSpanCovered(definitionSpans, start) ||
      isSpanCovered(urlSpans, start)
    ) {
      continue;
    }
    issues.push(
      createIssue(content, lineIndex, {
        code: "W07",
        severity: "info",
        category: "prose",
        message: `Unresolved draft marker '${raw}' remains in document text.`,
        suggestion:
          "Resolve or remove this draft placeholder before submission.",
        filePath,
        start,
        end,
      }),
    );
  }

  // W08: Portability traps
  const pkgRegex =
    /\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^}]+)\}/g;
  for (const match of masked.matchAll(pkgRegex)) {
    if (match.index === undefined) continue;
    const start = match.index;
    const end = start + match[0].length;
    const options = (match[1] ?? "").trim();
    const pkgList = (match[2] ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    for (const pkg of pkgList) {
      if (pkg === "hyperref" && options.length > 0) {
        issues.push(
          createIssue(content, lineIndex, {
            code: "W08",
            severity: "warning",
            category: "portability",
            message:
              "Passing options directly to \\usepackage[...]{hyperref} risks an option-clash error.",
            suggestion:
              "Load \\usepackage{hyperref} without options and configure via \\hypersetup{...}.",
            filePath,
            start,
            end,
          }),
        );
      }

      if (pkg in OBSOLETE_PACKAGES) {
        issues.push(
          createIssue(content, lineIndex, {
            code: "W08",
            severity: "warning",
            category: "portability",
            message: `Obsolete LaTeX package '${pkg}' loaded.`,
            suggestion: OBSOLETE_PACKAGES[pkg],
            filePath,
            start,
            end,
          }),
        );
      }
    }
  }
}

function sortIssues(issues: LatexLintIssue[]): LatexLintIssue[] {
  return [...issues].sort(
    (a, b) =>
      a.line - b.line ||
      a.column - b.column ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.code.localeCompare(b.code),
  );
}

function countBySeverity(issues: LatexLintIssue[]): LintCounts {
  const counts: LintCounts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.severity]++;
  return counts;
}

/**
 * Runs deterministic static analysis (rules `L01`-`L09` and `W01`-`W08`)
 * over a single LaTeX source file with comment and verbatim awareness.
 */
export function lintLatexFile(
  content: string,
  filePath: string,
  projectContext?: LintProjectContext,
): LatexLintIssue[] {
  const issues: LatexLintIssue[] = [];
  const lineIndex = buildLineIndex(content);
  const { masked, sentinelMasked } = maskLatexSource(content);

  const builtContext = projectContext?.files
    ? buildProjectContextFromFiles(projectContext.files)
    : null;

  const { alignmentSpans, documentStart, endDocumentSpan } =
    analyzeBracesAndEnvironments(content, masked, filePath, lineIndex, issues);

  const { mathSpans, commandArgSpans } = analyzeMath(
    content,
    masked,
    filePath,
    lineIndex,
    endDocumentSpan,
    issues,
  );

  const { definitionSpans, urlSpans } = collectSpecialProtectedSpans(masked);

  analyzeCrossReferencesAndCitations(
    content,
    masked,
    filePath,
    lineIndex,
    definitionSpans,
    builtContext,
    projectContext,
    issues,
  );

  analyzeReservedProseChars(
    content,
    masked,
    filePath,
    lineIndex,
    alignmentSpans,
    mathSpans,
    definitionSpans,
    urlSpans,
    endDocumentSpan,
    issues,
  );

  analyzeTypographyAndProse(
    content,
    masked,
    sentinelMasked,
    filePath,
    lineIndex,
    documentStart,
    endDocumentSpan,
    mathSpans,
    commandArgSpans,
    definitionSpans,
    urlSpans,
    issues,
  );

  return sortIssues(issues);
}

/**
 * Lints every `.tex` / `.ltx` file across a project with shared label and
 * bibliography awareness.
 */
export function lintLatexProject(
  files: LintProjectFile[],
  activeFilePath?: string,
): LatexLintProjectResult {
  const context = buildProjectContextFromFiles(files);
  const contextKey = buildContextCacheKey(context);
  const byFile: Record<string, LatexLintIssue[]> = {};
  const allIssues: LatexLintIssue[] = [];

  for (const file of files) {
    const isTex = isLatexDocumentFile({
      name: file.name ?? file.path,
      type: (file.type as "tex" | "image" | "binary") ?? "tex",
    });
    if (!isTex) continue;

    const content = file.content ?? "";
    const contentHash = getFastContentHash(file.path, content);
    const cacheKey = `${file.path}\0${contextKey}\0${content.length}\0${contentHash}`;
    const cached = lintProjectFileCache.get(cacheKey);
    let fileIssues: LatexLintIssue[];
    if (cached && cached.content === content) {
      touchLru(lintProjectFileCache, cacheKey, cached);
      fileIssues = cached.issues.slice();
    } else {
      fileIssues = lintLatexFile(content, file.path, context);
      touchLru(lintProjectFileCache, cacheKey, {
        content,
        issues: fileIssues,
      });
    }
    byFile[file.path] = fileIssues;
    allIssues.push(...fileIssues);
  }

  const normalizedActive = activeFilePath?.replace(/^\/+/, "");
  const activeIssues = normalizedActive
    ? (byFile[normalizedActive] ?? byFile[activeFilePath ?? ""] ?? [])
    : allIssues;

  return {
    issues: allIssues,
    activeIssues,
    byFile,
    counts: countBySeverity(allIssues),
    activeCounts: countBySeverity(activeIssues),
    labels: [...context.labels],
    bibKeys: [...context.bibKeys],
  };
}

/** Applies a single issue's deterministic fix if available. */
export function applyLintFix(content: string, issue: LatexLintIssue): string {
  const fix = issue.fix;
  if (!fix) return content;
  if (fix.start < 0 || fix.end > content.length || fix.start > fix.end) {
    return content;
  }
  return content.slice(0, fix.start) + fix.replacement + content.slice(fix.end);
}

interface AtomicReplacement {
  start: number;
  end: number;
  replacement: string;
}

/**
 * Splits a delimiter-wrapping fix (e.g. `$$...$$` -> `\[...\]`, `"..."` -> ``` ``...'' ```,
 * or `{\bf ...}` -> `\textbf{...}`) into non-overlapping prefix + suffix edits when it
 * encloses another fix, so nested fixes can all apply cleanly in one pass.
 */
function decomposeWrapperFix(
  content: string,
  fix: LintFix,
): AtomicReplacement[] | null {
  const original = content.slice(fix.start, fix.end);
  const replacement = fix.replacement;
  if (original.length < 2 || replacement.length < 2) return null;

  // Match $$...$$ -> \[...\]
  if (
    original.startsWith("$$") &&
    original.endsWith("$$") &&
    replacement.startsWith("\\[") &&
    replacement.endsWith("\\]") &&
    original.slice(2, -2) === replacement.slice(2, -2)
  ) {
    return [
      { start: fix.start, end: fix.start + 2, replacement: "\\[" },
      { start: fix.end - 2, end: fix.end, replacement: "\\]" },
    ];
  }

  // Match "..." -> ``...''
  if (
    original.startsWith('"') &&
    original.endsWith('"') &&
    replacement.startsWith("``") &&
    replacement.endsWith("''") &&
    original.slice(1, -1) === replacement.slice(2, -2)
  ) {
    return [
      { start: fix.start, end: fix.start + 1, replacement: "``" },
      { start: fix.end - 1, end: fix.end, replacement: "''" },
    ];
  }

  // Match {\bf ...} -> \textbf{...}
  const fontPrefix = original.match(/^\{[ \t]*\\(?:bf|it|tt)[ \t]*/);
  const modernPrefix = replacement.match(/^\\text(?:bf|it|tt)\{/);
  if (
    fontPrefix &&
    modernPrefix &&
    original.endsWith("}") &&
    replacement.endsWith("}") &&
    original.slice(fontPrefix[0].length, -1) ===
      replacement.slice(modernPrefix[0].length, -1)
  ) {
    return [
      {
        start: fix.start,
        end: fix.start + fontPrefix[0].length,
        replacement: modernPrefix[0],
      },
    ];
  }

  return null;
}

/**
 * Applies all non-conflicting safe fixes from `issues` without corrupting offsets.
 */
export function applyAllSafeLintFixes(
  content: string,
  issues: LatexLintIssue[],
): string {
  const fixes = issues
    .map((issue) => issue.fix)
    .filter((fix): fix is LintFix => Boolean(fix))
    .filter(
      (fix) =>
        fix.start >= 0 && fix.end <= content.length && fix.start <= fix.end,
    );

  if (fixes.length === 0) return content;

  // Expand wrapper fixes when another fix sits strictly inside their span.
  const expanded: AtomicReplacement[] = [];
  for (const fix of fixes) {
    const hasNested = fixes.some(
      (other) =>
        other !== fix &&
        fix.start <= other.start &&
        other.end <= fix.end &&
        !(other.start === fix.start && other.end === fix.end),
    );
    if (hasNested) {
      const split = decomposeWrapperFix(content, fix);
      if (split) {
        expanded.push(...split);
        continue;
      }
    }
    expanded.push({
      start: fix.start,
      end: fix.end,
      replacement: fix.replacement,
    });
  }

  // Sort left-to-right (longer span first on ties) and drop overlaps.
  expanded.sort((a, b) => a.start - b.start || b.end - a.end);

  const accepted: AtomicReplacement[] = [];
  let cursor = -1;
  for (const edit of expanded) {
    if (edit.start < cursor) continue;
    accepted.push(edit);
    cursor = edit.end;
  }

  // Apply right-to-left so earlier offsets stay intact.
  let next = content;
  for (let i = accepted.length - 1; i >= 0; i--) {
    const edit = accepted[i];
    next = next.slice(0, edit.start) + edit.replacement + next.slice(edit.end);
  }
  return next;
}

/**
 * Compares structural `L01`/`L02`/`L03`/`L04` error counts before vs after an
 * edit to flag newly introduced unclosed braces, environments, math, or `\left`/`\right`.
 */
export function validateLatexEditIntegrity(
  before: string,
  after: string,
): LatexEditIntegrityResult {
  const beforeStructural = lintLatexFile(before, "edit.tex").filter((issue) =>
    INTEGRITY_CODES.has(issue.code),
  );
  const afterStructural = lintLatexFile(after, "edit.tex").filter((issue) =>
    INTEGRITY_CODES.has(issue.code),
  );

  const beforeCounts = new Map<string, number>();
  for (const issue of beforeStructural) {
    beforeCounts.set(issue.code, (beforeCounts.get(issue.code) ?? 0) + 1);
  }

  const afterByCode = new Map<string, LatexLintIssue[]>();
  for (const issue of afterStructural) {
    const list = afterByCode.get(issue.code);
    if (list) list.push(issue);
    else afterByCode.set(issue.code, [issue]);
  }

  const introduced: LatexLintIssue[] = [];
  for (const [code, list] of afterByCode) {
    const prevCount = beforeCounts.get(code) ?? 0;
    if (list.length > prevCount) {
      const beforeMessages = new Set(
        beforeStructural
          .filter((issue) => issue.code === code)
          .map((issue) => `${issue.message}::${issue.snippet ?? ""}`),
      );
      const excessCount = list.length - prevCount;
      const novel = list.filter(
        (issue) =>
          !beforeMessages.has(`${issue.message}::${issue.snippet ?? ""}`),
      );
      const picked =
        novel.length >= excessCount
          ? novel.slice(0, excessCount)
          : list.slice(list.length - excessCount);
      introduced.push(...picked);
    }
  }

  return {
    ok: introduced.length === 0,
    introduced: sortIssues(introduced),
  };
}
