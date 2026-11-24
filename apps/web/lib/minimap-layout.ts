export const MINIMAP_LINE_STRIDE = 3;
export const MINIMAP_MIN_SLIDER_HEIGHT = 24;
export const MINIMAP_MAX_COLUMNS = 110;

export type MinimapFileKind = "latex" | "markdown" | "lean" | "other";

export type MinimapTokenRole =
  | "section"
  | "comment"
  | "command"
  | "math"
  | "text";

export interface MinimapTokenSegment {
  startCol: number;
  length: number;
  role: MinimapTokenRole;
}

export interface MinimapGeometryInput {
  lineCount: number;
  containerHeight: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  lineStride?: number;
}

export interface MinimapGeometry {
  contentHeight: number;
  minimapScrollTop: number;
  sliderTop: number;
  sliderHeight: number;
  maxSliderTop: number;
  maxEditorScroll: number;
  scrollRatio: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeMinimapGeometry({
  lineCount,
  containerHeight,
  scrollTop,
  scrollHeight,
  clientHeight,
  lineStride = MINIMAP_LINE_STRIDE,
}: MinimapGeometryInput): MinimapGeometry {
  const safeContainerHeight = Math.max(0, containerHeight);
  const safeScrollHeight = Math.max(1, scrollHeight);
  const safeClientHeight = Math.max(0, clientHeight);
  const contentHeight = Math.max(1, lineCount) * lineStride;
  const maxEditorScroll = Math.max(0, safeScrollHeight - safeClientHeight);
  const scrollRatio =
    maxEditorScroll > 0 ? clamp(scrollTop / maxEditorScroll, 0, 1) : 0;

  if (safeContainerHeight <= 0) {
    return {
      contentHeight,
      minimapScrollTop: 0,
      sliderTop: 0,
      sliderHeight: 0,
      maxSliderTop: 0,
      maxEditorScroll,
      scrollRatio,
    };
  }

  if (contentHeight <= safeContainerHeight) {
    const rawSliderHeight =
      (safeClientHeight / safeScrollHeight) * contentHeight;
    const minHeight = Math.min(MINIMAP_MIN_SLIDER_HEIGHT, contentHeight);
    const sliderHeight = clamp(rawSliderHeight, minHeight, contentHeight);
    const maxSliderTop = Math.max(0, contentHeight - sliderHeight);
    const sliderTop = scrollRatio * maxSliderTop;

    return {
      contentHeight,
      minimapScrollTop: 0,
      sliderTop,
      sliderHeight,
      maxSliderTop,
      maxEditorScroll,
      scrollRatio,
    };
  }

  const visibleFraction = clamp(safeClientHeight / safeScrollHeight, 0.04, 1);
  const maxSliderCap = Math.max(
    MINIMAP_MIN_SLIDER_HEIGHT,
    safeContainerHeight * 0.65,
  );
  const sliderHeight = clamp(
    visibleFraction * contentHeight,
    MINIMAP_MIN_SLIDER_HEIGHT,
    maxSliderCap,
  );
  const maxSliderTop = Math.max(0, safeContainerHeight - sliderHeight);
  const sliderTop = scrollRatio * maxSliderTop;
  const minimapScrollTop = scrollRatio * (contentHeight - safeContainerHeight);

  return {
    contentHeight,
    minimapScrollTop,
    sliderTop,
    sliderHeight,
    maxSliderTop,
    maxEditorScroll,
    scrollRatio,
  };
}

export function scrollTopForMinimapY(
  pointerY: number,
  dragOffsetY: number,
  geometry: MinimapGeometry,
): number {
  if (geometry.maxSliderTop <= 0 || geometry.maxEditorScroll <= 0) {
    return 0;
  }
  const targetSliderTop = clamp(
    pointerY - dragOffsetY,
    0,
    geometry.maxSliderTop,
  );
  return (targetSliderTop / geometry.maxSliderTop) * geometry.maxEditorScroll;
}

const LATEX_SECTION_RE =
  /^\\(?:part|chapter|section|subsection|subsubsection|paragraph)\*?\{/;
const MARKDOWN_HEADING_RE = /^#{1,6}\s+/;
const LEAN_KEYWORD_RE =
  /^(?:theorem|lemma|def|structure|inductive|import|namespace|example|axiom|class|instance|open|section|end)\b/;

function pushRun(
  segments: MinimapTokenSegment[],
  startCol: number,
  length: number,
  role: MinimapTokenRole,
): void {
  if (length <= 0) return;
  const prev = segments[segments.length - 1];
  if (prev && prev.role === role && prev.startCol + prev.length === startCol) {
    prev.length += length;
    return;
  }
  segments.push({ startCol, length, role });
}

export function classifyMinimapLine(
  rawLine: string,
  kind: MinimapFileKind,
): MinimapTokenSegment[] {
  const expanded = rawLine.replace(/\t/g, "  ").slice(0, MINIMAP_MAX_COLUMNS);
  if (!expanded.trim()) return [];

  const trimmedStart = expanded.search(/\S/);
  if (trimmedStart === -1) return [];
  const trimmed = expanded.slice(trimmedStart);

  if (
    (kind === "latex" && LATEX_SECTION_RE.test(trimmed)) ||
    (kind === "markdown" && MARKDOWN_HEADING_RE.test(trimmed))
  ) {
    return [
      {
        startCol: trimmedStart,
        length: trimmed.trimEnd().length,
        role: "section",
      },
    ];
  }

  const segments: MinimapTokenSegment[] = [];
  let i = trimmedStart;
  let inMath = false;

  while (i < expanded.length) {
    const ch = expanded[i]!;

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    // Comments
    if (
      kind === "latex" &&
      ch === "%" &&
      (i === 0 || expanded[i - 1] !== "\\")
    ) {
      pushRun(segments, i, expanded.trimEnd().length - i, "comment");
      break;
    }
    if (kind === "lean" && ch === "-" && expanded[i + 1] === "-") {
      pushRun(segments, i, expanded.trimEnd().length - i, "comment");
      break;
    }

    // Math delimiters in LaTeX / Markdown
    if ((kind === "latex" || kind === "markdown") && ch === "$") {
      const start = i;
      i += 1;
      if (expanded[i] === "$") i += 1;
      inMath = !inMath;
      pushRun(segments, start, i - start, "math");
      continue;
    }

    if (
      kind === "latex" &&
      ch === "\\" &&
      (expanded[i + 1] === "[" || expanded[i + 1] === "]")
    ) {
      inMath = expanded[i + 1] === "[";
      pushRun(segments, i, 2, "math");
      i += 2;
      continue;
    }

    // LaTeX commands
    if (kind === "latex" && ch === "\\") {
      const rest = expanded.slice(i);
      const match = /^\\[a-zA-Z@]+/.exec(rest);
      const len = match ? match[0].length : Math.min(2, rest.length);
      pushRun(segments, i, len, inMath ? "math" : "command");
      i += len;
      continue;
    }

    // Lean keywords
    if (kind === "lean") {
      const rest = expanded.slice(i);
      const kwMatch = LEAN_KEYWORD_RE.exec(rest);
      if (kwMatch && (i === 0 || !/[a-zA-Z0-9_]/.test(expanded[i - 1] ?? ""))) {
        pushRun(segments, i, kwMatch[0].length, "command");
        i += kwMatch[0].length;
        continue;
      }
    }

    // Contiguous non-whitespace token run
    const runStart = i;
    while (i < expanded.length && !/\s/.test(expanded[i]!)) {
      const curr = expanded[i]!;
      if (
        (kind === "latex" &&
          (curr === "\\" ||
            (curr === "%" && expanded[i - 1] !== "\\") ||
            curr === "$")) ||
        (kind === "markdown" && curr === "$") ||
        (kind === "lean" && curr === "-" && expanded[i + 1] === "-")
      ) {
        break;
      }
      i += 1;
    }
    if (i === runStart) {
      i += 1;
    }
    pushRun(segments, runStart, i - runStart, inMath ? "math" : "text");
  }

  return segments;
}
