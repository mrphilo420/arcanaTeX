import { buildFilePatch, type FilePatch, patchStats } from "@/lib/ai/line-diff";

export type DocumentChunkKind =
  | "preamble"
  | "frontmatter"
  | "abstract"
  | "part"
  | "chapter"
  | "section"
  | "subsection"
  | "subsubsection"
  | "appendix"
  | "bibliography"
  | "backmatter"
  | "body";

export interface DocumentChunk {
  id: string;
  index: number;
  kind: DocumentChunkKind;
  heading: string;
  level: number;
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
  content: string;
  charCount: number;
  wordCount: number;
  hash: string;
  labels: string[];
  refs: string[];
  cites: string[];
  environments: string[];
  mathBlockCount: number;
}

export interface StatementSignature {
  environment: string;
  label?: string;
  title?: string;
  statement: string;
  line: number;
}

export interface CompressedChunkDigest {
  chunkId: string;
  index: number;
  kind: DocumentChunkKind;
  heading: string;
  startLine: number;
  endLine: number;
  originalChars: number;
  compressedChars: number;
  wordCount: number;
  labels: string[];
  refs: string[];
  cites: string[];
  environments: string[];
  mathBlockCount: number;
  statements: StatementSignature[];
  keySentences: string[];
  summary: string;
}

export interface CompressedManuscript {
  title: string;
  abstractSummary: string;
  outline: string;
  outlineEntries: string[];
  labels: string[];
  refs: string[];
  cites: string[];
  unresolvedRefs: string[];
  statements: StatementSignature[];
  chunkDigests: CompressedChunkDigest[];
  digestMarkdown: string;
  originalChars: number;
  compressedChars: number;
  compressionRatio: number;
  estimatedTokensSaved: number;
}

export interface StagedChunkRevision {
  chunkId: string;
  originalHash: string;
  revisedContent: string;
  note?: string;
  stagedAt: number;
}

export interface ChunkAnalysisNote {
  chunkId: string;
  summary: string;
  flags: string[];
  analyzedAt: number;
}

export interface ChunkRevisionSession {
  version: 1;
  projectId: string;
  fileId: string;
  filePath: string;
  sourceHash: string;
  sourceLength: number;
  createdAt: number;
  updatedAt: number;
  chunks: DocumentChunk[];
  compressed: CompressedManuscript;
  stagedRevisions: Record<string, StagedChunkRevision>;
  analyses: Record<string, ChunkAnalysisNote>;
}

export interface ChunkContextEnvelope {
  thesis: string;
  outline: string;
  previousTail: string;
  chunk: DocumentChunk;
  nextHead: string;
  stagedContent?: string;
}

export type AssembleWholeRevisionResult =
  | {
      ok: true;
      content: string;
      strategy: "exact" | "anchored-fallback";
      changedChunkIds: string[];
      stats: { added: number; removed: number };
      patch: FilePatch;
    }
  | {
      ok: false;
      reason: "source-drift";
      driftedChunkIds: string[];
    };

const DEFAULT_MAX_CHUNK_CHARS = 6000;
const MIN_MAX_CHUNK_CHARS = 50;
const DEFAULT_MAX_CHUNK_DIGEST_CHARS = 560;
const DEFAULT_MAX_MANUSCRIPT_DIGEST_CHARS = 8000;
const CHUNK_SESSION_PREFIX = "open-prism:chunk-session:";

const VERBATIM_ENVS = new Set([
  "verbatim",
  "verbatim*",
  "Verbatim",
  "Verbatim*",
  "lstlisting",
  "minted",
  "comment",
]);

const ATOMIC_ENVIRONMENTS = new Set([
  "theorem",
  "lemma",
  "proposition",
  "corollary",
  "definition",
  "remark",
  "example",
  "assumption",
  "conjecture",
  "claim",
  "proof",
  "equation",
  "equation*",
  "align",
  "align*",
  "gather",
  "gather*",
  "multline",
  "multline*",
  "flalign",
  "flalign*",
  "alignat",
  "alignat*",
  "eqnarray",
  "eqnarray*",
  "figure",
  "figure*",
  "table",
  "table*",
  "tikzpicture",
  "algorithm",
  "algorithm2e",
  "algorithmic",
  "verbatim",
  "verbatim*",
  "lstlisting",
  "minted",
]);

const DISPLAY_MATH_ENVIRONMENTS = new Set([
  "equation",
  "equation*",
  "align",
  "align*",
  "gather",
  "gather*",
  "multline",
  "multline*",
  "flalign",
  "flalign*",
  "alignat",
  "alignat*",
  "eqnarray",
  "eqnarray*",
]);

const STATEMENT_ENVIRONMENTS = new Set([
  "theorem",
  "lemma",
  "proposition",
  "corollary",
  "definition",
  "conjecture",
  "assumption",
  "claim",
]);

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "by",
  "can",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "may",
  "more",
  "not",
  "of",
  "on",
  "or",
  "our",
  "over",
  "she",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "to",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "will",
  "with",
]);

const DISCOURSE_CUE_RE =
  /\b(we prove|we show|we establish|we propose|we introduce|we obtain|we derive|we conclude|in particular|moreover|therefore|consequently|our main|main result|theorem|lemma|proposition|corollary|complexity|optimal|convergence|bound|algorithm|crucial|novel)\b/i;

/**
 * Deterministic 32-bit FNV-1a hash encoded as 8-character lowercase hex.
 */
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 13) {
      if (text.charCodeAt(i + 1) === 10) i += 1;
      starts.push(i + 1);
    } else if (code === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}

function lineAtOffset(lineStarts: number[], offset: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineStarts[mid] <= offset) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return Math.max(1, hi + 1);
}

/**
 * Replaces comments (`% ...`) and verbatim/`\verb` interiors with spaces,
 * preserving exact string length so offsets match the original content 1:1.
 */
function maskCommentsAndVerbatim(text: string): string {
  const out: string[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === "\\") {
      if (text.startsWith("\\verb", i)) {
        const afterVerb = i + 5;
        const starOffset = text[afterVerb] === "*" ? 1 : 0;
        const delimIndex = afterVerb + starOffset;
        const delim = text[delimIndex];
        if (
          delim &&
          delim !== "\n" &&
          delim !== "\r" &&
          !/[a-zA-Z]/.test(delim)
        ) {
          const closeIndex = text.indexOf(delim, delimIndex + 1);
          if (closeIndex !== -1) {
            out.push(text.slice(i, delimIndex + 1));
            for (let k = delimIndex + 1; k < closeIndex; k += 1) {
              const c = text[k];
              out.push(c === "\n" || c === "\r" ? c : " ");
            }
            out.push(delim);
            i = closeIndex + 1;
            continue;
          }
        }
      }

      if (text.startsWith("\\begin", i)) {
        const m = /^\\begin\s*\{([^}]+)\}/.exec(text.slice(i));
        if (m && VERBATIM_ENVS.has(m[1])) {
          const envName = m[1];
          const escaped = envName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const endRe = new RegExp(`\\\\end\\s*\\{${escaped}\\}`);
          const afterOpen = i + m[0].length;
          const endMatch = endRe.exec(text.slice(afterOpen));
          if (endMatch) {
            const bodyEnd = afterOpen + endMatch.index;
            out.push(m[0]);
            for (let k = afterOpen; k < bodyEnd; k += 1) {
              const c = text[k];
              out.push(c === "\n" || c === "\r" ? c : " ");
            }
            out.push(endMatch[0]);
            i = bodyEnd + endMatch[0].length;
            continue;
          }
        }
      }

      out.push(ch, text[i + 1] ?? "");
      i += 2;
      continue;
    }

    if (ch === "%") {
      while (i < text.length && text[i] !== "\n" && text[i] !== "\r") {
        out.push(" ");
        i += 1;
      }
      continue;
    }

    out.push(ch);
    i += 1;
  }

  return out.join("");
}

function skipWs(text: string, index: number): number {
  let i = index;
  while (
    i < text.length &&
    (text[i] === " " ||
      text[i] === "\t" ||
      text[i] === "\r" ||
      text[i] === "\n")
  ) {
    i += 1;
  }
  return i;
}

function readBalanced(
  text: string,
  openIndex: number,
  openChar: string,
  closeChar: string,
): { value: string; endIndex: number } | null {
  if (text[openIndex] !== openChar) return null;
  let depth = 0;
  let i = openIndex;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === openChar) depth += 1;
    else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return {
          value: text.slice(openIndex + 1, i),
          endIndex: i + 1,
        };
      }
    }
    i += 1;
  }
  return null;
}

function cleanHeadingText(raw: string): string {
  return raw
    .replace(/\\texorpdfstring\s*\{([^}]*)\}\s*\{[^}]*\}/g, "$1")
    .replace(
      /\\(?:textbf|textit|emph|text|mathrm|mathsf|texttt|textsc)\s*\{([^{}]*)\}/g,
      "$1",
    )
    .replace(/\\\\/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lineStartOf(text: string, offset: number): number {
  let i = offset;
  while (i > 0 && text[i - 1] !== "\n" && text[i - 1] !== "\r") {
    i -= 1;
  }
  return i;
}

function lineEndAfterNewline(text: string, offset: number): number {
  let i = offset;
  while (i < text.length && text[i] !== "\n" && text[i] !== "\r") {
    i += 1;
  }
  if (text[i] === "\r" && text[i + 1] === "\n") return i + 2;
  if (text[i] === "\n" || text[i] === "\r") return i + 1;
  return i;
}

function isLineLeadWhitespace(masked: string, offset: number): boolean {
  const start = lineStartOf(masked, offset);
  for (let i = start; i < offset; i += 1) {
    if (masked[i] !== " " && masked[i] !== "\t") return false;
  }
  return true;
}

function splitOffsetForCommand(masked: string, cmdOffset: number): number {
  return isLineLeadWhitespace(masked, cmdOffset)
    ? lineStartOf(masked, cmdOffset)
    : cmdOffset;
}

interface RawBoundary {
  offset: number;
  kind: DocumentChunkKind;
  heading: string;
  level: number;
  priority: number;
  cmdEndOffset?: number;
}

const SECTION_META: Record<
  "part" | "chapter" | "section" | "subsection" | "subsubsection",
  { level: number }
> = {
  part: { level: 0 },
  chapter: { level: 1 },
  section: { level: 2 },
  subsection: { level: 3 },
  subsubsection: { level: 4 },
};

function findStructuralBoundaries(
  content: string,
  masked: string,
): RawBoundary[] {
  const boundaries: RawBoundary[] = [];

  // Find \begin{document} and \end{document}
  const beginDocMatch = /\\begin\s*\{document\}/.exec(masked);
  const endDocMatch = /\\end\s*\{document\}/.exec(masked);
  const beginDocBoundary = beginDocMatch
    ? splitOffsetForCommand(masked, beginDocMatch.index)
    : -1;
  const bodyStart = beginDocMatch
    ? beginDocMatch.index + beginDocMatch[0].length
    : 0;
  const endDocBoundary =
    endDocMatch && endDocMatch.index >= bodyStart
      ? splitOffsetForCommand(masked, endDocMatch.index)
      : content.length;

  if (beginDocBoundary > 0) {
    boundaries.push({
      offset: 0,
      kind: "preamble",
      heading: "Preamble",
      level: 0,
      priority: 0,
    });
  }

  // Scan inside [beginDocBoundary/0 .. endDocBoundary) for sectioning & semantic markers
  const scanStart = beginDocBoundary >= 0 ? beginDocBoundary : 0;
  const bodyMasked = masked.slice(0, endDocBoundary);

  const sectionRe =
    /\\(part|chapter|section|subsection|subsubsection)\*?(?=[\s[{])/g;
  sectionRe.lastIndex = scanStart;
  let match: RegExpExecArray | null;
  while ((match = sectionRe.exec(bodyMasked)) !== null) {
    if (!isLineLeadWhitespace(bodyMasked, match.index)) continue;
    const cmd = match[1] as keyof typeof SECTION_META;
    let pos = skipWs(bodyMasked, match.index + match[0].length);
    if (bodyMasked[pos] === "[") {
      const opt = readBalanced(bodyMasked, pos, "[", "]");
      if (opt) pos = skipWs(bodyMasked, opt.endIndex);
    }
    const arg = readBalanced(content, pos, "{", "}");
    if (!arg) continue;
    const heading = cleanHeadingText(arg.value) || cmd;
    boundaries.push({
      offset: splitOffsetForCommand(bodyMasked, match.index),
      kind: cmd,
      heading,
      level: SECTION_META[cmd].level,
      priority: 1,
      cmdEndOffset: arg.endIndex,
    });
  }

  // Abstract
  const abstractRe = /\\begin\s*\{abstract\}/g;
  abstractRe.lastIndex = scanStart;
  while ((match = abstractRe.exec(bodyMasked)) !== null) {
    if (!isLineLeadWhitespace(bodyMasked, match.index)) continue;
    boundaries.push({
      offset: splitOffsetForCommand(bodyMasked, match.index),
      kind: "abstract",
      heading: "Abstract",
      level: 2,
      priority: 2,
      cmdEndOffset: match.index + match[0].length,
    });
  }

  // Appendix
  const appendixRe = /\\appendix(?![a-zA-Z])/g;
  appendixRe.lastIndex = scanStart;
  while ((match = appendixRe.exec(bodyMasked)) !== null) {
    if (!isLineLeadWhitespace(bodyMasked, match.index)) continue;
    boundaries.push({
      offset: splitOffsetForCommand(bodyMasked, match.index),
      kind: "appendix",
      heading: "Appendix",
      level: 2,
      priority: 2,
      cmdEndOffset: match.index + match[0].length,
    });
  }

  // Bibliography (\bibliographystyle immediately preceding \bibliography stays attached)
  const bibRe =
    /\\(?:bibliography\s*\{[^}]*\}|printbibliography(?:\s*\[[^\]]*\])?|begin\s*\{thebibliography\})/g;
  bibRe.lastIndex = scanStart;
  let firstBibAdded = false;
  while ((match = bibRe.exec(bodyMasked)) !== null) {
    if (firstBibAdded) break;
    if (!isLineLeadWhitespace(bodyMasked, match.index)) continue;
    let offset = splitOffsetForCommand(bodyMasked, match.index);
    const beforeSlice = bodyMasked.slice(scanStart, offset);
    const styleMatch = /\\bibliographystyle\s*\{[^}]*\}\s*$/.exec(beforeSlice);
    if (styleMatch) {
      const styleCmdOffset = scanStart + styleMatch.index;
      if (isLineLeadWhitespace(bodyMasked, styleCmdOffset)) {
        offset = splitOffsetForCommand(bodyMasked, styleCmdOffset);
      }
    }
    boundaries.push({
      offset,
      kind: "bibliography",
      heading: "References",
      level: 2,
      priority: 2,
    });
    firstBibAdded = true;
  }

  // Frontmatter between \begin{document} and first section/abstract/etc.
  if (beginDocMatch && beginDocBoundary >= 0) {
    const firstBodyBoundary = boundaries
      .filter((b) => b.offset > beginDocBoundary)
      .sort((a, b) => a.offset - b.offset)[0];
    const frontEnd = firstBodyBoundary
      ? firstBodyBoundary.offset
      : endDocBoundary;
    const betweenBeginAndNext = bodyMasked
      .slice(beginDocMatch.index + beginDocMatch[0].length, frontEnd)
      .trim();

    if (firstBodyBoundary && !betweenBeginAndNext) {
      // Shift the first body boundary backward to include bare \begin{document}
      // whitespace so we don't emit a degenerate 17-char chunk.
      firstBodyBoundary.offset = beginDocBoundary;
    } else if (beginDocBoundary < endDocBoundary) {
      boundaries.push({
        offset: beginDocBoundary,
        kind: "frontmatter",
        heading: "Document Frontmatter",
        level: 1,
        priority: 3,
      });
    }
  } else if (!boundaries.some((b) => b.offset === 0)) {
    boundaries.push({
      offset: 0,
      kind: "body",
      heading: "Document Body",
      level: 2,
      priority: 3,
    });
  }

  // Backmatter at \end{document}
  if (endDocMatch && endDocBoundary < content.length) {
    boundaries.push({
      offset: endDocBoundary,
      kind: "backmatter",
      heading: "Backmatter",
      level: 0,
      priority: 1,
    });
  }

  // Sort & deduplicate by offset (higher precedence = lower priority number wins)
  boundaries.sort((a, b) => a.offset - b.offset || a.priority - b.priority);
  const deduped: RawBoundary[] = [];
  for (const boundary of boundaries) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.offset === boundary.offset) continue;
    deduped.push(boundary);
  }

  // If an \appendix marker immediately precedes a \section/\chapter with only
  // whitespace in between, merge them so the chunk is labeled "appendix".
  const merged: RawBoundary[] = [];
  for (let i = 0; i < deduped.length; i += 1) {
    const cur = deduped[i];
    const next = deduped[i + 1];
    if (
      cur.kind === "appendix" &&
      next &&
      (next.kind === "section" || next.kind === "chapter") &&
      masked.slice(cur.cmdEndOffset ?? cur.offset, next.offset).trim() === ""
    ) {
      merged.push({
        offset: cur.offset,
        kind: "appendix",
        heading: `Appendix: ${next.heading}`,
        level: next.level,
        priority: cur.priority,
      });
      i += 1;
      continue;
    }
    merged.push(cur);
  }

  return merged;
}

interface Span {
  start: number;
  end: number;
}

/**
 * Finds atomic environments and math blocks inside `[rangeStart, rangeEnd)`
 * where subdividing MUST NOT split internally, plus top-level safe split
 * boundaries (blank lines and atomic environment boundaries).
 */
function findSafeSplitPoints(
  maskedSlice: string,
  baseOffset: number,
): number[] {
  const atomicSpans: Span[] = [];
  const candidatePoints = new Set<number>();

  let envDepth = 0;
  let activeAtomicName: string | null = null;
  let activeAtomicStart = -1;
  let inBracketMath = false;
  let bracketMathStart = -1;
  let inDoubleDollar = false;
  let doubleDollarStart = -1;
  let inSingleDollar = false;
  let singleDollarStart = -1;

  let i = 0;
  while (i < maskedSlice.length) {
    const ch = maskedSlice[i];

    // Blank-line paragraph boundary check when at line start and not inside atomic/math span
    const isLineStart =
      i === 0 ||
      maskedSlice[i - 1] === "\n" ||
      (maskedSlice[i - 1] === "\r" && maskedSlice[i] !== "\n");
    if (isLineStart) {
      if (
        envDepth === 0 &&
        !inBracketMath &&
        !inDoubleDollar &&
        !inSingleDollar
      ) {
        const blankMatch = /^(?:[ \t]*(?:\r\n|\n|\r))+/.exec(
          maskedSlice.slice(i),
        );
        if (blankMatch) {
          const splitAt = i + blankMatch[0].length;
          if (splitAt > 0 && splitAt < maskedSlice.length) {
            candidatePoints.add(baseOffset + splitAt);
          }
          i = splitAt;
          continue;
        }
      }
    }

    if (ch === "\\") {
      const next = maskedSlice[i + 1];
      if (next === "\\") {
        // Escaped backslash / line break (e.g. \\[6pt]); advance past both!
        i += 2;
        continue;
      }

      if (
        next === "[" &&
        !inDoubleDollar &&
        !inSingleDollar &&
        !inBracketMath
      ) {
        if (envDepth === 0) {
          inBracketMath = true;
          bracketMathStart = i;
        }
        i += 2;
        continue;
      }

      if (next === "]" && inBracketMath) {
        inBracketMath = false;
        if (envDepth === 0 && bracketMathStart >= 0) {
          atomicSpans.push({ start: bracketMathStart, end: i + 2 });
        }
        bracketMathStart = -1;
        i += 2;
        continue;
      }

      if (maskedSlice.startsWith("\\begin", i)) {
        const m = /^\\begin\s*\{([^}]+)\}/.exec(maskedSlice.slice(i));
        if (m) {
          const envName = m[1];
          if (envDepth > 0) {
            if (envName === activeAtomicName) {
              envDepth += 1;
            }
          } else if (ATOMIC_ENVIRONMENTS.has(envName)) {
            envDepth = 1;
            activeAtomicName = envName;
            activeAtomicStart = splitOffsetForCommand(maskedSlice, i);
            if (activeAtomicStart > 0) {
              candidatePoints.add(baseOffset + activeAtomicStart);
            }
          }
          i += m[0].length;
          continue;
        }
      }

      if (maskedSlice.startsWith("\\end", i)) {
        const m = /^\\end\s*\{([^}]+)\}/.exec(maskedSlice.slice(i));
        if (m) {
          const envName = m[1];
          if (envDepth > 0 && envName === activeAtomicName) {
            envDepth -= 1;
            if (envDepth === 0) {
              const spanEnd = lineEndAfterNewline(maskedSlice, i + m[0].length);
              atomicSpans.push({ start: activeAtomicStart, end: spanEnd });
              if (spanEnd < maskedSlice.length) {
                candidatePoints.add(baseOffset + spanEnd);
              }
              activeAtomicName = null;
              activeAtomicStart = -1;
            }
          }
          i += m[0].length;
          continue;
        }
      }

      i += 2;
      continue;
    }

    if (ch === "$") {
      if (maskedSlice[i + 1] === "$") {
        if (!inDoubleDollar) {
          inDoubleDollar = true;
          doubleDollarStart = i;
        } else {
          inDoubleDollar = false;
          if (envDepth === 0 && doubleDollarStart >= 0) {
            atomicSpans.push({ start: doubleDollarStart, end: i + 2 });
          }
          doubleDollarStart = -1;
        }
        i += 2;
        continue;
      }
      if (!inDoubleDollar) {
        if (!inSingleDollar) {
          inSingleDollar = true;
          singleDollarStart = i;
        } else {
          inSingleDollar = false;
          if (envDepth === 0 && singleDollarStart >= 0) {
            atomicSpans.push({ start: singleDollarStart, end: i + 1 });
          }
          singleDollarStart = -1;
        }
      }
      i += 1;
      continue;
    }

    // Never let an unclosed single `$` lock the rest of the section across a blank line
    if (
      inSingleDollar &&
      (ch === "\n" || ch === "\r") &&
      /^(?:\r\n|\n|\r)[ \t]*(?:\r\n|\n|\r)/.test(maskedSlice.slice(i))
    ) {
      inSingleDollar = false;
      singleDollarStart = -1;
    }

    i += 1;
  }

  // Keep any unclosed trailing math/env atomic
  if (envDepth > 0 && activeAtomicStart >= 0) {
    atomicSpans.push({ start: activeAtomicStart, end: maskedSlice.length });
  }
  if (inBracketMath && bracketMathStart >= 0) {
    atomicSpans.push({ start: bracketMathStart, end: maskedSlice.length });
  }
  if (inDoubleDollar && doubleDollarStart >= 0) {
    atomicSpans.push({ start: doubleDollarStart, end: maskedSlice.length });
  }

  // Filter out any candidate point strictly inside an atomic span
  const valid: number[] = [];
  for (const absPoint of candidatePoints) {
    const rel = absPoint - baseOffset;
    const inside = atomicSpans.some(
      (span) => rel > span.start && rel < span.end,
    );
    if (!inside) valid.push(absPoint);
  }

  valid.sort((a, b) => a - b);
  return valid;
}

function subdivideSection(
  content: string,
  masked: string,
  startOffset: number,
  endOffset: number,
  maxChunkChars: number,
): Span[] {
  if (endOffset - startOffset <= maxChunkChars) {
    return [{ start: startOffset, end: endOffset }];
  }

  const sliceMasked = masked.slice(startOffset, endOffset);
  const splitPoints = findSafeSplitPoints(sliceMasked, startOffset);
  if (splitPoints.length === 0) {
    return [{ start: startOffset, end: endOffset }];
  }

  const spans: Span[] = [];
  let cursor = startOffset;

  while (cursor < endOffset) {
    if (endOffset - cursor <= maxChunkChars) {
      spans.push({ start: cursor, end: endOffset });
      break;
    }

    const limit = cursor + maxChunkChars;
    let chosen = -1;
    for (const point of splitPoints) {
      if (point <= cursor) continue;
      if (point <= limit) {
        chosen = point;
      } else {
        break;
      }
    }

    if (chosen === -1) {
      // First atomic block / paragraph exceeds maxChunkChars; take it whole up to
      // the earliest safe split point after cursor so we never split mid-block.
      const nextPoint = splitPoints.find((point) => point > cursor);
      if (nextPoint === undefined) {
        spans.push({ start: cursor, end: endOffset });
        break;
      }
      chosen = nextPoint;
    }

    // Avoid leaving a trailing whitespace-only tail chunk
    if (content.slice(chosen, endOffset).trim() === "") {
      spans.push({ start: cursor, end: endOffset });
      break;
    }

    spans.push({ start: cursor, end: chosen });
    cursor = chosen;
  }

  return spans;
}

function uniqueMatches(matches: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of matches) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function extractChunkMetadata(maskedChunk: string): {
  labels: string[];
  refs: string[];
  cites: string[];
  environments: string[];
  mathBlockCount: number;
} {
  const labelList: string[] = [];
  for (const m of maskedChunk.matchAll(/\\label\s*\{([^}]+)\}/g)) {
    labelList.push(m[1]);
  }

  const refList: string[] = [];
  for (const m of maskedChunk.matchAll(
    /\\(?:eq|auto|page|name|[cCvVf])?ref\*?\s*\{([^}]+)\}/g,
  )) {
    for (const key of m[1].split(",")) {
      refList.push(key);
    }
  }

  const citeList: string[] = [];
  for (const m of maskedChunk.matchAll(
    /\\(?:no|full|foot|paren|text|auto)?cite(?:alp|alt|author|year|p|t)?\*?(?:\s*\[[^\]]*\]){0,2}\s*\{([^}]+)\}/g,
  )) {
    for (const key of m[1].split(",")) {
      citeList.push(key);
    }
  }

  const envList: string[] = [];
  let mathEnvCount = 0;
  for (const m of maskedChunk.matchAll(/\\begin\s*\{([^}]+)\}/g)) {
    const env = m[1].trim();
    if (env && env !== "document") {
      envList.push(env);
    }
    if (DISPLAY_MATH_ENVIRONMENTS.has(env)) {
      mathEnvCount += 1;
    }
  }

  // Count display math blocks \[...\] and $$...$$ accurately (skipping \\[6pt])
  let displayBlockCount = mathEnvCount;
  let inDoubleDollar = false;
  let i = 0;
  while (i < maskedChunk.length) {
    const ch = maskedChunk[i];
    if (ch === "\\") {
      const next = maskedChunk[i + 1];
      if (next === "\\") {
        i += 2;
        continue;
      }
      if (next === "[") {
        displayBlockCount += 1;
      }
      i += 2;
      continue;
    }
    if (ch === "$" && maskedChunk[i + 1] === "$") {
      if (!inDoubleDollar) {
        displayBlockCount += 1;
        inDoubleDollar = true;
      } else {
        inDoubleDollar = false;
      }
      i += 2;
      continue;
    }
    i += 1;
  }

  return {
    labels: uniqueMatches(labelList),
    refs: uniqueMatches(refList),
    cites: uniqueMatches(citeList),
    environments: uniqueMatches(envList),
    mathBlockCount: displayBlockCount,
  };
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Losslessly partitions a LaTeX document at logical section/environment boundaries.
 * Guarantees `chunks.map(c => c.content).join("") === content` byte-for-byte.
 */
export function chunkLatexDocument(
  content: string,
  options?: { maxChunkChars?: number },
): DocumentChunk[] {
  if (content.length === 0) return [];

  const maxChunkChars = Math.max(
    MIN_MAX_CHUNK_CHARS,
    options?.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS,
  );
  const masked = maskCommentsAndVerbatim(content);
  const lineStarts = buildLineStarts(content);
  const boundaries = findStructuralBoundaries(content, masked);

  const rawChunks: {
    kind: DocumentChunkKind;
    heading: string;
    level: number;
    startOffset: number;
    endOffset: number;
  }[] = [];

  for (let i = 0; i < boundaries.length; i += 1) {
    const boundary = boundaries[i];
    const nextOffset =
      i + 1 < boundaries.length ? boundaries[i + 1].offset : content.length;
    if (nextOffset <= boundary.offset) continue;

    const subSpans = subdivideSection(
      content,
      masked,
      boundary.offset,
      nextOffset,
      maxChunkChars,
    );

    const totalParts = subSpans.length;
    for (let part = 0; part < totalParts; part += 1) {
      const span = subSpans[part];
      const heading =
        totalParts > 1
          ? `${boundary.heading} (part ${part + 1}/${totalParts})`
          : boundary.heading;
      rawChunks.push({
        kind: boundary.kind,
        heading,
        level: boundary.level,
        startOffset: span.start,
        endOffset: span.end,
      });
    }
  }

  return rawChunks.map((raw, index) => {
    const chunkContent = content.slice(raw.startOffset, raw.endOffset);
    const chunkMasked = masked.slice(raw.startOffset, raw.endOffset);
    const meta = extractChunkMetadata(chunkMasked);
    const startLine = lineAtOffset(lineStarts, raw.startOffset);
    const endLine =
      raw.endOffset > raw.startOffset
        ? lineAtOffset(lineStarts, raw.endOffset - 1)
        : startLine;

    return {
      id: `chunk-${String(index + 1).padStart(3, "0")}`,
      index,
      kind: raw.kind,
      heading: raw.heading,
      level: raw.level,
      startOffset: raw.startOffset,
      endOffset: raw.endOffset,
      startLine,
      endLine,
      content: chunkContent,
      charCount: chunkContent.length,
      wordCount: countWords(chunkContent),
      hash: hashText(chunkContent),
      ...meta,
    };
  });
}

function tokenizeTerms(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/\\[a-zA-Z]+/g, " ")
    .match(/[a-z][a-z0-9_-]{2,}/g);
  if (!tokens) return [];
  return tokens.filter((t) => !STOP_WORDS.has(t));
}

function extractStatementSignatures(
  chunk: DocumentChunk,
): StatementSignature[] {
  const masked = maskCommentsAndVerbatim(chunk.content);
  const signatures: StatementSignature[] = [];
  const lineStarts = buildLineStarts(chunk.content);

  const openRe = new RegExp(
    `\\\\begin\\s*\\{(${[...STATEMENT_ENVIRONMENTS].join("|")})\\}(?:\\s*\\[([^\\]]*)\\])?`,
    "g",
  );
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(masked)) !== null) {
    const env = match[1];
    const title = match[2]?.trim() || undefined;
    const bodyStart = match.index + match[0].length;
    const endRe = new RegExp(`\\\\end\\s*\\{${env}\\}`);
    const endMatch = endRe.exec(masked.slice(bodyStart));
    if (!endMatch) continue;

    const rawBody = chunk.content.slice(bodyStart, bodyStart + endMatch.index);
    const bodyMasked = masked.slice(bodyStart, bodyStart + endMatch.index);
    const labelMatch = /\\label\s*\{([^}]+)\}/.exec(bodyMasked);
    const cleaned = rawBody
      .replace(/%[^\n\r]*/g, "")
      .replace(/\\label\s*\{[^}]*\}/g, "")
      .replace(/\\\[|\\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const statement =
      cleaned.length > 180 ? `${cleaned.slice(0, 177).trimEnd()}...` : cleaned;
    const localLine = lineAtOffset(lineStarts, match.index);

    signatures.push({
      environment: env,
      label: labelMatch?.[1]?.trim(),
      title,
      statement,
      line: chunk.startLine + localLine - 1,
    });
  }

  return signatures;
}

function extractProseSentences(chunk: DocumentChunk): string[] {
  const masked = maskCommentsAndVerbatim(chunk.content);
  if (chunk.kind === "preamble") {
    const docClass = /\\documentclass(?:\[[^\]]*\])?\{([^}]*)\}/.exec(masked);
    const packages = [
      ...masked.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]*)\}/g),
    ].flatMap((m) => m[1].split(",").map((p) => p.trim()));
    const macros = [
      ...masked.matchAll(
        /\\(?:newcommand|renewcommand|providecommand|DeclareMathOperator)\*?\s*\{?(\\[a-zA-Z]+)\}?/g,
      ),
    ].map((m) => m[1]);
    const parts: string[] = [];
    if (docClass) parts.push(`Document class: ${docClass[1].trim()}.`);
    if (packages.length > 0) {
      parts.push(
        `Packages: ${uniqueMatches(packages).slice(0, 12).join(", ")}.`,
      );
    }
    if (macros.length > 0) {
      parts.push(`Macros: ${uniqueMatches(macros).slice(0, 10).join(", ")}.`);
    }
    return parts;
  }

  if (chunk.kind === "backmatter") {
    return ["End of document (\\end{document})."];
  }

  if (chunk.kind === "bibliography") {
    const bibMatch = /\\bibliography\s*\{([^}]*)\}/.exec(masked);
    const items = [
      ...masked.matchAll(/\\bibitem(?:\[[^\]]*\])?\{([^}]*)\}/g),
    ].map((m) => m[1]);
    const parts: string[] = [];
    if (bibMatch) parts.push(`Bibliography source: ${bibMatch[1].trim()}.`);
    if (items.length > 0) {
      parts.push(
        `Entries (${items.length}): ${items.slice(0, 10).join(", ")}.`,
      );
    }
    return parts.length > 0 ? parts : ["Bibliography section."];
  }

  // Strip comments, sectioning headings, labels, and environment wrapper tags
  // while keeping inline math and prose readable.
  let cleaned = chunk.content
    .replace(/(^|[^\\])%[^\n\r]*/g, "$1")
    .replace(
      /\\(?:part|chapter|section|subsection|subsubsection)\*?(?:\s*\[[^\]]*\])?\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g,
      " ",
    )
    .replace(/\\label\s*\{[^}]*\}/g, "")
    .replace(/\\(?:begin|end)\s*\{[^}]*\}(?:\s*\[[^\]]*\])?/g, " ")
    .replace(/\\maketitle\b|\\tableofcontents\b|\\appendix\b/g, " ")
    .replace(/\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g, " [eq] ")
    .replace(/\r\n?/g, "\n");

  cleaned = cleaned
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  if (!cleaned) return [];

  // Split sentences while respecting inline $...$ and common abbreviations
  const sentences: string[] = [];
  for (const para of cleaned.split("\n")) {
    let start = 0;
    let inMath = false;
    for (let i = 0; i < para.length; i += 1) {
      const ch = para[i];
      if (ch === "\\" && para[i + 1] === "$") {
        i += 1;
        continue;
      }
      if (ch === "$") {
        inMath = !inMath;
        continue;
      }
      if (
        !inMath &&
        (ch === "." || ch === "!" || ch === "?") &&
        (i + 1 >= para.length || /\s/.test(para[i + 1]))
      ) {
        const prefix = para.slice(Math.max(0, i - 8), i + 1);
        if (
          /(?:e\.g\.|i\.e\.|Fig\.|Eq\.|Sec\.|Thm\.|Lem\.|Prop\.|vs\.|al\.|Dr\.|No\.)$/i.test(
            prefix,
          )
        ) {
          continue;
        }
        const candidate = para.slice(start, i + 1).trim();
        if (candidate.length >= 16) {
          sentences.push(candidate);
        }
        start = i + 1;
      }
    }
    const tail = para.slice(start).trim();
    if (tail.length >= 16) {
      sentences.push(tail);
    }
  }

  return sentences;
}

function scoreSentence(
  sentence: string,
  index: number,
  total: number,
  idfMap: Map<string, number>,
  chunkTermFreq: Map<string, number>,
): number {
  const terms = tokenizeTerms(sentence);
  let tfidfScore = 0;
  for (const term of new Set(terms)) {
    const tf = chunkTermFreq.get(term) ?? 1;
    const idf = idfMap.get(term) ?? 1;
    tfidfScore += Math.log1p(tf) * idf;
  }
  const normalizedTfidf =
    terms.length > 0 ? tfidfScore / Math.sqrt(terms.length) : 0;

  // Discourse position boost: lead and concluding sentences carry thesis & takeaway
  let positionScore = 0;
  if (index === 0) positionScore += 0.65;
  else if (index === 1) positionScore += 0.35;
  if (total > 2 && index === total - 1) positionScore += 0.28;
  if (DISCOURSE_CUE_RE.test(sentence)) positionScore += 0.55;

  // Math & scholarly salience
  let mathSalience = 0;
  const inlineMathMatches = sentence.match(/\$[^$]+\$/g)?.length ?? 0;
  if (inlineMathMatches > 0)
    mathSalience += Math.min(0.6, inlineMathMatches * 0.22);
  if (sentence.includes("[eq]")) mathSalience += 0.3;
  if (/\\(?:ref|eqref|cref|Cref)\s*\{/.test(sentence)) mathSalience += 0.25;
  if (/\\cite\w*\s*(?:\[[^\]]*\])?\s*\{/.test(sentence)) mathSalience += 0.2;

  return normalizedTfidf + positionScore + mathSalience;
}

function buildLocalIdfMap(sentences: string[]): Map<string, number> {
  const df = new Map<string, number>();
  const total = Math.max(1, sentences.length);
  for (const sentence of sentences) {
    for (const term of new Set(tokenizeTerms(sentence))) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log(1 + (total + 1) / (count + 0.5)));
  }
  return idf;
}

function fitToBudget(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(0, Math.max(0, maxChars));
  return `${text.slice(0, maxChars - 3).trimEnd()}...`;
}

function compressChunkInternal(
  chunk: DocumentChunk,
  maxChars: number,
  corpusIdf?: Map<string, number>,
): CompressedChunkDigest {
  const statements = extractStatementSignatures(chunk);
  const sentences = extractProseSentences(chunk);
  const idfMap = corpusIdf ?? buildLocalIdfMap(sentences);

  const chunkTermFreq = new Map<string, number>();
  for (const term of tokenizeTerms(chunk.content)) {
    chunkTermFreq.set(term, (chunkTermFreq.get(term) ?? 0) + 1);
  }

  const scored = sentences.map((sentence, idx) => ({
    sentence,
    idx,
    score: scoreSentence(
      sentence,
      idx,
      sentences.length,
      idfMap,
      chunkTermFreq,
    ),
  }));
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);

  // Select top sentences within ~70% of maxChars (leaving room for theorem signatures)
  const stmtReserve =
    statements.length > 0 ? Math.min(Math.floor(maxChars * 0.4), 220) : 0;
  const sentenceBudget = Math.max(80, maxChars - stmtReserve);

  const chosenIndices: number[] = [];
  let usedChars = 0;
  for (const item of scored) {
    const addition = (chosenIndices.length > 0 ? 1 : 0) + item.sentence.length;
    if (chosenIndices.length > 0 && usedChars + addition > sentenceBudget) {
      continue;
    }
    chosenIndices.push(item.idx);
    usedChars += addition;
    if (usedChars >= sentenceBudget) break;
  }

  chosenIndices.sort((a, b) => a - b);
  const keySentences = chosenIndices.map((idx) => sentences[idx]);

  const parts: string[] = [];
  if (keySentences.length > 0) {
    parts.push(keySentences.join(" "));
  }
  if (statements.length > 0) {
    const sigLines = statements
      .slice(0, 3)
      .map(
        (s) =>
          `${s.environment}${s.label ? ` (${s.label})` : ""}: ${s.statement}`,
      );
    parts.push(sigLines.join(" | "));
  }
  if (parts.length === 0) {
    const fallback = chunk.content.replace(/\s+/g, " ").trim();
    parts.push(fallback || `[${chunk.kind}] ${chunk.heading}`);
  }

  const summary = fitToBudget(parts.join("\n"), maxChars);

  return {
    chunkId: chunk.id,
    index: chunk.index,
    kind: chunk.kind,
    heading: chunk.heading,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    originalChars: chunk.charCount,
    compressedChars: summary.length,
    wordCount: chunk.wordCount,
    labels: chunk.labels,
    refs: chunk.refs,
    cites: chunk.cites,
    environments: chunk.environments,
    mathBlockCount: chunk.mathBlockCount,
    statements,
    keySentences,
    summary,
  };
}

/**
 * Compresses a single `DocumentChunk` into a compact extractive scientific digest
 * using TF-IDF, discourse-position, and math-salience sentence scoring.
 */
export function compressChunk(
  chunk: DocumentChunk,
  maxChars = DEFAULT_MAX_CHUNK_DIGEST_CHARS,
): CompressedChunkDigest {
  return compressChunkInternal(chunk, Math.max(40, maxChars));
}

function extractTitle(content: string, masked: string): string {
  const titleMatch = /\\title\*?(?=[\s[{])/.exec(masked);
  if (!titleMatch) return "Untitled Manuscript";
  let pos = skipWs(masked, titleMatch.index + titleMatch[0].length);
  if (masked[pos] === "[") {
    const opt = readBalanced(masked, pos, "[", "]");
    if (opt) pos = skipWs(masked, opt.endIndex);
  }
  const arg = readBalanced(content, pos, "{", "}");
  if (!arg) return "Untitled Manuscript";
  const cleaned = cleanHeadingText(arg.value);
  return cleaned || "Untitled Manuscript";
}

function extractAbstractSummary(
  chunks: DocumentChunk[],
  content: string,
  masked: string,
): string {
  const absChunk = chunks.find((c) => c.kind === "abstract");
  if (absChunk) {
    const sentences = extractProseSentences(absChunk);
    if (sentences.length > 0) {
      return fitToBudget(sentences.join(" "), 500);
    }
  }
  const absEnv = /\\begin\s*\{abstract\}([\s\S]*?)\\end\s*\{abstract\}/.exec(
    masked,
  );
  if (absEnv) {
    const raw = content
      .slice(
        absEnv.index + absEnv[0].indexOf("}") + 1,
        absEnv.index + absEnv[0].lastIndexOf("\\end"),
      )
      .replace(/\s+/g, " ")
      .trim();
    if (raw) return fitToBudget(raw, 500);
  }
  const absCmd = /\\abstract\s*\{/.exec(masked);
  if (absCmd) {
    const openAt = absCmd.index + absCmd[0].length - 1;
    const balanced = readBalanced(content, openAt, "{", "}");
    if (balanced) {
      return fitToBudget(balanced.value.replace(/\s+/g, " ").trim(), 500);
    }
  }
  return "";
}

function buildCorpusIdf(chunks: DocumentChunk[]): Map<string, number> {
  const df = new Map<string, number>();
  const totalDocs = Math.max(1, chunks.length);
  for (const chunk of chunks) {
    for (const term of new Set(tokenizeTerms(chunk.content))) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log(1 + (totalDocs + 1) / (count + 0.5)));
  }
  return idf;
}

/**
 * Produces a high-compression scientific digest of an entire LaTeX manuscript,
 * preserving title, abstract, full chunk outline, label/ref/cite inventories,
 * theorem signatures, and TF-IDF + discourse + math-salience chunk digests.
 */
export function compressDocument(
  content: string,
  options?: { maxChunkChars?: number; maxDigestChars?: number },
): CompressedManuscript {
  const chunks = chunkLatexDocument(content, {
    maxChunkChars: options?.maxChunkChars,
  });
  const masked = maskCommentsAndVerbatim(content);
  const title = extractTitle(content, masked);
  const abstractSummary = extractAbstractSummary(chunks, content, masked);

  const outlineEntries = chunks.map(
    (chunk) =>
      `[${chunk.id}] L${chunk.startLine}-L${chunk.endLine} §${chunk.heading} (${chunk.wordCount} words, ${chunk.labels.length} labels, ${chunk.cites.length} cites)`,
  );
  const outline = outlineEntries.join("\n");

  const labels = uniqueMatches(chunks.flatMap((c) => c.labels));
  const refs = uniqueMatches(chunks.flatMap((c) => c.refs));
  const cites = uniqueMatches(chunks.flatMap((c) => c.cites));
  const labelSet = new Set(labels);
  const unresolvedRefs = refs.filter((r) => !labelSet.has(r));

  const maxDigestChars = Math.max(
    180,
    options?.maxDigestChars ?? DEFAULT_MAX_MANUSCRIPT_DIGEST_CHARS,
  );

  // Allocate per-chunk summary budget proportionally so long papers stay compact
  const chunkBudget = Math.max(
    120,
    Math.min(
      DEFAULT_MAX_CHUNK_DIGEST_CHARS,
      Math.floor((maxDigestChars * 0.55) / Math.max(1, chunks.length)),
    ),
  );
  const corpusIdf = buildCorpusIdf(chunks);
  const chunkDigests = chunks.map((chunk) =>
    compressChunkInternal(chunk, chunkBudget, corpusIdf),
  );
  const statements = chunkDigests.flatMap((d) => d.statements);

  // Assemble digestMarkdown respecting maxDigestChars
  const sections: string[] = [];
  sections.push(`# ${title}`);
  if (abstractSummary) {
    sections.push(`## Abstract\n${abstractSummary}`);
  }
  if (outline) {
    sections.push(`## Outline (${chunks.length} chunks)\n${outline}`);
  }

  const inventoryLines: string[] = [];
  if (labels.length > 0) {
    inventoryLines.push(
      `- Labels (${labels.length}): ${labels.slice(0, 40).join(", ")}${labels.length > 40 ? ", ..." : ""}`,
    );
  }
  if (refs.length > 0) {
    inventoryLines.push(
      `- Refs (${refs.length}): ${refs.slice(0, 40).join(", ")}${refs.length > 40 ? ", ..." : ""}`,
    );
  }
  if (cites.length > 0) {
    inventoryLines.push(
      `- Citations (${cites.length}): ${cites.slice(0, 40).join(", ")}${cites.length > 40 ? ", ..." : ""}`,
    );
  }
  if (unresolvedRefs.length > 0) {
    inventoryLines.push(`- Unresolved refs: ${unresolvedRefs.join(", ")}`);
  }
  if (inventoryLines.length > 0) {
    sections.push(`## Inventories\n${inventoryLines.join("\n")}`);
  }

  if (statements.length > 0) {
    const stmtLines = statements.slice(0, 25).map((s) => {
      const tag = [s.environment, s.title, s.label ? `\\label{${s.label}}` : ""]
        .filter(Boolean)
        .join(" ");
      return `- [L${s.line}] **${tag}**: ${s.statement}`;
    });
    sections.push(
      `## Key Statements (${statements.length})\n${stmtLines.join("\n")}`,
    );
  }

  const digestLines: string[] = [];
  for (const digest of chunkDigests) {
    if (digest.kind === "backmatter") continue;
    digestLines.push(
      `### [${digest.chunkId}] L${digest.startLine}-L${digest.endLine} ${digest.heading}\n${digest.summary}`,
    );
  }
  if (digestLines.length > 0) {
    sections.push(`## Section Digests\n${digestLines.join("\n\n")}`);
  }

  let digestMarkdown = "";
  for (const section of sections) {
    const candidate = digestMarkdown
      ? `${digestMarkdown}\n\n${section}`
      : section;
    if (candidate.length <= maxDigestChars) {
      digestMarkdown = candidate;
    } else if (!digestMarkdown) {
      digestMarkdown = fitToBudget(section, maxDigestChars);
      break;
    } else {
      const remaining = maxDigestChars - digestMarkdown.length - 2;
      if (remaining > 80) {
        digestMarkdown = `${digestMarkdown}\n\n${fitToBudget(section, remaining)}`;
      }
      break;
    }
  }

  const originalChars = content.length;
  const compressedChars = digestMarkdown.length;
  const compressionRatio =
    originalChars > 0 ? 1 - compressedChars / originalChars : 0;
  const estimatedTokensSaved = Math.max(
    0,
    Math.round((originalChars - compressedChars) / 4),
  );

  return {
    title,
    abstractSummary,
    outline,
    outlineEntries,
    labels,
    refs,
    cites,
    unresolvedRefs,
    statements,
    chunkDigests,
    digestMarkdown,
    originalChars,
    compressedChars,
    compressionRatio,
    estimatedTokensSaved,
  };
}

export function getChunkSessionStorageKey(
  projectId: string,
  fileId: string,
): string {
  return `${CHUNK_SESSION_PREFIX}${projectId}:${fileId}`;
}

export function createChunkSession(input: {
  projectId: string;
  fileId: string;
  filePath: string;
  content: string;
  maxChunkChars?: number;
}): ChunkRevisionSession {
  const now = Date.now();
  const chunks = chunkLatexDocument(input.content, {
    maxChunkChars: input.maxChunkChars,
  });
  const compressed = compressDocument(input.content, {
    maxChunkChars: input.maxChunkChars,
  });

  return {
    version: 1,
    projectId: input.projectId,
    fileId: input.fileId,
    filePath: input.filePath,
    sourceHash: hashText(input.content),
    sourceLength: input.content.length,
    createdAt: now,
    updatedAt: now,
    chunks,
    compressed,
    stagedRevisions: {},
    analyses: {},
  };
}

export function saveChunkSession(session: ChunkRevisionSession): void {
  if (typeof window === "undefined") return;
  try {
    const key = getChunkSessionStorageKey(session.projectId, session.fileId);
    window.localStorage.setItem(key, JSON.stringify(session));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

export function loadChunkSession(
  projectId: string,
  fileId: string,
): ChunkRevisionSession | null {
  if (typeof window === "undefined") return null;
  try {
    const key = getChunkSessionStorageKey(projectId, fileId);
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ChunkRevisionSession>;
    if (
      parsed?.version !== 1 ||
      typeof parsed.sourceHash !== "string" ||
      !Array.isArray(parsed.chunks) ||
      !parsed.compressed ||
      typeof parsed.stagedRevisions !== "object" ||
      parsed.stagedRevisions === null
    ) {
      return null;
    }
    return {
      ...(parsed as ChunkRevisionSession),
      analyses: parsed.analyses ?? {},
    };
  } catch {
    return null;
  }
}

export function clearChunkSession(projectId: string, fileId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(
      getChunkSessionStorageKey(projectId, fileId),
    );
  } catch {
    // Ignore storage errors
  }
}

export function stageChunkRevision(
  session: ChunkRevisionSession,
  chunkId: string,
  revisedContent: string,
  note?: string,
): ChunkRevisionSession {
  const chunk = session.chunks.find((c) => c.id === chunkId);
  if (!chunk) {
    throw new Error(`Unknown chunk id: ${chunkId}`);
  }

  return {
    ...session,
    updatedAt: Date.now(),
    stagedRevisions: {
      ...session.stagedRevisions,
      [chunkId]: {
        chunkId,
        originalHash: chunk.hash,
        revisedContent,
        ...(note !== undefined ? { note } : {}),
        stagedAt: Date.now(),
      },
    },
  };
}

export function unstageChunkRevision(
  session: ChunkRevisionSession,
  chunkId: string,
): ChunkRevisionSession {
  if (!(chunkId in session.stagedRevisions)) return session;
  const { [chunkId]: _removed, ...rest } = session.stagedRevisions;
  return {
    ...session,
    updatedAt: Date.now(),
    stagedRevisions: rest,
  };
}

export function discardAllStagedRevisions(
  session: ChunkRevisionSession,
): ChunkRevisionSession {
  return {
    ...session,
    updatedAt: Date.now(),
    stagedRevisions: {},
  };
}

export function recordChunkAnalysis(
  session: ChunkRevisionSession,
  chunkId: string,
  summary: string,
  flags: string[] = [],
): ChunkRevisionSession {
  const chunk = session.chunks.find((c) => c.id === chunkId);
  if (!chunk) {
    throw new Error(`Unknown chunk id: ${chunkId}`);
  }

  return {
    ...session,
    updatedAt: Date.now(),
    analyses: {
      ...session.analyses,
      [chunkId]: {
        chunkId,
        summary,
        flags: [...flags],
        analyzedAt: Date.now(),
      },
    },
  };
}

function tailExcerpt(text: string, maxChars = 480): string {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  const sliced = text.slice(-maxChars);
  const firstBreak = sliced.indexOf("\n");
  return firstBreak !== -1 && firstBreak < sliced.length - 1
    ? sliced.slice(firstBreak + 1)
    : sliced;
}

function headExcerpt(text: string, maxChars = 480): string {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  const sliced = text.slice(0, maxChars);
  const lastBreak = sliced.lastIndexOf("\n");
  return lastBreak > 40 ? sliced.slice(0, lastBreak + 1) : sliced;
}

/**
 * Builds a Prism/Overleaf context envelope around `chunkId`, exposing manuscript
 * thesis & notation, full outline, adjacent chunk transitions, and any staged draft.
 */
export function buildChunkContextEnvelope(
  session: ChunkRevisionSession,
  chunkId: string,
): ChunkContextEnvelope {
  const idx = session.chunks.findIndex((c) => c.id === chunkId);
  if (idx === -1) {
    throw new Error(`Unknown chunk id: ${chunkId}`);
  }

  const chunk = session.chunks[idx];
  const prev = idx > 0 ? session.chunks[idx - 1] : null;
  const next = idx + 1 < session.chunks.length ? session.chunks[idx + 1] : null;

  const prevContent = prev
    ? (session.stagedRevisions[prev.id]?.revisedContent ?? prev.content)
    : "";
  const nextContent = next
    ? (session.stagedRevisions[next.id]?.revisedContent ?? next.content)
    : "";

  const thesisParts: string[] = [`Title: ${session.compressed.title}`];
  if (session.compressed.abstractSummary) {
    thesisParts.push(`Abstract: ${session.compressed.abstractSummary}`);
  }
  if (session.compressed.labels.length > 0) {
    thesisParts.push(
      `Global Labels: ${session.compressed.labels.slice(0, 20).join(", ")}`,
    );
  }
  if (session.compressed.cites.length > 0) {
    thesisParts.push(
      `Citations: ${session.compressed.cites.slice(0, 20).join(", ")}`,
    );
  }

  const staged = session.stagedRevisions[chunkId]?.revisedContent;

  return {
    thesis: thesisParts.join("\n"),
    outline: session.compressed.outline,
    previousTail: tailExcerpt(prevContent),
    chunk,
    nextHead: headExcerpt(nextContent),
    ...(staged !== undefined ? { stagedContent: staged } : {}),
  };
}

function findAllExactOccurrences(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const hits: number[] = [];
  let from = 0;
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    hits.push(idx);
    from = idx + 1;
  }
  return hits;
}

/**
 * Reassembles the complete document from staged chunk revisions and untouched chunks.
 * Uses fast exact splicing when the document hash matches `session.sourceHash`, and
 * unique original-chunk anchoring otherwise — refusing to overwrite drifted edits.
 */
export function assembleWholeRevision(
  currentDocumentContent: string,
  session: ChunkRevisionSession,
): AssembleWholeRevisionResult {
  const currentHash = hashText(currentDocumentContent);
  const exactMatch =
    currentHash === session.sourceHash &&
    currentDocumentContent.length === session.sourceLength;

  if (exactMatch) {
    const changedChunkIds: string[] = [];
    const pieces: string[] = [];

    for (const chunk of session.chunks) {
      const staged = session.stagedRevisions[chunk.id];
      if (staged && staged.revisedContent !== chunk.content) {
        pieces.push(staged.revisedContent);
        changedChunkIds.push(chunk.id);
      } else {
        pieces.push(chunk.content);
      }
    }

    const assembled = pieces.join("");
    const patch = buildFilePatch(currentDocumentContent, assembled);
    return {
      ok: true,
      content: assembled,
      strategy: "exact",
      changedChunkIds,
      stats: patchStats(patch),
      patch,
    };
  }

  // Document changed elsewhere: attempt unique exact-original-chunk anchoring
  const activeStaged = session.chunks
    .map((chunk) => ({
      chunk,
      staged: session.stagedRevisions[chunk.id],
    }))
    .filter(
      (item): item is { chunk: DocumentChunk; staged: StagedChunkRevision } =>
        Boolean(item.staged) &&
        item.staged!.revisedContent !== item.chunk.content,
    );

  if (activeStaged.length === 0) {
    const patch = buildFilePatch(
      currentDocumentContent,
      currentDocumentContent,
    );
    return {
      ok: true,
      content: currentDocumentContent,
      strategy: "anchored-fallback",
      changedChunkIds: [],
      stats: patchStats(patch),
      patch,
    };
  }

  const anchored: {
    chunkId: string;
    start: number;
    end: number;
    replacement: string;
  }[] = [];
  const driftedChunkIds: string[] = [];

  for (const { chunk, staged } of activeStaged) {
    if (staged.originalHash !== chunk.hash) {
      driftedChunkIds.push(chunk.id);
      continue;
    }

    const hits = findAllExactOccurrences(currentDocumentContent, chunk.content);
    if (hits.length !== 1) {
      driftedChunkIds.push(chunk.id);
      continue;
    }

    const start = hits[0];
    const end = start + chunk.content.length;
    const prev = anchored[anchored.length - 1];
    if (prev && start < prev.end) {
      driftedChunkIds.push(chunk.id);
      continue;
    }

    anchored.push({
      chunkId: chunk.id,
      start,
      end,
      replacement: staged.revisedContent,
    });
  }

  if (driftedChunkIds.length > 0) {
    return {
      ok: false,
      reason: "source-drift",
      driftedChunkIds,
    };
  }

  let cursor = 0;
  let assembled = "";
  const changedChunkIds: string[] = [];
  for (const item of anchored) {
    assembled += currentDocumentContent.slice(cursor, item.start);
    assembled += item.replacement;
    cursor = item.end;
    changedChunkIds.push(item.chunkId);
  }
  assembled += currentDocumentContent.slice(cursor);

  const patch = buildFilePatch(currentDocumentContent, assembled);
  return {
    ok: true,
    content: assembled,
    strategy: "anchored-fallback",
    changedChunkIds,
    stats: patchStats(patch),
    patch,
  };
}
