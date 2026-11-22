import type { CompileDiagnostic } from "@/lib/compile-diagnostics";
import { maskComments } from "@/lib/latex-active";
import { closeRunawayArgument } from "@/lib/latex-braces";
import { escapeReservedCharacter } from "@/lib/latex-reserved";
import {
  classifyLatexWarning,
  warningFamilyById,
  type WarningFamily,
} from "@/lib/latex-warning-knowledge";
import type { ProjectFile } from "@/lib/project-files";

export interface AutoFixUpdate {
  id: string;
  content: string;
}

export interface AutoFixResult {
  updates: AutoFixUpdate[];
  applied: string[];
  skipped: { diagnosticId: string; reason: string }[];
}

interface TextEdit {
  start: number;
  end: number;
  text: string;
}

interface FixInput {
  files: ProjectFile[];
  mainFileId: string | null;
  diagnostics: CompileDiagnostic[];
  diagnosticId?: string;
}

const ENVIRONMENT_PACKAGES: Record<string, string> = {
  align: "amsmath",
  "align*": "amsmath",
  alignat: "amsmath",
  "alignat*": "amsmath",
  gather: "amsmath",
  "gather*": "amsmath",
  multline: "amsmath",
  "multline*": "amsmath",
  split: "amsmath",
  cases: "amsmath",
  matrix: "amsmath",
  pmatrix: "amsmath",
  bmatrix: "amsmath",
  vmatrix: "amsmath",
  Vmatrix: "amsmath",
  smallmatrix: "amsmath",
  subequations: "amsmath",
  tikzpicture: "tikz",
  tikzcd: "tikz-cd",
  multicols: "multicol",
  "multicols*": "multicol",
  lstlisting: "listings",
  algorithm: "algorithm",
  algorithmic: "algorithmic",
};

const COMMAND_PACKAGES: Record<string, string> = {
  text: "amsmath",
  operatorname: "amsmath",
  dfrac: "amsmath",
  tfrac: "amsmath",
  binom: "amsmath",
  substack: "amsmath",
  overbrace: "amsmath",
  underbrace: "amsmath",
  mathbb: "amssymb",
  mathfrak: "amssymb",
  checkmark: "amssymb",
  square: "amssymb",
  Box: "amssymb",
  includegraphics: "graphicx",
  rotatebox: "graphicx",
  resizebox: "graphicx",
  scalebox: "graphicx",
  url: "hyperref",
  href: "hyperref",
  textcolor: "xcolor",
  colorbox: "xcolor",
  fcolorbox: "xcolor",
  tikz: "tikz",
  draw: "tikz",
  node: "tikz",
  toprule: "booktabs",
  midrule: "booktabs",
  bottomrule: "booktabs",
  cmidrule: "booktabs",
  SI: "siunitx",
  si: "siunitx",
  qty: "siunitx",
  num: "siunitx",
  unit: "siunitx",
  bm: "bm",
  nicefrac: "nicefrac",
  multirow: "multirow",
  lipsum: "lipsum",
  lstinputlisting: "listings",
  lstlisting: "listings",
};

const THEOREM_LIKE = new Set([
  "theorem",
  "lemma",
  "corollary",
  "definition",
  "proposition",
  "remark",
  "example",
  "conjecture",
  "claim",
  "assumption",
  "observation",
  "notation",
  "exercise",
  "problem",
  "solution",
]);

const POSITIONAL_KINDS = new Set([
  "math-mode",
  "misplaced-tab",
  "misplaced-hash",
  "preamble-only",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeGraphicPath(value: string): string {
  return value
    .trim()
    .replace(/^[`'"]+|[`'"]+$/g, "")
    .replace(/^\.\//, "")
    .replace(/\\/g, "/")
    .replace(/\.(pdf|png|jpe?g|eps|svg|gif)$/i, "")
    .toLowerCase();
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isCommented(content: string, index: number): boolean {
  const lineStart = content.lastIndexOf("\n", index - 1) + 1;
  const before = content.slice(lineStart, index);
  return maskComments(before) !== before;
}

function insertBeforeBeginDocument(
  content: string,
  block: string,
): string | null {
  const active = maskComments(content);
  const marker = "\\begin{document}";
  const index = active.indexOf(marker);

  if (index !== -1) {
    const prefix = content.slice(0, index).endsWith("\n") ? "" : "\n";
    return `${content.slice(0, index)}${prefix}${block}\n${content.slice(index)}`;
  }

  const documentClass = active.match(/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/);
  if (documentClass?.index !== undefined) {
    const lineEnd = content.indexOf("\n", documentClass.index);
    if (lineEnd !== -1) {
      return (
        content.slice(0, lineEnd + 1) +
        `${block}\n` +
        content.slice(lineEnd + 1)
      );
    }
  }

  return `${block}\n${content}`;
}

function packageLoadedRegex(packageName: string): RegExp {
  return new RegExp(
    `\\\\(?:usepackage|RequirePackage)\\s*(?:\\[[^\\]]*\\])?\\s*\\{(?:[^}]*,)?\\s*${escapeRegExp(packageName)}\\s*(?:,[^}]*)?\\}`,
  );
}

function isPackageLoaded(
  contents: Map<string, string>,
  packageName: string,
): boolean {
  const regex = packageLoadedRegex(packageName);
  return [...contents.values()].some((content) =>
    regex.test(maskComments(content)),
  );
}

function addPackage(
  content: string,
  packageName: string,
  reason: string,
): string | null {
  if (!packageName) return null;

  if (packageLoadedRegex(packageName).test(maskComments(content))) {
    return null;
  }

  return insertBeforeBeginDocument(
    content,
    `% Auto-fix: ${reason}\n\\usepackage{${packageName}}`,
  );
}

function hasLocalCommandDefinition(
  contents: Map<string, string>,
  command: string,
): boolean {
  const escaped = escapeRegExp(command);
  const pattern = new RegExp(
    `\\\\(?:(?:(?:re)?new|provide)command|DeclareMathOperator)\\*?\\s*(?:\\{\\s*\\\\${escaped}(?![a-zA-Z@])\\s*\\}|\\\\${escaped}(?![a-zA-Z@]))|\\\\(?:def|let)\\s*\\\\${escaped}(?![a-zA-Z@])`,
  );
  return [...contents.values()].some((content) =>
    pattern.test(maskComments(content)),
  );
}

function findGraphicCommands(
  content: string,
): { start: number; end: number; path: string }[] {
  const matches: { start: number; end: number; path: string }[] = [];
  const regex = /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;

  for (const match of content.matchAll(regex)) {
    if (match.index === undefined) continue;
    if (match[0].includes("\n") || match[0].includes("\r")) continue;
    if (isCommented(content, match.index)) continue;

    const start = match.index;
    const end = match.index + match[0].length;
    const range = lineRangeForCommand(content, start, end);
    const before = content.slice(range.start, start);
    const after = content.slice(end, range.end);
    if (/\S/.test(before) || !/^\s*(?:%[^\n\r]*)?\r?$/.test(after)) {
      continue;
    }

    const lineText = content.slice(range.start, range.end);
    let prevLineText = "";
    if (range.start > 0) {
      const prevEnd = range.start - 1;
      const prevStart = content.lastIndexOf("\n", prevEnd - 1) + 1;
      prevLineText = content.slice(prevStart, prevEnd);
    }
    if (
      lineText.includes("% Auto-fix: missing graphic") ||
      prevLineText.includes("% Auto-fix: missing graphic")
    ) {
      continue;
    }

    matches.push({
      start,
      end,
      path: match[1] ?? "",
    });
  }

  return matches;
}

function lineRangeForCommand(
  content: string,
  start: number,
  end: number,
): { start: number; end: number } {
  const lineStart = content.lastIndexOf("\n", start - 1) + 1;
  const nextNewline = content.indexOf("\n", end);
  return {
    start: lineStart,
    end: nextNewline === -1 ? content.length : nextNewline,
  };
}

function commentLineEdit(
  content: string,
  start: number,
  end: number,
  reason: string,
): TextEdit {
  const range = lineRangeForCommand(content, start, end);
  const segment = content.slice(range.start, range.end);
  const commented = segment
    .split("\n")
    .map((line) => (line.trimStart().startsWith("%") ? line : `% ${line}`))
    .join("\n");

  return {
    start: range.start,
    end: range.end,
    text: `% Auto-fix: ${reason}\n${commented}`,
  };
}

function applyEdits(content: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let result = content;
  for (const edit of sorted) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

function findPackageCommands(
  content: string,
): { start: number; end: number; options: string; packages: string[] }[] {
  const commands: {
    start: number;
    end: number;
    options: string;
    packages: string[];
  }[] = [];
  const regex =
    /\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g;

  for (const match of content.matchAll(regex)) {
    if (match.index === undefined || isCommented(content, match.index))
      continue;
    commands.push({
      start: match.index,
      end: match.index + match[0].length,
      options: match[1] ?? "",
      packages: (match[2] ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    });
  }

  return commands;
}

function graphEnvironmentTokens(
  content: string,
): { kind: "begin" | "end"; env: string; start: number; end: number }[] {
  const tokens: {
    kind: "begin" | "end";
    env: string;
    start: number;
    end: number;
  }[] = [];
  const regex = /\\(begin|end)\{([^}]+)\}/g;

  for (const match of content.matchAll(regex)) {
    if (match.index === undefined || isCommented(content, match.index)) {
      continue;
    }
    tokens.push({
      kind: match[1] as "begin" | "end",
      env: match[2],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return tokens;
}

const UNSAFE_BALANCE_PATTERN =
  /\\(?:begin|end)\s*\{(?:verbatim\*?|lstlisting|minted)\}|\\(?:verb|lstinline|mintinline)\b|\\(?:if(?!f\b)[a-zA-Z@]*|else|fi|unless)\b/;

function balanceEnvironments(
  content: string,
  reason: string,
): { content: string; changes: number } {
  // Code listings and TeX conditionals often alter or contain literal
  // \begin / \end tokens. Do not rewrite files that use them.
  const active = maskComments(content);
  if (UNSAFE_BALANCE_PATTERN.test(active)) {
    return { content, changes: 0 };
  }

  const tokens = graphEnvironmentTokens(active).filter(
    (token) => token.env !== "document",
  );
  const stack: { env: string; start: number }[] = [];
  const edits: TextEdit[] = [];
  let changes = 0;

  for (const token of tokens) {
    if (token.kind === "begin") {
      stack.push({ env: token.env, start: token.start });
      continue;
    }

    const top = stack[stack.length - 1];
    if (top?.env === token.env) {
      stack.pop();
      continue;
    }

    const matchingIndex = stack.findLastIndex((item) => item.env === token.env);

    if (matchingIndex === -1) {
      edits.push(
        commentLineEdit(
          content,
          token.start,
          token.end,
          `${reason}: unmatched \\end{${token.env}}`,
        ),
      );
      changes++;
      continue;
    }

    const inner = stack.slice(matchingIndex + 1);
    if (inner.length > 0) {
      const insertion = [...inner]
        .reverse()
        .map((item) => `\\end{${item.env}}`)
        .join("\n");
      edits.push({
        start: token.start,
        end: token.start,
        text: `% Auto-fix: close nested environments\n${insertion}\n`,
      });
      changes += inner.length;
      stack.splice(matchingIndex);
    } else {
      stack.pop();
    }
  }

  if (stack.length > 0) {
    const insertion = [...stack]
      .reverse()
      .map((item) => `\\end{${item.env}}`)
      .join("\n");
    const endDocument = active.lastIndexOf("\\end{document}");
    const start = endDocument === -1 ? content.length : endDocument;
    edits.push({
      start,
      end: start,
      text: `% Auto-fix: close unclosed environments\n${insertion}\n`,
    });
    changes += stack.length;
  }

  if (edits.length === 0) return { content, changes: 0 };

  return {
    content: applyEdits(content, edits),
    changes,
  };
}

function commentMissingGraphic(
  content: string,
  file: string,
): { content: string; count: number } {
  const target = normalizeGraphicPath(file);
  const matches = findGraphicCommands(content).filter((command) => {
    const current = normalizeGraphicPath(command.path);
    return (
      current === target ||
      current.endsWith(`/${target}`) ||
      target.endsWith(`/${current}`)
    );
  });

  if (matches.length === 0) return { content, count: 0 };

  const edits = matches.map((match) =>
    commentLineEdit(
      content,
      match.start,
      match.end,
      `missing graphic ${match.path || file}`,
    ),
  );

  return { content: applyEdits(content, edits), count: edits.length };
}

function addTheoremEnvironment(
  content: string,
  environment: string,
): string | null {
  const starred = environment.endsWith("*");
  const name = starred ? environment.slice(0, -1) : environment;
  if (!name) return null;

  const command = starred
    ? `\\newtheorem*{${name}}{${titleCase(name)}}`
    : `\\newtheorem{${name}}{${titleCase(name)}}`;

  const activeContent = maskComments(content);
  if (activeContent.includes(command)) return null;

  const beginAt = activeContent.indexOf("\\begin{document}");
  const preamble = beginAt === -1 ? content : content.slice(0, beginAt);
  const maskedPreamble = maskComments(preamble);
  if (
    maskedPreamble.includes(`\\newtheorem{${name}}`) ||
    maskedPreamble.includes(`\\newtheorem*{${name}}`)
  ) {
    return null;
  }

  let next = content;
  if (starred && !packageLoadedRegex("amsthm").test(maskComments(next))) {
    next = insertBeforeBeginDocument(next, "\\usepackage{amsthm}") ?? next;
  }

  return insertBeforeBeginDocument(
    next,
    `% Auto-fix: define missing environment ${environment}\n${command}`,
  );
}

function findCommandDefinitionRanges(
  content: string,
  command: string,
): { start: number; end: number }[] {
  const escaped = escapeRegExp(command);
  const regex = new RegExp(
    `\\\\newcommand\\*?\\s*(?:\\{\\s*\\\\${escaped}(?![a-zA-Z@])\\s*\\}|\\\\${escaped}(?![a-zA-Z@]))`,
    "g",
  );
  const ranges: { start: number; end: number }[] = [];
  const seenStarts = new Set<number>();

  for (const match of content.matchAll(regex)) {
    const index = match.index;
    if (index === undefined || isCommented(content, index)) continue;

    const lineStart = content.lastIndexOf("\n", index - 1) + 1;
    if (seenStarts.has(lineStart)) continue;
    const lineEnd = content.indexOf("\n", index);
    const end = lineEnd === -1 ? content.length : lineEnd;
    const activeLine = maskComments(content.slice(lineStart, end));

    let depth = 0;
    for (let i = 0; i < activeLine.length; i++) {
      const character = activeLine[i];
      if (character === "\\") {
        i++;
        continue;
      }
      if (character === "{") depth++;
      if (character === "}") depth--;
    }
    if (depth === 0) {
      seenStarts.add(lineStart);
      ranges.push({ start: lineStart, end });
    }
  }

  return ranges.sort((a, b) => a.start - b.start);
}

export interface AutoFixDiff {
  fileId: string;
  filePath: string;
  startLine: number;
  removed: string[];
  added: string[];
}

export interface AutoFixPreview {
  diagnosticId: string;
  description: string | null;
  updates: AutoFixDiff[];
  applied: string[];
}

function lineDiff(
  before: string,
  after: string,
): Omit<AutoFixDiff, "fileId" | "filePath"> {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  let start = 0;

  while (
    start < beforeLines.length &&
    start < afterLines.length &&
    beforeLines[start] === afterLines[start]
  ) {
    start++;
  }

  let beforeEnd = beforeLines.length - 1;
  let afterEnd = afterLines.length - 1;

  while (
    beforeEnd >= start &&
    afterEnd >= start &&
    beforeLines[beforeEnd] === afterLines[afterEnd]
  ) {
    beforeEnd--;
    afterEnd--;
  }

  return {
    startLine: start + 1,
    removed: beforeLines.slice(start, beforeEnd + 1),
    added: afterLines.slice(start, afterEnd + 1),
  };
}

export function previewAutoFix(input: {
  files: ProjectFile[];
  mainFileId: string | null;
  diagnostics: CompileDiagnostic[];
  diagnosticId: string;
}): AutoFixPreview {
  const diagnostic = input.diagnostics.find(
    (item) => item.id === input.diagnosticId,
  );
  const result = runAutoFixes(input);

  return {
    diagnosticId: input.diagnosticId,
    description: diagnostic ? describeAutoFix(diagnostic) : null,
    updates: result.updates.flatMap((update) => {
      const file = input.files.find((candidate) => candidate.id === update.id);
      if (!file) return [];
      return [
        {
          fileId: update.id,
          filePath: file.path,
          ...lineDiff(file.content ?? "", update.content),
        },
      ];
    }),
    applied: result.applied,
  };
}

function warningFamilyFor(diagnostic: CompileDiagnostic): WarningFamily | null {
  return (
    warningFamilyById(diagnostic.warningFamily) ??
    classifyLatexWarning(diagnostic.title, diagnostic.details)
  );
}

function overfullWidthPt(title: string): number {
  const match = /\(([\d.]+)\s*pt too wide\)/i.exec(title);
  const value = match ? Number.parseFloat(match[1]) : Number.NaN;
  return Number.isFinite(value) ? value : 0;
}

export function describeAutoFix(diagnostic: CompileDiagnostic): string | null {
  if (diagnostic.severity === "warning") {
    const family = warningFamilyFor(diagnostic);
    if (family?.id === "overfull-hbox") {
      return "Add emergency stretch for the overfull line";
    }
    return null;
  }

  switch (diagnostic.kind) {
    case "missing-graphic":
      return "Comment out the missing graphic";
    case "undefined-environment": {
      const env = diagnostic.data.environment;
      if (!env) return null;
      if (env === "proof") {
        return "Load amsthm for the proof environment";
      }
      if (ENVIRONMENT_PACKAGES[env]) {
        return `Load ${ENVIRONMENT_PACKAGES[env]} for this environment`;
      }
      if (THEOREM_LIKE.has(env.replace(/\*$/, ""))) {
        return "Define the theorem environment";
      }
      return null;
    }
    case "environment-mismatch":
      return "Balance the environment blocks";
    case "missing-package":
      return "Remove the missing package call";
    case "undefined-command":
      if (
        diagnostic.data.command &&
        COMMAND_PACKAGES[diagnostic.data.command]
      ) {
        return `Load ${COMMAND_PACKAGES[diagnostic.data.command]} for this command`;
      }
      return null;
    case "duplicate-command":
      return "Comment out the duplicate definition";
    case "preamble-only":
      return "Move the package to the preamble";
    case "misplaced-tab":
      return "Escape the & as \\&";
    case "misplaced-hash":
      return "Escape the # as \\#";
    case "math-mode":
      return /[_^}]$/.test(diagnostic.lineText ?? "")
        ? "Escape _ or ^ in typewriter text"
        : null;
    case "fatal":
      return diagnostic.data.noLegalEnd
        ? "Add the missing \\end{document}"
        : null;
    case "runaway-argument":
      return diagnostic.data.runaway
        ? "Close the unclosed argument when its end is unambiguous"
        : null;
    default:
      return null;
  }
}

function hasActiveEndDocument(contents: Map<string, string>): boolean {
  return [...contents.values()].some((content) =>
    /\\end\s*\{document\}/.test(maskComments(content)),
  );
}

type MoveResult = { ok: true; content: string } | { ok: false; reason: string };

const USEPACKAGE_LINE = /^\s*\\usepackage(\[[^\]]*\])?\{([^}]*)\}\s*(?:%.*)?$/;

/** R11: a \usepackage that sits after \begin{document} belongs in the preamble. */
function movePackageToPreamble(content: string, line: number): MoveResult {
  const lines = content.split(/(\r\n|\n|\r)/);
  // Even indices are text, odd indices are the separators.
  const text = lines[(line - 1) * 2];
  if (text === undefined) {
    return { ok: false, reason: "The diagnostic line is outside the file" };
  }

  const command = text.match(USEPACKAGE_LINE);
  if (!command) {
    return {
      ok: false,
      reason: "The line holds more than a single \\usepackage command",
    };
  }

  const lineStart = lines.slice(0, (line - 1) * 2).join("").length;
  const beginAt = content.indexOf("\\begin{document}");
  if (beginAt === -1 || lineStart < beginAt) {
    return {
      ok: false,
      reason: "The command is not after \\begin{document} in this file",
    };
  }

  const preamble = maskComments(content.slice(0, beginAt));
  const packages = command[2].split(",").map((name) => name.trim());
  const loaded = packages.find((name) =>
    packageLoadedRegex(name).test(preamble),
  );
  if (loaded) {
    return {
      ok: false,
      reason: `${loaded} is already loaded in the preamble; remove this duplicate by hand`,
    };
  }

  const commented = commentLineEdit(
    content,
    lineStart,
    lineStart + text.length,
    "moved to preamble",
  );
  const without = applyEdits(content, [commented]);
  const inserted = insertBeforeBeginDocument(
    without,
    `% Auto-fix: moved to preamble\n${text.trim()}`,
  );

  return inserted
    ? { ok: true, content: inserted }
    : { ok: false, reason: "Could not find a place in the preamble" };
}

export function runAutoFixes(input: FixInput): AutoFixResult {
  const texFiles = input.files.filter((file) => file.type === "tex");
  const mainFile =
    texFiles.find((file) => file.id === input.mainFileId) ??
    texFiles.find((file) =>
      (file.content ?? "").includes("\\begin{document}"),
    ) ??
    texFiles[0] ??
    null;

  if (!mainFile) {
    return {
      updates: [],
      applied: [],
      skipped: input.diagnostics.map((diagnostic) => ({
        diagnosticId: diagnostic.id,
        reason: "No LaTeX source file found",
      })),
    };
  }

  const contents = new Map(
    texFiles.map((file) => [file.id, file.content ?? ""]),
  );
  const applied: string[] = [];
  const skipped: { diagnosticId: string; reason: string }[] = [];
  const seen = new Set<string>();
  const targetDiagnostics = input.diagnosticId
    ? input.diagnostics.filter(
        (diagnostic) => diagnostic.id === input.diagnosticId,
      )
    : input.diagnostics;

  const overfullHbox = targetDiagnostics.filter(
    (diagnostic) =>
      diagnostic.severity === "warning" &&
      warningFamilyFor(diagnostic)?.id === "overfull-hbox",
  );
  // A global \sloppy is justified when the log reports several overfull
  // paragraphs or one severe overflow; otherwise emergency stretch is milder.
  const useSloppy =
    overfullHbox.length >= 2 ||
    overfullHbox.some((diagnostic) => overfullWidthPt(diagnostic.title) >= 20);
  let overfullHandled = false;

  const updateMain = (next: string | null, message: string) => {
    if (!next || next === contents.get(mainFile.id)) return false;
    contents.set(mainFile.id, next);
    applied.push(message);
    return true;
  };

  for (const diagnostic of targetDiagnostics) {
    if (diagnostic.severity === "warning") {
      const family = warningFamilyFor(diagnostic);
      if (family?.id !== "overfull-hbox") {
        skipped.push({
          diagnosticId: diagnostic.id,
          reason: "Warnings are reported but are not auto-fixed",
        });
        continue;
      }
      if (overfullHandled) continue;
      overfullHandled = true;

      const content = contents.get(mainFile.id) ?? "";
      const beginAt = content.indexOf("\\begin{document}");
      const preamble = maskComments(
        beginAt === -1 ? content : content.slice(0, beginAt),
      );
      if (/\\(?:sloppy|emergencystretch)\b/.test(preamble)) {
        skipped.push({
          diagnosticId: diagnostic.id,
          reason: "The preamble already has \\sloppy or \\emergencystretch",
        });
        continue;
      }

      const block = useSloppy
        ? "% Auto-fix: repeated overfull lines\n\\sloppy"
        : "% Auto-fix: overfull lines\n\\setlength{\\emergencystretch}{2em}";
      const next = insertBeforeBeginDocument(content, block);
      if (
        !updateMain(
          next,
          useSloppy
            ? "Enabled \\sloppy for repeated overfull lines"
            : "Added emergency stretch for overfull lines",
        )
      ) {
        skipped.push({
          diagnosticId: diagnostic.id,
          reason: "Could not find a place in the preamble",
        });
      }
      continue;
    }

    const key = `${diagnostic.kind}:${diagnostic.data.environment ?? ""}:${diagnostic.data.begin ?? ""}:${diagnostic.data.end ?? ""}:${diagnostic.data.file ?? ""}:${diagnostic.data.command ?? ""}:${diagnostic.data.runaway ?? ""}${POSITIONAL_KINDS.has(diagnostic.kind) ? `:${diagnostic.fileId ?? ""}:${diagnostic.line ?? ""}:${diagnostic.lineText ?? ""}` : ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let changed = false;

    if (diagnostic.kind === "missing-graphic") {
      if (!diagnostic.data.file) {
        skipped.push({
          diagnosticId: diagnostic.id,
          reason: "The log did not include a graphic path",
        });
        continue;
      }

      let count = 0;
      for (const file of texFiles) {
        const next = contents.get(file.id) ?? "";
        const result = commentMissingGraphic(next, diagnostic.data.file);
        if (result.count > 0) {
          contents.set(file.id, result.content);
          count += result.count;
        }
      }

      if (count > 0) {
        applied.push(
          `Commented out ${count} missing graphic${count === 1 ? "" : "s"}`,
        );
        changed = true;
      }
    } else if (diagnostic.kind === "undefined-environment") {
      const environment = diagnostic.data.environment;
      if (!environment) {
        skipped.push({
          diagnosticId: diagnostic.id,
          reason: "The log did not name the environment",
        });
        continue;
      }

      const packageName =
        environment === "proof" ? "amsthm" : ENVIRONMENT_PACKAGES[environment];

      if (packageName) {
        if (isPackageLoaded(contents, packageName)) {
          skipped.push({
            diagnosticId: diagnostic.id,
            reason: `${packageName} is already loaded; this environment needs a manual definition`,
          });
          continue;
        }

        const next = addPackage(
          contents.get(mainFile.id) ?? "",
          packageName,
          `environment ${environment}`,
        );
        if (updateMain(next, `Loaded ${packageName} for ${environment}`)) {
          changed = true;
        }
      } else if (THEOREM_LIKE.has(environment.replace(/\*$/, ""))) {
        const next = addTheoremEnvironment(
          contents.get(mainFile.id) ?? "",
          environment,
        );
        if (updateMain(next, `Defined environment ${environment}`)) {
          changed = true;
        }
      }
    } else if (diagnostic.kind === "environment-mismatch") {
      let count = 0;
      for (const file of texFiles) {
        const next = contents.get(file.id) ?? "";
        const balanced = balanceEnvironments(next, "environment mismatch");
        if (balanced.changes > 0) {
          contents.set(file.id, balanced.content);
          count += balanced.changes;
        }
      }
      if (count > 0) {
        applied.push(
          `Balanced ${count} environment block${count === 1 ? "" : "s"}`,
        );
        changed = true;
      }
    } else if (diagnostic.kind === "missing-package") {
      const packageName =
        diagnostic.data.package ??
        diagnostic.data.file
          ?.split("/")
          .pop()
          ?.replace(/\.sty$/i, "");
      if (!packageName) {
        skipped.push({
          diagnosticId: diagnostic.id,
          reason: "The log did not name the package",
        });
        continue;
      }

      let count = 0;
      for (const file of texFiles) {
        const next = contents.get(file.id) ?? "";
        const result = removeMissingPackageCalls(next, packageName);
        if (result.count > 0) {
          contents.set(file.id, result.content);
          count += result.count;
        }
      }
      if (count > 0) {
        applied.push(`Removed missing package ${packageName}`);
        changed = true;
      }
    } else if (diagnostic.kind === "undefined-command") {
      const command = diagnostic.data.command;
      const packageName = command ? COMMAND_PACKAGES[command] : undefined;

      if (!command || !packageName) {
        skipped.push({
          diagnosticId: diagnostic.id,
          reason: "No deterministic package mapping for this command",
        });
        continue;
      }

      if (hasLocalCommandDefinition(contents, command)) {
        skipped.push({
          diagnosticId: diagnostic.id,
          reason: `\\${command} is defined locally in the project and needs a manual fix`,
        });
        continue;
      }

      if (isPackageLoaded(contents, packageName)) {
        skipped.push({
          diagnosticId: diagnostic.id,
          reason: `${packageName} is already loaded; this command needs a manual fix`,
        });
        continue;
      }

      const next = addPackage(
        contents.get(mainFile.id) ?? "",
        packageName,
        `command \\${command}`,
      );
      if (updateMain(next, `Loaded ${packageName} for \\${command}`)) {
        changed = true;
      }
    } else if (diagnostic.kind === "runaway-argument") {
      if (!diagnostic.data.runaway) {
        skipped.push({
          diagnosticId: diagnostic.id,
          reason: "The log did not include the runaway text",
        });
        continue;
      }

      const closed = closeRunawayArgument(
        texFiles.map((file) => ({
          id: file.id,
          content: contents.get(file.id) ?? "",
        })),
        diagnostic.data.runaway,
      );
      if (!closed.ok) {
        skipped.push({ diagnosticId: diagnostic.id, reason: closed.reason });
        continue;
      }

      contents.set(closed.fileId, closed.content);
      const path = texFiles.find((file) => file.id === closed.fileId)?.path;
      applied.push(
        `Closed an unclosed argument on line ${closed.line} of ${path ?? "the document"}`,
      );
      changed = true;
    } else if (diagnostic.kind === "preamble-only") {
      const target = texFiles.find((file) => file.id === diagnostic.fileId);
      if (!target || !diagnostic.line) {
        skipped.push({
          diagnosticId: diagnostic.id,
          reason: "Could not tell which line of which file to move",
        });
        continue;
      }
      if (diagnostic.data.command !== "usepackage") {
        skipped.push({
          diagnosticId: diagnostic.id,
          reason: "Only \\usepackage is moved automatically",
        });
        continue;
      }

      const moved = movePackageToPreamble(
        contents.get(target.id) ?? "",
        diagnostic.line,
      );
      if (!moved.ok) {
        skipped.push({ diagnosticId: diagnostic.id, reason: moved.reason });
        continue;
      }
      contents.set(target.id, moved.content);
      applied.push("Moved \\usepackage to the preamble");
      changed = true;
    } else if (
      diagnostic.kind === "misplaced-tab" ||
      diagnostic.kind === "misplaced-hash" ||
      (diagnostic.kind === "math-mode" &&
        /[_^}]$/.test(diagnostic.lineText ?? ""))
    ) {
      const target = texFiles.find((file) => file.id === diagnostic.fileId);
      if (!target) {
        skipped.push({
          diagnosticId: diagnostic.id,
          reason: "Could not tell which file the error is in",
        });
        continue;
      }

      const escaped = escapeReservedCharacter(
        contents.get(target.id) ?? "",
        diagnostic,
      );
      if (!escaped.ok) {
        skipped.push({ diagnosticId: diagnostic.id, reason: escaped.reason });
        continue;
      }
      contents.set(target.id, escaped.content);
      applied.push(
        `Escaped a reserved character on line ${diagnostic.line} of ${target.path}`,
      );
      changed = true;
    } else if (diagnostic.kind === "fatal" && diagnostic.data.noLegalEnd) {
      if (targetDiagnostics.some((item) => item.kind === "runaway-argument")) {
        skipped.push({
          diagnosticId: diagnostic.id,
          reason: "A runaway argument is pending; fix that and recompile first",
        });
        continue;
      }
      if (hasActiveEndDocument(contents)) {
        skipped.push({
          diagnosticId: diagnostic.id,
          reason:
            "\\end{document} already exists; the log message is only a symptom",
        });
        continue;
      }

      const current = contents.get(mainFile.id) ?? "";
      if (!maskComments(current).includes("\\begin{document}")) {
        skipped.push({
          diagnosticId: diagnostic.id,
          reason: "The main file has no \\begin{document}",
        });
        continue;
      }
      const separator = current.endsWith("\n") ? "" : "\n";
      const next = `${current}${separator}% Auto-fix: missing \\end{document}\n\\end{document}\n`;
      if (updateMain(next, "Added the missing \\end{document}")) changed = true;
    } else if (diagnostic.kind === "duplicate-command") {
      const command = diagnostic.data.command;
      if (!command) {
        skipped.push({
          diagnosticId: diagnostic.id,
          reason: "The log did not name the duplicate command",
        });
        continue;
      }

      let skippedDifferent = false;
      for (const file of texFiles) {
        const next = contents.get(file.id) ?? "";
        const ranges = findCommandDefinitionRanges(next, command);
        if (ranges.length > 1) {
          const normalize = (range: { start: number; end: number }) =>
            maskComments(next.slice(range.start, range.end)).trim();
          const firstNormalized = normalize(ranges[0]);
          const identicalDuplicates = ranges
            .slice(1)
            .filter((range) => normalize(range) === firstNormalized);

          if (identicalDuplicates.length === 0) {
            skipped.push({
              diagnosticId: diagnostic.id,
              reason:
                "Different definitions require a manual renewcommand/rename decision",
            });
            skippedDifferent = true;
            break;
          }

          const edits = identicalDuplicates.map((range) =>
            commentLineEdit(
              next,
              range.start,
              range.end,
              `duplicate command \\${command}`,
            ),
          );
          contents.set(file.id, applyEdits(next, edits));
          applied.push(
            `Commented ${edits.length} duplicate definition${edits.length === 1 ? "" : "s"} of \\${command}`,
          );
          changed = true;
          break;
        }
      }
      if (skippedDifferent) continue;

      if (!changed) {
        const crossFileDefs: string[] = [];
        for (const file of texFiles) {
          const next = contents.get(file.id) ?? "";
          for (const range of findCommandDefinitionRanges(next, command)) {
            crossFileDefs.push(
              maskComments(next.slice(range.start, range.end)).trim(),
            );
          }
        }
        if (
          crossFileDefs.length > 1 &&
          crossFileDefs.some((def) => def !== crossFileDefs[0])
        ) {
          skipped.push({
            diagnosticId: diagnostic.id,
            reason:
              "Different definitions require a manual renewcommand/rename decision",
          });
          continue;
        }
      }
    }

    if (!changed) {
      skipped.push({
        diagnosticId: diagnostic.id,
        reason: "No deterministic safe fix matched this diagnostic",
      });
    }
  }

  return {
    updates: texFiles
      .filter((file) => contents.get(file.id) !== (file.content ?? ""))
      .map((file) => ({
        id: file.id,
        content: contents.get(file.id) ?? "",
      })),
    applied,
    skipped,
  };
}

function removeMissingPackageCalls(
  content: string,
  packageName: string,
): { content: string; count: number } {
  const commands = findPackageCommands(content).filter((command) =>
    command.packages.includes(packageName),
  );

  if (commands.length === 0) return { content, count: 0 };

  const edits: TextEdit[] = [];

  for (const command of commands) {
    const remaining = command.packages.filter((item) => item !== packageName);

    if (remaining.length === 0) {
      edits.push(
        commentLineEdit(
          content,
          command.start,
          command.end,
          `missing package ${packageName}`,
        ),
      );
    } else {
      const options = command.options ? `[${command.options}]` : "";
      edits.push({
        start: command.start,
        end: command.end,
        text: `\\usepackage${options}{${remaining.join(",")}}`,
      });
    }
  }

  return {
    content: applyEdits(content, edits),
    count: edits.length,
  };
}
