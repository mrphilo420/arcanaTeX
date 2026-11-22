import { maskComments } from "@/lib/latex-active";

export interface BraceFile {
  id: string;
  content: string;
}

export type CloseArgumentResult =
  | { ok: true; fileId: string; content: string; line: number }
  | { ok: false; reason: string };

const MARKER = "Auto-fix: closed unmatched {";
const MIN_ANCHOR_CHARS = 8;

/** Constructs whose braces TeX does not count the way a plain scan does. */
const REVIEW_ONLY_PATTERN =
  /\\begin\{(?:verbatim\*?|Verbatim\*?|lstlisting|minted|comment)\}|\\verb|\\lstinline|\\mintinline|\\iffalse/;

const LINE_BREAK = /\r\n|\n|\r/;

/** Masked text with all whitespace removed, plus each char's original offset. */
function compact(masked: string): { text: string; offsets: number[] } {
  const offsets: number[] = [];
  let text = "";
  for (let index = 0; index < masked.length; index++) {
    if (/\s/.test(masked[index])) continue;
    text += masked[index];
    offsets.push(index);
  }
  return { text, offsets };
}

function findAll(haystack: string, needle: string): number[] {
  const hits: number[] = [];
  let from = haystack.indexOf(needle);
  while (from !== -1) {
    hits.push(from);
    from = haystack.indexOf(needle, from + 1);
  }
  return hits;
}

function lineNumber(text: string, offset: number): number {
  return text.slice(0, offset).split(LINE_BREAK).length;
}

/**
 * Deterministic repair for a "runaway argument" caused by one missing `}`.
 *
 * The error fires at end of file, far from the cause, but TeX prints the start
 * of the argument it was reading. That text is the anchor: it must match
 * exactly one place in the project. The brace is then added only when the
 * position is unambiguous: the argument opens and closes all its inner groups
 * on a single line, the next line is blank (or the file ends), and exactly one
 * `{` is left open from there to the end of the file. Anything else is left to
 * the author or the AI fixer.
 */
export function closeRunawayArgument(
  files: BraceFile[],
  runawayPreview: string,
): CloseArgumentResult {
  const anchor = runawayPreview.replace(/\s+/g, "");
  if (anchor.length < MIN_ANCHOR_CHARS) {
    return {
      ok: false,
      reason: "The runaway text is too short to locate safely",
    };
  }
  if (!anchor.startsWith("{")) {
    return {
      ok: false,
      reason: "The runaway text does not start at an opening brace",
    };
  }

  const hits: { file: BraceFile; masked: string; offset: number }[] = [];
  for (const file of files) {
    const masked = maskComments(file.content);
    const { text, offsets } = compact(masked);
    for (const hit of findAll(text, anchor)) {
      hits.push({ file, masked, offset: offsets[hit] });
    }
  }

  if (hits.length === 0) {
    return {
      ok: false,
      reason: "Could not find the runaway text in the source",
    };
  }
  if (hits.length > 1) {
    return {
      ok: false,
      reason:
        "The runaway text matches more than one place; the fix is ambiguous",
    };
  }

  const { file, masked, offset } = hits[0];
  if (REVIEW_ONLY_PATTERN.test(masked)) {
    return {
      ok: false,
      reason:
        "This file uses verbatim or conditional text; braces need a manual review",
    };
  }

  let depth = 0;
  let lineEnd = -1;
  let closeAt = -1;
  let index = offset;

  while (index < masked.length) {
    const char = masked[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "{") depth++;
    else if (char === "}") depth--;

    if (depth < 1) {
      return {
        ok: false,
        reason:
          "The argument is closed later in the file; the problem is elsewhere",
      };
    }

    if (lineEnd === -1 && (char === "\n" || char === "\r")) {
      lineEnd = index;
      if (depth !== 1) {
        return {
          ok: false,
          reason:
            "The argument spans several lines, so where to close it is ambiguous",
        };
      }
      closeAt = lastActiveOffset(masked, offset, index);
    }
    index++;
  }

  if (lineEnd === -1) {
    lineEnd = masked.length;
    closeAt = lastActiveOffset(masked, offset, masked.length);
  }

  if (depth !== 1) {
    return {
      ok: false,
      reason: `${depth} braces are unclosed from here, so the fix is ambiguous`,
    };
  }

  const afterBreak = masked.slice(lineEnd).replace(/^(?:\r\n|\n|\r)/, "");
  const nextLine = afterBreak.split(LINE_BREAK)[0];
  if (nextLine.trim() !== "") {
    return {
      ok: false,
      reason:
        "The next line continues the text, so where to close the argument is ambiguous",
    };
  }

  const original = file.content;
  if (original.slice(offset, lineEnd).includes(MARKER)) {
    return { ok: false, reason: "This line was already repaired" };
  }

  const trailing = original.slice(closeAt, lineEnd);
  const insertion = /^\s*%/.test(trailing) ? "}" : `}% ${MARKER}`;
  const content =
    original.slice(0, closeAt) + insertion + original.slice(closeAt);

  return {
    ok: true,
    fileId: file.id,
    content,
    line: lineNumber(original, offset),
  };
}

/** Offset just past the last non-blank active character in `[from, to)`. */
function lastActiveOffset(masked: string, from: number, to: number): number {
  let end = to;
  while (end > from && /\s/.test(masked[end - 1])) end--;
  return end;
}
