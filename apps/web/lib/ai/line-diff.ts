import type { EditSpec } from "./file-edits";

type Op = { type: "equal" | "del" | "add"; line: string };

const MAX_CELLS = 4_000_000;

export type FilePatch =
  | { kind: "edits"; edits: EditSpec[]; before: string }
  | { kind: "replace"; content: string; before: string };

/**
 * Line diff over an LCS table. Returns a single full-file replacement when the
 * files are too large for the quadratic table, which keeps behaviour bounded
 * on pathological inputs.
 */
function diffOps(before: string[], after: string[]): Op[] {
  const n = before.length;
  const m = after.length;

  if ((n + 1) * (m + 1) > MAX_CELLS) {
    return [
      ...before.map((line) => ({ type: "del" as const, line })),
      ...after.map((line) => ({ type: "add" as const, line })),
    ];
  }

  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        before[i] === after[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      ops.push({ type: "equal", line: before[i] });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.push({ type: "del", line: before[i] });
      i += 1;
    } else {
      ops.push({ type: "add", line: after[j] });
      j += 1;
    }
  }
  while (i < n) ops.push({ type: "del", line: before[i++] });
  while (j < m) ops.push({ type: "add", line: after[j++] });
  return ops;
}

type Hunk = { from: number; to: number };

/** Groups changed runs, merging those separated by at most twice the context. */
function groupHunks(ops: Op[], context: number): Hunk[] {
  const hunks: Hunk[] = [];
  let index = 0;

  while (index < ops.length) {
    if (ops[index].type === "equal") {
      index += 1;
      continue;
    }

    const from = index;
    let to = index;
    while (to < ops.length) {
      if (ops[to].type !== "equal") {
        to += 1;
        continue;
      }
      let run = to;
      while (run < ops.length && ops[run].type === "equal") run += 1;
      if (run < ops.length && run - to <= context * 2) {
        to = run;
        continue;
      }
      break;
    }

    hunks.push({ from, to });
    index = to;
  }

  return hunks;
}

function takeLeadingEquals(ops: Op[], from: number, context: number): string[] {
  const lines: string[] = [];
  const start = Math.max(0, from - context);
  for (let index = start; index < from; index += 1) {
    if (ops[index].type === "equal") lines.push(ops[index].line);
  }
  return lines;
}

function takeTrailingEquals(
  ops: Op[],
  from: number,
  context: number,
): string[] {
  const lines: string[] = [];
  const end = Math.min(ops.length, from + context);
  for (let index = from; index < end; index += 1) {
    if (ops[index].type === "equal") lines.push(ops[index].line);
  }
  return lines;
}

function clampFrom(hunk: Hunk, previous: Hunk | undefined): number {
  if (!previous) return hunk.from;
  return Math.max(hunk.from, previous.to);
}

/**
 * Turns a before/after pair into anchored edits the reviewer applies against
 * whatever the file contains now.
 *
 * Equal lines inside a merged hunk appear on both sides, so a hunk that spans
 * two distant changes still produces a single exact match. A pure insertion
 * borrows a neighbouring line as its anchor because an empty `find` cannot be
 * located. Files that cannot be anchored — empty before, or too large to diff —
 * become a `replace` patch that the caller must guard against concurrent edits.
 */
export function buildFilePatch(
  before: string,
  after: string,
  context = 4,
): FilePatch {
  if (before === after) {
    return { kind: "edits", edits: [], before };
  }

  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const ops = diffOps(beforeLines, afterLines);
  const hunks = groupHunks(ops, context);

  if (hunks.length === 0) {
    return { kind: "edits", edits: [], before };
  }

  if ((beforeLines.length + 1) * (afterLines.length + 1) > MAX_CELLS) {
    return { kind: "replace", content: after, before };
  }

  const edits: EditSpec[] = [];
  let previous: Hunk | undefined;

  for (const hunk of hunks) {
    const from = clampFrom(hunk, previous);
    previous = hunk;

    const lead = takeLeadingEquals(ops, from, context);
    const trail = takeTrailingEquals(ops, hunk.to, context);

    const removed: string[] = [];
    const added: string[] = [];
    for (let index = from; index < hunk.to; index += 1) {
      const op = ops[index];
      if (op.type === "equal") {
        // Context inside a merged hunk belongs on both sides.
        removed.push(op.line);
        added.push(op.line);
      } else if (op.type === "del") {
        removed.push(op.line);
      } else {
        added.push(op.line);
      }
    }

    const find = [...lead, ...removed, ...trail].join("\n");
    const replace = [...lead, ...added, ...trail].join("\n");

    if (find === replace) continue;

    if (find.length === 0) {
      // Nothing to anchor on, e.g. a file that was empty before the change.
      return { kind: "replace", content: after, before };
    }

    edits.push({ find, replace });
  }

  return { kind: "edits", edits, before };
}

/** Convenience wrapper for callers that only handle anchored edits. */
export function diffToEditSpecs(
  before: string,
  after: string,
  context = 4,
): EditSpec[] {
  const patch = buildFilePatch(before, after, context);
  return patch.kind === "edits"
    ? patch.edits
    : [{ find: before, replace: after }];
}

/** Lines that actually changed, ignoring shared context on both sides. */
function changedLines(
  before: string,
  after: string,
): { added: number; removed: number } {
  const a = before.split("\n");
  const b = after.split("\n");

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    added: b.length - prefix - suffix,
    removed: a.length - prefix - suffix,
  };
}

export function patchStats(patch: FilePatch): {
  added: number;
  removed: number;
} {
  if (patch.kind === "replace") {
    return changedLines(patch.before, patch.content);
  }

  let added = 0;
  let removed = 0;
  for (const edit of patch.edits) {
    const stats = changedLines(edit.find, edit.replace);
    added += stats.added;
    removed += stats.removed;
  }
  return { added, removed };
}
