export interface LineDiffStats {
  added: number;
  removed: number;
}

const MAX_DIFF_LINES = 3000;

function splitLines(text: string): string[] {
  if (!text) return [];
  return text.replace(/\r\n/g, "\n").split("\n");
}

/**
 * Myers' shortest-edit-script distance. Only the number of edits is needed,
 * so the frontier is enough; no trace or backtracking is kept.
 */
function myersDistance(a: string[], b: string[]): number {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return 0;

  const offset = max;
  const frontier = new Int32Array(2 * max + 2);

  for (let depth = 0; depth <= max; depth += 1) {
    for (let diagonal = -depth; diagonal <= depth; diagonal += 2) {
      const index = offset + diagonal;
      let x: number;
      if (
        diagonal === -depth ||
        (diagonal !== depth && frontier[index - 1] < frontier[index + 1])
      ) {
        x = frontier[index + 1];
      } else {
        x = frontier[index - 1] + 1;
      }

      let y = x - diagonal;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      frontier[index] = x;

      if (x >= n && y >= m) return depth;
    }
  }

  return max;
}

/**
 * Line-level additions and deletions between two versions of a file. Common
 * prefix and suffix lines are trimmed first, so large files with a small edit
 * stay cheap. A rewrite larger than MAX_DIFF_LINES falls back to counting the
 * changed region as fully replaced.
 */
export function lineDiffStats(before: string, after: string): LineDiffStats {
  const a = splitLines(before);
  const b = splitLines(after);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start += 1;
  }

  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  const middleA = a.slice(start, endA);
  const middleB = b.slice(start, endB);

  if (middleA.length + middleB.length > MAX_DIFF_LINES) {
    return { added: middleB.length, removed: middleA.length };
  }

  const distance = myersDistance(middleA, middleB);
  const lcs = (middleA.length + middleB.length - distance) / 2;

  return {
    added: middleB.length - lcs,
    removed: middleA.length - lcs,
  };
}
