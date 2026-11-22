export interface TextWindow {
  /** Character offset where the slice starts (always a line boundary). */
  start: number;
  /** Character offset where the slice ends (line boundary, exclusive). */
  end: number;
  text: string;
  startLine: number;
  endLine: number;
}

/**
 * Selects a line-aligned slice around `center` that fits `budget` characters.
 *
 * The slice never splits a line, so a script that operates on it can be applied
 * back at `start` without corrupting the surrounding document.
 */
export function selectWindow(
  content: string,
  center: number,
  budget: number,
): TextWindow {
  if (content.length <= budget) {
    const lineCount = content.length === 0 ? 1 : content.split("\n").length;
    return {
      start: 0,
      end: content.length,
      text: content,
      startLine: 1,
      endLine: lineCount,
    };
  }

  const lines = content.split("\n");
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }

  const clamped = Math.min(
    Math.max(0, center),
    Math.max(0, content.length - 1),
  );
  let centerLine = 0;
  for (let index = 0; index < lineStarts.length; index += 1) {
    if (lineStarts[index] <= clamped) centerLine = index;
    else break;
  }

  let startLine = centerLine;
  let endLine = centerLine;
  let size = lines[centerLine]?.length ?? 0;

  for (;;) {
    const canGrowBefore = startLine > 0;
    const canGrowAfter = endLine < lines.length - 1;
    if (!canGrowBefore && !canGrowAfter) break;

    // Grow forward first so the slice stays anchored to the requested region.
    if (canGrowAfter && size + lines[endLine + 1].length + 1 <= budget) {
      endLine += 1;
      size += lines[endLine].length + 1;
      continue;
    }
    if (canGrowBefore && size + lines[startLine - 1].length + 1 <= budget) {
      startLine -= 1;
      size += lines[startLine].length + 1;
      continue;
    }
    break;
  }

  const start = lineStarts[startLine] ?? 0;
  const end =
    endLine + 1 < lineStarts.length
      ? Math.max(start, lineStarts[endLine + 1] - 1)
      : content.length;

  return {
    start,
    end,
    text: content.slice(start, end),
    startLine: startLine + 1,
    endLine: endLine + 1,
  };
}
