export interface MinimalChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * Computes the smallest single change that turns `current` into `next`.
 * CodeMirror transactions built from this preserve the cursor and the
 * undo history instead of replacing the whole document.
 */
export function minimalChange(
  current: string,
  next: string,
): MinimalChange | null {
  if (current === next) return null;

  let from = 0;
  const limit = Math.min(current.length, next.length);
  while (from < limit && current.charCodeAt(from) === next.charCodeAt(from)) {
    from += 1;
  }

  let currentEnd = current.length;
  let nextEnd = next.length;
  while (
    currentEnd > from &&
    nextEnd > from &&
    current.charCodeAt(currentEnd - 1) === next.charCodeAt(nextEnd - 1)
  ) {
    currentEnd -= 1;
    nextEnd -= 1;
  }

  return {
    from,
    to: currentEnd,
    insert: next.slice(from, nextEnd),
  };
}
