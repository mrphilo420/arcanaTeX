function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Builds the timestamped review path used by the paper-review skill. The
 * timestamp is local time so the path matches the author's clock; a suffix is
 * added if two reviews start in the same second.
 */
export function reviewFilePath(
  existingPaths: Iterable<string>,
  now: Date = new Date(),
): string {
  const base = `paper-reviews/review-${now.getFullYear()}-${pad(
    now.getMonth() + 1,
  )}-${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}`;
  const existing = new Set(existingPaths);
  let path = `${base}.tex`;
  let suffix = 2;
  while (existing.has(path)) {
    path = `${base}-${suffix}.tex`;
    suffix += 1;
  }
  return path;
}
