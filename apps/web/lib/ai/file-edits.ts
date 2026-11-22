export type EditSpec = {
  find: string;
  replace: string;
  contextBefore?: string;
  contextAfter?: string;
  replaceAll?: boolean;
  fuzzyFallback?: boolean;
};

export type AnchorFailure =
  | { ok: false; reason: "empty_find" }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "ambiguous"; count: number; lines: number[] };

export type AnchorResult =
  | { ok: true; start: number; end: number }
  | AnchorFailure;

export type SmartMatchTier =
  | "exact"
  | "trimmed-lines"
  | "whitespace-normalized";

export type SmartAnchorResult =
  | {
      ok: true;
      start: number;
      end: number;
      matchTier: SmartMatchTier;
      indentDelta?: number;
    }
  | AnchorFailure;

export type AppliedEdit = {
  start: number;
  end: number;
  before: string;
  after: string;
};

export type ApplyResult =
  | { ok: true; content: string; applied: AppliedEdit[] }
  | {
      ok: false;
      reason: "empty_find" | "not_found" | "ambiguous" | "overlap";
      editIndex: number;
      count?: number;
      lines?: number[];
    };

/** Line endings are normalized once here so anchors never depend on CRLF. */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

type Range = { start: number; end: number };

function findOccurrences(
  text: string,
  spec: Pick<EditSpec, "find" | "contextBefore" | "contextAfter">,
  overlapping = false,
): Range[] {
  const find = normalizeEol(spec.find);
  const before = normalizeEol(spec.contextBefore ?? "");
  const after = normalizeEol(spec.contextAfter ?? "");
  const found: Range[] = [];
  let from = 0;
  while (from <= text.length) {
    const at = text.indexOf(find, from);
    if (at === -1) break;
    const end = at + find.length;
    const contextOk =
      text.slice(Math.max(0, at - before.length), at) === before &&
      text.slice(end, end + after.length) === after;
    if (contextOk) {
      found.push({ start: at, end });
      from = overlapping ? at + 1 : end;
    } else {
      from = at + 1;
    }
  }
  return found;
}

export function anchorEdit(
  content: string,
  spec: Pick<EditSpec, "find" | "contextBefore" | "contextAfter">,
): AnchorResult {
  if (spec.find === "") return { ok: false, reason: "empty_find" };
  const text = normalizeEol(content);
  const found = findOccurrences(text, spec, true);
  if (found.length === 0) return { ok: false, reason: "not_found" };
  if (found.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      count: found.length,
      lines: found.map((range) => lineAt(text, range.start)),
    };
  }
  return { ok: true, start: found[0].start, end: found[0].end };
}

function leadingIndentWidth(line: string): number {
  let width = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === " ") width += 1;
    else if (line[i] === "\t") width += 4;
    else break;
  }
  return width;
}

/**
 * Re-indents non-empty lines of `replace` by `indentDelta` spaces (positive
 * adds spaces; negative strips leading spaces/tabs up to `-indentDelta` columns).
 */
export function reindentReplacement(
  replace: string,
  indentDelta?: number,
): string {
  if (!indentDelta) return replace;
  const lines = normalizeEol(replace).split("\n");
  return lines
    .map((line) => {
      if (line.trim().length === 0) return "";
      if (indentDelta > 0) {
        return " ".repeat(indentDelta) + line;
      }
      let remaining = -indentDelta;
      let idx = 0;
      while (idx < line.length && remaining > 0) {
        if (line[idx] === " ") {
          remaining -= 1;
          idx += 1;
        } else if (line[idx] === "\t") {
          remaining = Math.max(0, remaining - 4);
          idx += 1;
        } else {
          break;
        }
      }
      return line.slice(idx);
    })
    .join("\n");
}

function trimTrailingHorizontalLines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n");
}

function anchorTrimmedLines(
  text: string,
  spec: Pick<EditSpec, "find" | "contextBefore" | "contextAfter">,
): SmartAnchorResult {
  const findTrimmed = trimTrailingHorizontalLines(normalizeEol(spec.find));
  if (findTrimmed.trim() === "") return { ok: false, reason: "not_found" };

  const rawLines = text.split("\n");
  const projChars: string[] = [];
  const origStarts: number[] = [];
  const origEnds: number[] = [];
  const lineRanges: { lineStart: number; lineEnd: number }[] = [];
  const charLineIdx: number[] = [];

  let offset = 0;
  for (let li = 0; li < rawLines.length; li++) {
    const rawLine = rawLines[li];
    const lineStart = offset;
    const lineEnd = offset + rawLine.length;
    lineRanges.push({ lineStart, lineEnd });
    const trimmed = rawLine.replace(/[ \t]+$/, "");
    for (let k = 0; k < trimmed.length; k++) {
      projChars.push(trimmed[k]);
      origStarts.push(lineStart + k);
      origEnds.push(lineStart + k + 1);
      charLineIdx.push(li);
    }
    if (li < rawLines.length - 1) {
      projChars.push("\n");
      origStarts.push(lineEnd);
      origEnds.push(lineEnd + 1);
      charLineIdx.push(li);
    }
    offset = lineEnd + 1;
  }

  const projText = projChars.join("");
  const beforeTrimmed = spec.contextBefore
    ? trimTrailingHorizontalLines(normalizeEol(spec.contextBefore))
    : "";
  const afterTrimmed = spec.contextAfter
    ? trimTrailingHorizontalLines(normalizeEol(spec.contextAfter))
    : "";

  const hits: Range[] = [];
  let from = 0;
  while (from <= projText.length) {
    const at = projText.indexOf(findTrimmed, from);
    if (at === -1) break;
    const end = at + findTrimmed.length;
    const contextOk =
      projText.slice(Math.max(0, at - beforeTrimmed.length), at) ===
        beforeTrimmed &&
      projText.slice(end, end + afterTrimmed.length) === afterTrimmed;

    if (contextOk) {
      const startOffset = origStarts[at] ?? 0;
      let endOffset = origEnds[end - 1] ?? startOffset;
      const lastLineIdx = charLineIdx[end - 1] ?? 0;
      const atLineEndInProj = end === projText.length || projText[end] === "\n";
      if (atLineEndInProj && projText[end - 1] !== "\n") {
        endOffset = lineRanges[lastLineIdx]?.lineEnd ?? endOffset;
      }
      hits.push({ start: startOffset, end: endOffset });
      from = at + 1;
    } else {
      from = at + 1;
    }
  }

  if (hits.length === 0) return { ok: false, reason: "not_found" };
  if (hits.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      count: hits.length,
      lines: hits.map((range) => lineAt(text, range.start)),
    };
  }
  return {
    ok: true,
    start: hits[0].start,
    end: hits[0].end,
    matchTier: "trimmed-lines",
  };
}

function normalizeHorizontalLines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .join("\n");
}

interface LineMeta {
  lineStart: number;
  lineEnd: number;
  firstNonWsOffset: number;
  lastNonWsEndOffset: number;
  indentWidth: number;
}

function anchorWhitespaceNormalized(
  text: string,
  spec: Pick<EditSpec, "find" | "contextBefore" | "contextAfter">,
): SmartAnchorResult {
  const rawFind = normalizeEol(spec.find);
  const normFind = normalizeHorizontalLines(rawFind);
  if (normFind.trim() === "") return { ok: false, reason: "not_found" };

  const rawLines = text.split("\n");
  const normChars: string[] = [];
  const origStarts: number[] = [];
  const origEnds: number[] = [];
  const charLineIdx: number[] = [];
  const lineMetas: LineMeta[] = [];

  let offset = 0;
  for (let li = 0; li < rawLines.length; li++) {
    const rawLine = rawLines[li];
    const lineStart = offset;
    const lineEnd = offset + rawLine.length;

    let firstNonWs = 0;
    while (
      firstNonWs < rawLine.length &&
      (rawLine[firstNonWs] === " " || rawLine[firstNonWs] === "\t")
    ) {
      firstNonWs++;
    }
    let lastNonWs = rawLine.length;
    while (
      lastNonWs > firstNonWs &&
      (rawLine[lastNonWs - 1] === " " || rawLine[lastNonWs - 1] === "\t")
    ) {
      lastNonWs--;
    }

    lineMetas.push({
      lineStart,
      lineEnd,
      firstNonWsOffset: lineStart + firstNonWs,
      lastNonWsEndOffset: lineStart + lastNonWs,
      indentWidth: leadingIndentWidth(rawLine),
    });

    let k = firstNonWs;
    while (k < lastNonWs) {
      const ch = rawLine[k];
      if (ch === " " || ch === "\t") {
        const runStart = k;
        while (k < lastNonWs && (rawLine[k] === " " || rawLine[k] === "\t")) {
          k++;
        }
        normChars.push(" ");
        origStarts.push(lineStart + runStart);
        origEnds.push(lineStart + k);
        charLineIdx.push(li);
      } else {
        normChars.push(ch);
        origStarts.push(lineStart + k);
        origEnds.push(lineStart + k + 1);
        charLineIdx.push(li);
        k++;
      }
    }

    if (li < rawLines.length - 1) {
      normChars.push("\n");
      origStarts.push(lineEnd);
      origEnds.push(lineEnd + 1);
      charLineIdx.push(li);
    }
    offset = lineEnd + 1;
  }

  const normText = normChars.join("");
  const normBefore = spec.contextBefore
    ? normalizeHorizontalLines(normalizeEol(spec.contextBefore)).trim()
    : "";
  const normAfter = spec.contextAfter
    ? normalizeHorizontalLines(normalizeEol(spec.contextAfter)).trim()
    : "";

  const findLines = rawFind.split("\n");
  const firstNonEmptyFindLine =
    findLines.find((line) => line.trim().length > 0) ?? findLines[0] ?? "";
  const findIndent = leadingIndentWidth(firstNonEmptyFindLine);

  const hits: { start: number; end: number; indentDelta?: number }[] = [];
  let from = 0;
  while (from <= normText.length) {
    const at = normText.indexOf(normFind, from);
    if (at === -1) break;
    const end = at + normFind.length;

    const beforeSlice = normText.slice(0, at).trimEnd();
    const afterSlice = normText.slice(end).trimStart();
    const contextOk =
      (normBefore === "" || beforeSlice.endsWith(normBefore)) &&
      (normAfter === "" || afterSlice.startsWith(normAfter));

    if (contextOk) {
      const firstCharOffset = origStarts[at] ?? 0;
      const firstLineIdx = charLineIdx[at] ?? 0;
      const firstLineMeta = lineMetas[firstLineIdx];
      const startsAtLineContent =
        firstLineMeta !== undefined &&
        firstCharOffset <= firstLineMeta.firstNonWsOffset &&
        normFind[0] !== "\n";

      let startOffset = firstCharOffset;
      let indentDelta: number | undefined;
      if (startsAtLineContent && firstLineMeta) {
        startOffset = firstLineMeta.lineStart;
        const delta = firstLineMeta.indentWidth - findIndent;
        if (delta !== 0) {
          indentDelta = delta;
        }
      }

      let endOffset = origEnds[end - 1] ?? startOffset;
      const lastLineIdx = charLineIdx[end - 1] ?? firstLineIdx;
      const lastLineMeta = lineMetas[lastLineIdx];
      const endsAtLineContent =
        end === normText.length || normText[end] === "\n";
      if (lastLineMeta && endsAtLineContent && normText[end - 1] !== "\n") {
        endOffset = lastLineMeta.lineEnd;
      }

      hits.push({
        start: startOffset,
        end: endOffset,
        ...(indentDelta !== undefined ? { indentDelta } : {}),
      });
      from = at + 1;
    } else {
      from = at + 1;
    }
  }

  if (hits.length === 0) return { ok: false, reason: "not_found" };
  if (hits.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      count: hits.length,
      lines: hits.map((hit) => lineAt(text, hit.start)),
    };
  }

  return {
    ok: true,
    start: hits[0].start,
    end: hits[0].end,
    matchTier: "whitespace-normalized",
    ...(hits[0].indentDelta !== undefined
      ? { indentDelta: hits[0].indentDelta }
      : {}),
  };
}

/**
 * Multi-tier edit anchoring:
 * 1) Exact match via `anchorEdit`
 * 2) Unique trailing-whitespace-normalized line match
 * 3) Unique horizontal-whitespace & indent-insensitive match (reporting `indentDelta`)
 */
export function anchorEditSmart(
  content: string,
  spec: Pick<EditSpec, "find" | "contextBefore" | "contextAfter">,
): SmartAnchorResult {
  if (spec.find === "") return { ok: false, reason: "empty_find" };
  const text = normalizeEol(content);

  const exact = anchorEdit(text, spec);
  if (exact.ok) {
    return {
      ok: true,
      start: exact.start,
      end: exact.end,
      matchTier: "exact",
    };
  }
  if (exact.reason === "ambiguous" || exact.reason === "empty_find") {
    return exact;
  }

  const trimmed = anchorTrimmedLines(text, spec);
  if (trimmed.ok || trimmed.reason === "ambiguous") {
    return trimmed;
  }

  return anchorWhitespaceNormalized(text, spec);
}

export function applyEdits(content: string, edits: EditSpec[]): ApplyResult {
  const usesCrlf = content.includes("\r\n");
  const text = normalizeEol(content);

  // Validate every anchor against the original text before changing anything.
  const planned: {
    start: number;
    end: number;
    replace: string;
    index: number;
  }[] = [];
  for (let index = 0; index < edits.length; index += 1) {
    const spec = edits[index];
    const replace = normalizeEol(spec.replace);
    if (spec.replaceAll) {
      if (spec.find === "") {
        return { ok: false, reason: "empty_find", editIndex: index };
      }
      const found = findOccurrences(text, spec);
      if (found.length === 0) {
        return { ok: false, reason: "not_found", editIndex: index };
      }
      for (const range of found) planned.push({ ...range, replace, index });
      continue;
    }
    const anchor: SmartAnchorResult = spec.fuzzyFallback
      ? anchorEditSmart(text, spec)
      : (() => {
          const exact = anchorEdit(text, spec);
          return exact.ok ? { ...exact, matchTier: "exact" as const } : exact;
        })();
    if (!anchor.ok) {
      return anchor.reason === "ambiguous"
        ? {
            ok: false,
            reason: "ambiguous",
            editIndex: index,
            count: anchor.count,
            lines: anchor.lines,
          }
        : { ok: false, reason: anchor.reason, editIndex: index };
    }
    const finalReplace = anchor.indentDelta
      ? reindentReplacement(replace, anchor.indentDelta)
      : replace;
    planned.push({
      start: anchor.start,
      end: anchor.end,
      replace: finalReplace,
      index,
    });
  }

  planned.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < planned.length; i += 1) {
    if (planned[i].start < planned[i - 1].end) {
      return { ok: false, reason: "overlap", editIndex: planned[i].index };
    }
  }

  let result = "";
  let cursor = 0;
  const applied: AppliedEdit[] = [];
  for (const edit of planned) {
    result += text.slice(cursor, edit.start);
    const start = result.length;
    result += edit.replace;
    applied.push({
      start,
      end: start + edit.replace.length,
      before: text.slice(edit.start, edit.end),
      after: edit.replace,
    });
    cursor = edit.end;
  }
  result += text.slice(cursor);

  return {
    ok: true,
    content: usesCrlf ? result.replace(/\n/g, "\r\n") : result,
    applied,
  };
}

export function invertEdit(
  current: string,
  applied: AppliedEdit,
): { ok: true; content: string } | { ok: false; reason: "conflict" } {
  const text = normalizeEol(current);
  const end = applied.start + applied.after.length;
  if (text.slice(applied.start, end) !== applied.after) {
    return { ok: false, reason: "conflict" };
  }
  const restored =
    text.slice(0, applied.start) + applied.before + text.slice(end);
  return {
    ok: true,
    content: current.includes("\r\n")
      ? restored.replace(/\n/g, "\r\n")
      : restored,
  };
}

/**
 * Reverts a sequence of edits produced by `applyEdits`. The offsets in
 * `applied` refer to the result document, so they must be undone in reverse
 * order. Returns a conflict instead of restoring a stale snapshot when the
 * text no longer matches.
 */
export function invertEdits(
  current: string,
  applied: AppliedEdit[],
): { ok: true; content: string } | { ok: false; reason: "conflict" } {
  let content = current;
  for (let index = applied.length - 1; index >= 0; index -= 1) {
    const result = invertEdit(content, applied[index]);
    if (!result.ok) return result;
    content = result.content;
  }
  return { ok: true, content };
}

export function offsetsToLineRange(
  content: string,
  start: number,
  end: number,
): { startLine: number; endLine: number } {
  const text = normalizeEol(content);
  const startLine = lineAt(text, start);
  return {
    startLine,
    endLine: end > start ? lineAt(text, end - 1) : startLine,
  };
}

/**
 * Character offset for a 1-based line. `before` is the start of that line;
 * `after` is the end of its text, immediately before the line break. Returns
 * null when the line is outside the file.
 */
export function lineOffset(
  content: string,
  line: number,
  position: "before" | "after" = "before",
): number | null {
  if (!Number.isInteger(line) || line < 1) return null;
  const lines = content.split("\n");
  if (line > lines.length) return null;

  let offset = 0;
  for (let index = 0; index < line - 1; index += 1) {
    offset += lines[index].length + 1;
  }
  return position === "after" ? offset + lines[line - 1].length : offset;
}

export function resolveProjectFile<T extends { path: string; name: string }>(
  files: T[],
  target: string,
): T | undefined {
  return files.find(
    (file) =>
      file.path === target ||
      file.name === target ||
      file.path.endsWith(`/${target}`),
  );
}
