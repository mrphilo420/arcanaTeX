import {
  fileKindForName,
  isLatexPatchableFile,
  type FileKind,
} from "@/lib/file-kind";
import {
  classifyLatexWarning,
  type WarningPriority,
  warningFamilyById,
} from "@/lib/latex-warning-knowledge";
import type { ProjectFile } from "@/lib/project-files";

export type DiagnosticSeverity = "error" | "warning";

export type DiagnosticKind =
  | "missing-graphic"
  | "undefined-environment"
  | "environment-mismatch"
  | "missing-package"
  | "missing-class"
  | "missing-file"
  | "undefined-command"
  | "duplicate-command"
  | "math-mode"
  | "runaway-argument"
  | "preamble-only"
  | "misplaced-tab"
  | "misplaced-hash"
  | "fatal"
  | "undefined-reference"
  | "undefined-citation"
  | "warning"
  | "error";

export interface CompileDiagnostic {
  id: string;
  /** Source language that produced this diagnostic. */
  language?: FileKind;
  severity: DiagnosticSeverity;
  kind: DiagnosticKind;
  title: string;
  message: string;
  details: string[];
  filePath?: string | null;
  fileId?: string | null;
  line?: number | null;
  lineText?: string | null;
  raw: string;
  /** Curated warning family, when the log line matches the knowledge base. */
  warningFamily?: string;
  /** Fix priority for warnings; errors are implicitly critical. */
  warningPriority?: WarningPriority;
  data: {
    environment?: string;
    begin?: string;
    end?: string;
    file?: string;
    package?: string;
    command?: string;
    runaway?: string;
    noLegalEnd?: boolean;
  };
}

/** Which language a diagnostic belongs to. Older diagnostics fall back to their file path, then LaTeX. */
export function diagnosticLanguage(diagnostic: CompileDiagnostic): FileKind {
  if (diagnostic.language) return diagnostic.language;
  if (diagnostic.filePath) {
    const kind = fileKindForName(diagnostic.filePath);
    if (kind !== "other" && kind !== "text") return kind;
  }
  return "latex";
}

export interface ParseLatexLogOptions {
  mainFilePath?: string | null;
}

export function diagnosticNature(diagnostic: CompileDiagnostic): string {
  const family = warningFamilyById(diagnostic.warningFamily);
  if (family) return family.label;

  switch (diagnostic.kind) {
    case "missing-graphic":
      return "Missing figure";
    case "undefined-environment":
      return "Undefined environment";
    case "environment-mismatch":
      return "Environment mismatch";
    case "missing-package":
      return "Missing package";
    case "missing-class":
      return "Missing class";
    case "missing-file":
      return "Missing file";
    case "undefined-command":
      return "Undefined command";
    case "duplicate-command":
      return "Duplicate definition";
    case "math-mode":
      return "Math mode";
    case "runaway-argument":
      return "Runaway argument";
    case "preamble-only":
      return "Preamble-only command";
    case "misplaced-tab":
      return "Misplaced &";
    case "misplaced-hash":
      return "Misplaced #";
    case "fatal":
      return "Fatal error";
    case "undefined-reference":
      return "Undefined reference";
    case "undefined-citation":
      return "Undefined citation";
    case "warning":
      return "Warning";
    default:
      return "LaTeX error";
  }
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function cleanPath(value: string | undefined | null): string | null {
  if (!value) return null;
  return value
    .trim()
    .replace(/^[`'"]+|[`'"]+$/g, "")
    .replace(/^\.\//, "")
    .replace(/\\/g, "/");
}

function baseName(value: string): string {
  const parts = value.split("/");
  return parts[parts.length - 1] ?? value;
}

function isDiagnosticStart(line: string): boolean {
  return (
    line.startsWith("! ") ||
    /^(?:Overfull|Underfull)\s+\\[hv]box/i.test(line) ||
    /^Missing character:/i.test(line) ||
    /^(?:pdfTeX|LuaTeX|XeTeX) warning/i.test(line) ||
    /^[^\s:]+\.(?:tex|ltx):\d+:/i.test(line) ||
    /^(?:LaTeX|Package|Class|LaTeX Font)\s+(?:Warning|Error):/i.test(line) ||
    /^LaTeX Warning:/i.test(line)
  );
}

function isWarningStart(line: string): boolean {
  return (
    /^(?:Overfull|Underfull)\s+\\[hv]box/i.test(line) ||
    /^Missing character:/i.test(line) ||
    /^(?:pdfTeX|LuaTeX|XeTeX) warning/i.test(line) ||
    /^LaTeX Warning:/i.test(line) ||
    /^(?:Package|Class|LaTeX Font)\s+.*Warning:/i.test(line)
  );
}

const TEX_WRAP_COLUMN = 79;

function topTexFile(stack: (string | null)[]): string | null {
  for (let index = stack.length - 1; index >= 0; index--) {
    const entry = stack[index];
    if (entry && /\.(?:tex|ltx)$/i.test(entry)) return entry;
  }
  return null;
}

/**
 * Works out which source file TeX was reading at every log line by following
 * the `(file ... )` nesting TeX prints as it opens and closes files. Engines
 * hard-wrap log lines at 79 columns, so a wrapped line is joined with its
 * continuation before parentheses are read. An explicit `file.tex:LINE:`
 * location always wins for its own line.
 */
function trackCurrentFiles(
  lines: string[],
  mainFilePath: string | null,
): (string | null)[] {
  const stack: (string | null)[] = [];
  const result: (string | null)[] = [];
  let carry = "";

  lines.forEach((line, index) => {
    const text = carry + line;
    const isLast = index === lines.length - 1;

    if (line.length === TEX_WRAP_COLUMN && !isLast) {
      carry = text;
      result.push(topTexFile(stack) ?? mainFilePath);
      return;
    }
    carry = "";

    for (const token of text.matchAll(/\((\/[^()]*|[^\s()]*)|\)/g)) {
      if (token[0] === ")") {
        stack.pop();
      } else {
        stack.push(cleanPath(token[1]) || null);
      }
    }

    const explicit = line.match(/^([^\s:]+\.(?:tex|ltx)):\d+:/i)?.[1];
    result.push(cleanPath(explicit) ?? topTexFile(stack) ?? mainFilePath);
  });

  return result;
}

function parseLineNumber(
  block: string,
  head: string,
): { line: number | null; lineText: string | null } {
  const lineMatch = block.match(/^l\.(\d+)\s*(.*)$/m);
  if (lineMatch) {
    const line = Number(lineMatch[1]);
    return {
      line: Number.isFinite(line) ? line : null,
      lineText: lineMatch[2]?.trim() || null,
    };
  }

  const inputLine = head.match(/on input line (\d+)/i);
  if (inputLine) {
    return { line: Number(inputLine[1]), lineText: null };
  }

  // Overfull/underfull boxes report a paragraph range, not an `l.N` line.
  // The second number is where the bad break happened.
  const atLines = head.match(
    /\bat\s+lines?\s+(\d+)(?:\s*(?:--|–|-)\s*(\d+))?/i,
  );
  if (atLines) {
    const line = Number(atLines[2] ?? atLines[1]);
    return { line: Number.isFinite(line) ? line : null, lineText: null };
  }

  return { line: null, lineText: null };
}

function extractMissingPath(head: string): string | null {
  const patterns = [
    /File\s+[`']([^`']+)[`']\s+not found/i,
    /File\s+([^\s]+)\s+not found/i,
    /`([^`']+\.(?:pdf|png|jpe?g|eps|svg|sty|cls))'/i,
  ];

  for (const pattern of patterns) {
    const match = head.match(pattern);
    if (match?.[1]) return cleanPath(match[1]);
  }

  return null;
}

const RUNAWAY_HEAD =
  /^(?:File ended while scanning use of|Paragraph ended before)\s+\\+([^\s]+?)(?:\s+was complete)?\.?$/i;

/**
 * TeX prints the start of an argument it could not finish on the lines before
 * the `!` line ("Runaway argument?" followed by the text, ending in `\ETC.`
 * when truncated). That text is the only reliable anchor for where the
 * argument began, because the error itself fires far later.
 */
function readRunawayPreview(
  lines: string[],
  errorIndex: number,
): string | null {
  for (
    let index = errorIndex - 1;
    index >= Math.max(0, errorIndex - 6);
    index--
  ) {
    if (
      !/^Runaway (?:argument|text|definition|preamble)\?/i.test(lines[index])
    ) {
      continue;
    }
    const preview = lines
      .slice(index + 1, errorIndex)
      .join("")
      .replace(/\\ETC\.?$/, "")
      .trim();
    return preview || null;
  }
  return null;
}

function classifyError(
  head: string,
  lineText: string | null,
  runaway: string | null = null,
): {
  kind: DiagnosticKind;
  data: CompileDiagnostic["data"];
} {
  const lower = head.toLowerCase();
  const data: CompileDiagnostic["data"] = {};

  const environment = head.match(
    /Environment\s+[`']?([^`'\s]+)'?\s+undefined/i,
  )?.[1];
  if (environment) {
    data.environment = environment;
    return { kind: "undefined-environment", data };
  }

  const mismatch = head.match(
    /\\begin\{([^}]+)\}\s+ended by\s+\\end\{([^}]+)\}/i,
  );
  if (mismatch) {
    data.begin = mismatch[1];
    data.end = mismatch[2];
    return { kind: "environment-mismatch", data };
  }

  const missingPath = extractMissingPath(head);
  if (missingPath) {
    data.file = missingPath;
    if (/\.(sty|cls)$/i.test(missingPath)) {
      if (/\.cls$/i.test(missingPath)) return { kind: "missing-class", data };
      data.package = baseName(missingPath).replace(/\.sty$/i, "");
      return { kind: "missing-package", data };
    }
    if (
      /\.(pdf|png|jpe?g|eps|svg|gif)$/i.test(missingPath) ||
      lower.includes("pdftex.def")
    ) {
      return { kind: "missing-graphic", data };
    }
    return { kind: "missing-file", data };
  }

  const command =
    lineText?.match(/\\([a-zA-Z@]+)/)?.[1] ?? head.match(/\\([a-zA-Z@]+)/)?.[1];
  if (lower.includes("undefined control sequence")) {
    if (command) data.command = command;
    return { kind: "undefined-command", data };
  }

  if (lower.includes("already defined")) {
    if (command) data.command = command;
    return { kind: "duplicate-command", data };
  }

  if (lower.includes("missing $ inserted")) {
    return { kind: "math-mode", data };
  }
  if (/can be used only in preamble/i.test(head)) {
    const preamble = lineText?.match(/\\([a-zA-Z@]+)/)?.[1];
    if (preamble) data.command = preamble;
    return { kind: "preamble-only", data };
  }
  if (lower.includes("misplaced alignment tab character")) {
    return { kind: "misplaced-tab", data };
  }
  if (lower.includes("macro parameter character #")) {
    return { kind: "misplaced-hash", data };
  }

  const runawayHead = head.match(RUNAWAY_HEAD);
  if (runawayHead || lower.includes("runaway argument")) {
    if (runawayHead?.[1]) data.command = runawayHead[1];
    if (runaway) data.runaway = runaway;
    return { kind: "runaway-argument", data };
  }
  if (
    lower.includes("emergency stop") &&
    /no legal \\end found/i.test(lineText ?? "")
  ) {
    data.noLegalEnd = true;
  }
  if (
    lower.includes("emergency stop") ||
    lower.includes("fatal error occurred") ||
    lower.includes("file ended while scanning")
  ) {
    return { kind: "fatal", data };
  }

  return { kind: "error", data };
}

function classifyWarning(head: string): DiagnosticKind {
  const lower = head.toLowerCase();
  if (lower.includes("reference") && lower.includes("undefined")) {
    return "undefined-reference";
  }
  if (lower.includes("citation") && lower.includes("undefined")) {
    return "undefined-citation";
  }
  return "warning";
}

function shouldSkipWarning(head: string): boolean {
  const lower = head.toLowerCase();
  return (
    lower.includes("there were undefined references") ||
    lower.includes("label(s) may have changed") ||
    lower.includes("rerun to get cross-references right")
  );
}

function readDiagnosticBlock(
  lines: string[],
  start: number,
): { block: string[]; next: number } {
  const block = [lines[start]];
  let index = start + 1;
  const limit = Math.min(lines.length, start + 16);

  while (index < limit) {
    const line = lines[index];
    if (isDiagnosticStart(line)) break;
    block.push(line);
    index++;

    if (/^l\.\d+/.test(line)) break;
  }

  return { block, next: index };
}

export function parseLatexLog(
  log: string,
  options: ParseLatexLogOptions = {},
): CompileDiagnostic[] {
  const lines = log.replace(/\r\n/g, "\n").split("\n");
  const diagnostics: CompileDiagnostic[] = [];
  const seen = new Set<string>();
  const mainFilePath = cleanPath(options.mainFilePath);
  const filesByLine = trackCurrentFiles(lines, mainFilePath);
  let currentFile = mainFilePath;

  const pushDiagnostic = (
    severity: DiagnosticSeverity,
    kind: DiagnosticKind,
    head: string,
    block: string[],
    data: CompileDiagnostic["data"] = {},
  ) => {
    const title = head.replace(/^!\s*/, "").trim();
    if (!title) return;

    const { line, lineText } = parseLineNumber(block.join("\n"), title);
    const filePath = currentFile ?? cleanPath(options.mainFilePath);
    const details = block
      .slice(1)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !/^l\.\d+/.test(item))
      .slice(0, 8);
    const family =
      severity === "warning" ? classifyLatexWarning(title, details) : null;
    const key = `${severity}:${kind}:${title}:${line ?? ""}:${lineText ?? ""}:${data.environment ?? ""}:${data.file ?? ""}:${data.command ?? ""}`;

    if (seen.has(key)) return;
    seen.add(key);

    diagnostics.push({
      id: `diag-${hashString(key)}`,
      language: "latex",
      severity,
      kind,
      title,
      message: title,
      details,
      filePath,
      fileId: null,
      line,
      lineText,
      raw: block.join("\n"),
      warningFamily: family?.id,
      warningPriority: family?.priority,
      data,
    });
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    currentFile = filesByLine[index];

    if (line.startsWith("! ")) {
      const { block, next } = readDiagnosticBlock(lines, index);
      const head = line.slice(2).trim();
      const { kind, data } = classifyError(
        head,
        block.join("\n"),
        readRunawayPreview(lines, index),
      );
      pushDiagnostic("error", kind, head, block, data);
      index = Math.max(index, next - 1);
      continue;
    }

    const fileLineError = line.match(/^([^\s:]+\.(?:tex|ltx)):(\d+):\s*(.*)$/i);
    if (fileLineError) {
      const { block, next } = readDiagnosticBlock(lines, index);
      const head = fileLineError[3]?.trim() || line.trim();
      const { kind, data } = classifyError(head, block.join("\n"));
      pushDiagnostic("error", kind, head, block, data);
      index = Math.max(index, next - 1);
      continue;
    }

    if (isWarningStart(line) && !shouldSkipWarning(line)) {
      const { block, next } = readDiagnosticBlock(lines, index);
      const head = line.trim();
      pushDiagnostic("warning", classifyWarning(head), head, block);
      index = Math.max(index, next - 1);
    }
  }

  const missingFiles = new Set(
    diagnostics
      .filter(
        (diagnostic) => diagnostic.severity === "error" && diagnostic.data.file,
      )
      .map((diagnostic) => diagnostic.data.file!.toLowerCase()),
  );

  return diagnostics
    .filter((diagnostic) => {
      if (diagnostic.severity !== "warning" || missingFiles.size === 0) {
        return true;
      }
      const title = diagnostic.title.toLowerCase();
      return ![...missingFiles].some(
        (file) =>
          title.includes(file) || title.includes(baseName(file).toLowerCase()),
      );
    })
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
      return (a.line ?? 0) - (b.line ?? 0);
    })
    .slice(0, 60);
}

function normalizeForMatch(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\.\.\.$/, "")
    .trim();
}

export function resolveDiagnosticFiles(
  diagnostics: CompileDiagnostic[],
  files: ProjectFile[],
  mainFileId: string | null,
): CompileDiagnostic[] {
  const texFiles = files.filter(
    (file) => file.type === "tex" && isLatexPatchableFile(file.path),
  );
  const mainFile =
    texFiles.find((file) => file.id === mainFileId) ?? texFiles[0] ?? null;

  return diagnostics.map((diagnostic) => {
    if (diagnostic.fileId) return diagnostic;

    const lineText = diagnostic.lineText
      ? normalizeForMatch(diagnostic.lineText)
      : "";

    if (diagnostic.line && lineText) {
      const match = texFiles.find((file) => {
        const lines = (file.content ?? "").split("\n");
        const sourceLine = normalizeForMatch(lines[diagnostic.line! - 1] ?? "");
        return (
          sourceLine === lineText ||
          sourceLine.includes(lineText) ||
          lineText.includes(sourceLine)
        );
      });

      if (match) {
        return { ...diagnostic, fileId: match.id, filePath: match.path };
      }
    }

    if (lineText) {
      const matches = texFiles.filter((file) =>
        (file.content ?? "").includes(lineText),
      );
      if (matches.length === 1) {
        return {
          ...diagnostic,
          fileId: matches[0].id,
          filePath: matches[0].path,
        };
      }
    }

    if (diagnostic.filePath) {
      const match = texFiles.find(
        (file) =>
          file.path === diagnostic.filePath ||
          baseName(file.path) === baseName(diagnostic.filePath!),
      );
      if (match) {
        return { ...diagnostic, fileId: match.id, filePath: match.path };
      }
    }

    if (mainFile) {
      return {
        ...diagnostic,
        fileId: mainFile.id,
        filePath: mainFile.path,
      };
    }

    return diagnostic;
  });
}
