import { validateLatexEditIntegrity } from "@/lib/latex-linter";
import { isLatexDocumentFile } from "@/lib/project-files";
import {
  anchorEdit,
  anchorEditSmart,
  applyEdits,
  normalizeEol,
  offsetsToLineRange,
  reindentReplacement,
  resolveProjectFile,
  type AppliedEdit,
  type EditSpec,
} from "./file-edits";

export type PatchInput = {
  startLine?: number;
  endLine?: number;
  replacement: string;
  oldText?: string;
  fuzzyFallback?: boolean;
};

export type PatchPlan =
  | {
      ok: true;
      startLine: number;
      endLine: number;
      before: string;
      after: string;
      integrityWarnings?: string[];
    }
  | { ok: false; error: string };

const MAX_PATCH_LINES = 300;

function formatIntegrityWarnings(
  before: string,
  after: string,
): string[] | undefined {
  const integrity = validateLatexEditIntegrity(before, after);
  if (integrity.ok) return undefined;
  return integrity.introduced.map(
    (issue) => `[${issue.code}] Line ${issue.line}: ${issue.message}`,
  );
}

export function planPatch(content: string, input: PatchInput): PatchPlan {
  const text = normalizeEol(content);
  const replacement = normalizeEol(input.replacement);

  let startLine: number;
  let endLine: number;
  let before: string;
  let after: string;
  let afterDoc: string;

  if (input.oldText !== undefined) {
    let anchor = anchorEdit(text, { find: input.oldText });
    let effectiveReplacement = replacement;

    if (
      !anchor.ok &&
      anchor.reason === "not_found" &&
      input.fuzzyFallback !== false
    ) {
      const smart = anchorEditSmart(text, { find: input.oldText });
      if (smart.ok) {
        anchor = smart;
        if (smart.indentDelta) {
          effectiveReplacement = reindentReplacement(
            replacement,
            smart.indentDelta,
          );
        }
      } else if (smart.reason === "ambiguous") {
        anchor = smart;
      }
    }

    if (!anchor.ok) {
      switch (anchor.reason) {
        case "ambiguous":
          return {
            ok: false,
            error: `oldText matches ${anchor.count} places (lines ${anchor.lines.join(", ")}). Include more surrounding text.`,
          };
        case "empty_find":
          return { ok: false, error: "oldText must not be empty." };
        default:
          return { ok: false, error: "oldText was not found in the file." };
      }
    }
    ({ startLine, endLine } = offsetsToLineRange(
      text,
      anchor.start,
      anchor.end,
    ));
    // A match ending in "\n" consumes the line break, so the range reaches
    // into the following line (possibly the empty one after a final "\n").
    const endsWithNewline = text.charCodeAt(anchor.end - 1) === 10;
    if (endsWithNewline) {
      endLine = offsetsToLineRange(text, anchor.end, anchor.end).startLine;
    }
    const lineStart = text.lastIndexOf("\n", anchor.start - 1) + 1;
    const newline = text.indexOf(
      "\n",
      endsWithNewline ? anchor.end : anchor.end - 1,
    );
    const lineEnd = newline === -1 ? text.length : newline;
    before = text.slice(lineStart, lineEnd);
    after =
      text.slice(lineStart, anchor.start) +
      effectiveReplacement +
      text.slice(anchor.end, lineEnd);
    afterDoc = text.slice(0, lineStart) + after + text.slice(lineEnd);
    if (endLine - startLine > MAX_PATCH_LINES) {
      return { ok: false, error: "Patch is too large to review safely." };
    }
  } else {
    if (input.startLine === undefined || input.endLine === undefined) {
      return {
        ok: false,
        error: "Provide oldText or both startLine and endLine.",
      };
    }
    startLine = input.startLine;
    endLine = input.endLine;
    if (endLine < startLine) {
      return { ok: false, error: "endLine must be >= startLine." };
    }
    if (endLine - startLine > MAX_PATCH_LINES) {
      return { ok: false, error: "Patch is too large to review safely." };
    }
    const lines = text.split("\n");
    if (startLine > lines.length + 1 || endLine > lines.length) {
      return {
        ok: false,
        error: `Line range is outside the file (${lines.length} lines).`,
      };
    }
    before = lines.slice(startLine - 1, endLine).join("\n");
    after = replacement;
    afterDoc = [
      ...lines.slice(0, startLine - 1),
      after,
      ...lines.slice(endLine),
    ].join("\n");
  }

  if (before === after) {
    return { ok: false, error: "The replacement is identical." };
  }

  const integrityWarnings = formatIntegrityWarnings(text, afterDoc);
  return {
    ok: true,
    startLine,
    endLine,
    before,
    after,
    ...(integrityWarnings ? { integrityWarnings } : {}),
  };
}

export type FindAndReplaceInput = {
  find: string;
  replace: string;
  path?: string;
  replaceAll?: boolean;
  contextBefore?: string;
  contextAfter?: string;
  fuzzyFallback?: boolean;
};

export type FileLike = {
  id: string;
  path: string;
  name: string;
  type: string;
  content?: string | null;
};

export type FindAndReplacePlan =
  | {
      success: true;
      fileId: string;
      filePath: string;
      newContent: string;
      replacements: number;
      applied: AppliedEdit[];
      integrityWarnings?: string[];
    }
  | { success: false; error: string };

export function planFindAndReplace(
  files: FileLike[],
  activeFileId: string,
  input: FindAndReplaceInput,
): FindAndReplacePlan {
  const file = input.path
    ? resolveProjectFile(files, input.path)
    : files.find((candidate) => candidate.id === activeFileId);
  if (!file) {
    return {
      success: false,
      error: input.path
        ? `File not found: ${input.path}. Use list_project_files to see available paths.`
        : "No active file is open to edit.",
    };
  }
  if (file.type !== "tex") {
    return {
      success: false,
      error: `Cannot edit a binary file: ${file.path}. Only text (.tex) files can be edited.`,
    };
  }
  if (input.find === "") {
    return { success: false, error: '"find" must not be empty.' };
  }
  if (normalizeEol(input.find) === normalizeEol(input.replace)) {
    return {
      success: false,
      error: '"find" and "replace" are identical, so nothing would change.',
    };
  }

  const rawContent = file.content ?? "";
  const spec: EditSpec = {
    find: input.find,
    replace: input.replace,
    contextBefore: input.contextBefore,
    contextAfter: input.contextAfter,
    replaceAll: input.replaceAll,
    fuzzyFallback: false,
  };
  let result = applyEdits(rawContent, [spec]);
  if (
    !result.ok &&
    result.reason === "not_found" &&
    !input.replaceAll &&
    input.fuzzyFallback !== false
  ) {
    result = applyEdits(rawContent, [{ ...spec, fuzzyFallback: true }]);
  }

  if (!result.ok) {
    switch (result.reason) {
      case "empty_find":
        return { success: false, error: '"find" must not be empty.' };
      case "not_found":
        return {
          success: false,
          error: `Could not find the given "find" text in ${file.path}. Check it matches the file exactly (including context), or re-read the file.`,
        };
      case "ambiguous":
        return {
          success: false,
          error: `"find" matches ${result.count} places (lines ${(result.lines ?? []).join(", ")}). Add contextBefore/contextAfter to pick one, or set replaceAll.`,
        };
      default:
        return {
          success: false,
          error: "The edit overlaps with another edit and cannot be applied.",
        };
    }
  }

  if (normalizeEol(result.content) === normalizeEol(rawContent)) {
    return {
      success: false,
      error: '"find" and "replace" are identical, so nothing would change.',
    };
  }

  const integrityWarnings = isLatexDocumentFile({
    name: file.name,
    type: file.type as "tex" | "image" | "binary",
  })
    ? formatIntegrityWarnings(rawContent, result.content)
    : undefined;

  return {
    success: true,
    fileId: file.id,
    filePath: file.path,
    newContent: result.content,
    replacements: result.applied.length,
    applied: result.applied,
    ...(integrityWarnings ? { integrityWarnings } : {}),
  };
}
