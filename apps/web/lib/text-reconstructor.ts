import {
  applyAllSafeLintFixes,
  type LatexLintIssue,
  lintLatexFile,
} from "@/lib/latex-linter";
import { adaptManuscriptToPublisher, type PublisherId } from "@/lib/publishers";

export type ReconstructionAggressiveness =
  | "conservative"
  | "balanced"
  | "aggressive";

export type ReconstructionOutputMode = "document" | "snippet";

export type ReconstructionTargetFormat = "article" | PublisherId;

export type BlockLabel =
  | "title"
  | "author"
  | "abstract"
  | "heading"
  | "subheading"
  | "theorem_env"
  | "proof_env"
  | "equation"
  | "list_item"
  | "table_block"
  | "reference"
  | "prose";

export const BLOCK_LABEL_META: Record<
  BlockLabel,
  { label: string; badge: string }
> = {
  title: { label: "Title", badge: "\\title" },
  author: { label: "Authors / Affiliation", badge: "\\author" },
  abstract: { label: "Abstract", badge: "abstract" },
  heading: { label: "Section", badge: "\\section" },
  subheading: { label: "Subsection", badge: "\\subsection" },
  theorem_env: { label: "Theorem / Claim", badge: "theorem" },
  proof_env: { label: "Proof", badge: "proof" },
  equation: { label: "Display Equation", badge: "equation" },
  list_item: { label: "List Item", badge: "itemize/enum" },
  table_block: { label: "Data Table", badge: "table" },
  reference: { label: "Bibliography Entry", badge: "\\bibitem" },
  prose: { label: "Body Prose", badge: "prose" },
};

export interface CorruptionTelemetry {
  charEntropy: number;
  charPerplexity: number;
  mojibakeCount: number;
  ocrNoiseRatio: number;
  brokenWrapRatio: number;
  mathSymbolDensity: number;
  compositeScore: number;
  severity: "clean" | "moderate" | "heavy" | "severe";
  diagnostics: string[];
}

export interface TokenRepair {
  original: string;
  repaired: string;
  kind:
    | "mojibake"
    | "ligature"
    | "ocr-channel"
    | "latex-cmd"
    | "word-split"
    | "word-merge";
  confidence: number;
  reason: string;
}

export interface ClassifiedBlock {
  index: number;
  rawText: string;
  cleanedText: string;
  label: BlockLabel;
  confidence: number;
  runnerUpLabel: BlockLabel;
  runnerUpConfidence: number;
  features: Record<string, number>;
  lowConfidence: boolean;
}

export interface ReconstructOptions {
  aggressiveness?: ReconstructionAggressiveness;
  outputMode?: ReconstructionOutputMode;
  targetFormat?: ReconstructionTargetFormat;
  labelOverrides?: Partial<Record<number, BlockLabel>>;
}

export interface ReconstructionResult {
  engine: "local-ml" | "hybrid-llm";
  reconstructedLatex: string;
  bodyLatex: string;
  cleanedPlainText: string;
  beforeTelemetry: CorruptionTelemetry;
  afterTelemetry: CorruptionTelemetry;
  repairs: TokenRepair[];
  blocks: ClassifiedBlock[];
  lintBeforeCount: number;
  lintAfterIssues: LatexLintIssue[];
  safeFixesApplied: number;
  fallbackNotice?: string;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Stage 1: Embedded Character Trigram Language Model & Signal Hygiene
// ---------------------------------------------------------------------------

const SCHOLARLY_TRIGRAM_CORPUS = [
  "The convergence of spectral numerical methods on smooth manifolds is established by a variational energy estimate.",
  "Theorem 1. Let u be a weak solution in the Sobolev space H^1. Then the discrete approximation u_h satisfies an optimal error bound.",
  "Proof. By the Lax-Milgram lemma and Cauchy-Schwarz inequality, we obtain uniform coercivity and continuity constants.",
  "Abstract. We investigate stochastic optimization, statistical regularization, and eigenvalue stability for large-scale partial differential equations.",
  "In this section we introduce notation, algorithm convergence criteria, experimental benchmark tables, and bibliographic references.",
  "Using gradient descent with adaptive momentum, the empirical loss decreases linearly until reaching the noise floor.",
  "For every continuous linear operator T on a Hilbert space H, the adjoint operator T^* satisfies ||T^* x|| = ||T x||.",
  "Experimental observations show 95 percent confidence intervals across training epochs, validation perplexity, and cross-entropy objectives.",
].join(" ");

interface TrigramModel {
  counts: Map<string, number>;
  contextTotals: Map<string, number>;
  vocabSize: number;
}

let cachedTrigramModel: TrigramModel | null = null;

function getTrigramModel(): TrigramModel {
  if (cachedTrigramModel) return cachedTrigramModel;

  const counts = new Map<string, number>();
  const contextTotals = new Map<string, number>();
  const chars = new Set<string>();
  const normalized = `  ${SCHOLARLY_TRIGRAM_CORPUS.toLowerCase()} `;

  for (const ch of normalized) chars.add(ch);
  for (let i = 2; i < normalized.length; i += 1) {
    const ctx = normalized.slice(i - 2, i);
    const tri = normalized.slice(i - 2, i + 1);
    counts.set(tri, (counts.get(tri) ?? 0) + 1);
    contextTotals.set(ctx, (contextTotals.get(ctx) ?? 0) + 1);
  }

  cachedTrigramModel = {
    counts,
    contextTotals,
    vocabSize: Math.max(chars.size + 24, 96),
  };
  return cachedTrigramModel;
}

function computeCharEntropy(text: string): number {
  if (!text) return 0;
  const freq = new Map<string, number>();
  for (const ch of text) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  const n = text.length;
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / n;
    entropy -= p * Math.log2(p);
  }
  return Number(entropy.toFixed(3));
}

function computeCharTrigramPerplexity(text: string): number {
  const cleaned = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (cleaned.length < 3) return 1;
  const model = getTrigramModel();
  const alpha = 0.08;
  const padded = `  ${cleaned.slice(0, 12_000)}`;
  let negLogProbSum = 0;
  let steps = 0;

  for (let i = 2; i < padded.length; i += 1) {
    const ctx = padded.slice(i - 2, i);
    const tri = padded.slice(i - 2, i + 1);
    const cTri = model.counts.get(tri) ?? 0;
    const cCtx = model.contextTotals.get(ctx) ?? 0;
    const prob = (cTri + alpha) / (cCtx + alpha * model.vocabSize);
    negLogProbSum -= Math.log(prob);
    steps += 1;
  }

  const ppl = steps > 0 ? Math.exp(negLogProbSum / steps) : 1;
  return Number(Math.min(ppl, 999).toFixed(2));
}

const MOJIBAKE_MAP: Array<[string, string, string]> = [
  ["â€œ", '"', "UTF-8 left double quote decoded as Latin-1"],
  ["â€\u009d", '"', "UTF-8 right double quote decoded as Latin-1"],
  ["â€", '"', "UTF-8 right double quote decoded as Windows-1252"],
  ["â€™", "'", "UTF-8 apostrophe decoded as Latin-1"],
  ["â€˜", "'", "UTF-8 left single quote decoded as Latin-1"],
  ["â€”", "---", "UTF-8 em-dash decoded as Latin-1"],
  ["â€“", "--", "UTF-8 en-dash decoded as Latin-1"],
  ["â€¦", "...", "UTF-8 ellipsis decoded as Latin-1"],
  ["â€¢", "-", "UTF-8 bullet decoded as Latin-1"],
  ["Â±", "±", "UTF-8 plus-minus decoded as Latin-1"],
  ["Ã—", "×", "UTF-8 multiplication sign decoded as Latin-1"],
  ["Ã·", "÷", "UTF-8 division sign decoded as Latin-1"],
  ["Ã©", "é", "UTF-8 accented e decoded as Latin-1"],
  ["Ã¨", "è", "UTF-8 grave e decoded as Latin-1"],
  ["Ãª", "ê", "UTF-8 circumflex e decoded as Latin-1"],
  ["Ã¡", "á", "UTF-8 accented a decoded as Latin-1"],
  ["Ã ", "à", "UTF-8 grave a decoded as Latin-1"],
  ["Ã¶", "ö", "UTF-8 umlaut o decoded as Latin-1"],
  ["Ã¼", "ü", "UTF-8 umlaut u decoded as Latin-1"],
  ["Ã±", "ñ", "UTF-8 tilde n decoded as Latin-1"],
  ["Ã§", "ç", "UTF-8 cedilla c decoded as Latin-1"],
  ["Ã¯", "ï", "UTF-8 diaeresis i decoded as Latin-1"],
  ["Î±", "α", "UTF-8 Greek alpha decoded as Latin-1"],
  ["Î²", "β", "UTF-8 Greek beta decoded as Latin-1"],
  ["Î³", "γ", "UTF-8 Greek gamma decoded as Latin-1"],
  ["Î´", "δ", "UTF-8 Greek delta decoded as Latin-1"],
  ["Îµ", "ε", "UTF-8 Greek epsilon decoded as Latin-1"],
  ["Î¸", "θ", "UTF-8 Greek theta decoded as Latin-1"],
  ["Î»", "λ", "UTF-8 Greek lambda decoded as Latin-1"],
  ["Î¼", "μ", "UTF-8 Greek mu decoded as Latin-1"],
  ["Ï€", "π", "UTF-8 Greek pi decoded as Latin-1"],
  ["Ïƒ", "σ", "UTF-8 Greek sigma decoded as Latin-1"],
  ["Ï‰", "ω", "UTF-8 Greek omega decoded as Latin-1"],
  ["Î£", "Σ", "UTF-8 Greek Sigma decoded as Latin-1"],
  ["Î©", "Ω", "UTF-8 Greek Omega decoded as Latin-1"],
  ["âˆ‘", "∑", "UTF-8 summation sign decoded as Latin-1"],
  ["âˆ«", "∫", "UTF-8 integral sign decoded as Latin-1"],
  ["â‰¤", "≤", "UTF-8 less-equal decoded as Latin-1"],
  ["â‰¥", "≥", "UTF-8 greater-equal decoded as Latin-1"],
  ["â‰ ", "≠", "UTF-8 not-equal decoded as Latin-1"],
  ["â‰ˆ", "≈", "UTF-8 approx decoded as Latin-1"],
  ["â†’", "→", "UTF-8 arrow decoded as Latin-1"],
  ["âˆž", "∞", "UTF-8 infinity decoded as Latin-1"],
  ["âˆˆ", "∈", "UTF-8 element-of decoded as Latin-1"],
  ["âˆ€", "∀", "UTF-8 universal quantifier decoded as Latin-1"],
  ["âˆƒ", "∃", "UTF-8 existential quantifier decoded as Latin-1"],
  ["âˆ‚", "∂", "UTF-8 partial derivative decoded as Latin-1"],
  ["âˆ‡", "∇", "UTF-8 nabla decoded as Latin-1"],
  ["âˆš", "√", "UTF-8 square root decoded as Latin-1"],
];

const LIGATURE_MAP: Array<[string, string]> = [
  ["ﬃ", "ffi"],
  ["ﬄ", "ffl"],
  ["ﬁ", "fi"],
  ["ﬂ", "fl"],
  ["ﬀ", "ff"],
  ["ﬅ", "st"],
  ["ﬆ", "st"],
];

const UNICODE_PUNCT_MAP: Array<[RegExp, string]> = [
  [/[“”]/g, '"'],
  [/[‘’]/g, "'"],
  [/—/g, "---"],
  [/–/g, "--"],
  [/…/g, "..."],
  [/[\u00A0]/g, " "],
];

const UNICODE_MATH_SYMBOLS =
  /[αβγδεζηθικλμνξρστφχψωΓΔΘΛΞΠΣΦΨΩ∑∏∫∂∇∞≤≥≠≈≡±×÷∈∉⊂⊆∀∃→↦↔√∥]/g;

export function analyzeTextCorruption(text: string): CorruptionTelemetry {
  const normalized = text.replace(/\r\n/g, "\n");
  const charEntropy = computeCharEntropy(normalized);
  const charPerplexity = computeCharTrigramPerplexity(normalized);

  let mojibakeCount = 0;
  for (const [corrupt] of MOJIBAKE_MAP) {
    let idx = normalized.indexOf(corrupt);
    while (idx !== -1) {
      mojibakeCount += 1;
      idx = normalized.indexOf(corrupt, idx + corrupt.length);
    }
  }
  const extraCorruptMatches = normalized.match(/\uFFFD|Â(?=[ ±×÷\s])/g);
  if (extraCorruptMatches) mojibakeCount += extraCorruptMatches.length;

  const ligatureMatches = normalized.match(/[ﬁﬂﬀﬃﬄﬅﬆ]/g);
  const ligatureCount = ligatureMatches ? ligatureMatches.length : 0;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  let noisyTokenCount = 0;
  for (const raw of tokens) {
    const token = raw.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");
    if (token.length < 2) continue;
    const digitInsideAlpha =
      /[a-zA-Z][0-9][a-zA-Z]/.test(token) ||
      (/[0158]/.test(token) && /[a-zA-Z]{2,}/.test(token));
    const mixedControlOrWeird =
      /[^\x20-\x7E\n\tα-ωΑ-Ω∑∏∫∂∇∞≤≥≠≈±×÷∈∀∃→√éèêáàöüñç]/.test(token);
    const knownOcrTrap =
      /^(?:thc|tbe|wltb|frorn|rnethod|pr00f|l0|equatlon|theorern|corollaIy|alg0rithm)$/i.test(
        token,
      );
    if (digitInsideAlpha || mixedControlOrWeird || knownOcrTrap) {
      noisyTokenCount += 1;
    }
  }
  const ocrNoiseRatio =
    tokens.length > 0
      ? Number((noisyTokenCount / tokens.length).toFixed(4))
      : 0;

  const lines = normalized.split("\n");
  let midSentenceBreaks = 0;
  let hyphenWraps = 0;
  for (let i = 0; i < lines.length - 1; i += 1) {
    const cur = lines[i].trimEnd();
    const next = lines[i + 1].trimStart();
    if (!cur || !next) continue;
    if (/[a-zA-Z]{2,}-$/.test(cur) && /^[a-z]{2,}/.test(next)) {
      hyphenWraps += 1;
    } else if (
      cur.length > 24 &&
      !/[.!?:;}\]]$/.test(cur) &&
      /^[a-z(]/.test(next)
    ) {
      midSentenceBreaks += 1;
    }
  }
  const brokenWrapRatio =
    lines.length > 1
      ? Number(
          Math.min(1, (midSentenceBreaks + hyphenWraps) / lines.length).toFixed(
            4,
          ),
        )
      : 0;

  const mathMatches = normalized.match(UNICODE_MATH_SYMBOLS);
  const mathCommandMatches = normalized.match(
    /\\(?:frac|sum|int|alpha|beta|gamma|theta|lambda|sigma|omega|le|ge|neq|to|infty|in|forall|exists|partial|nabla|mathbb|begin\{equation)/g,
  );
  const mathCount =
    (mathMatches ? mathMatches.length : 0) +
    (mathCommandMatches ? mathCommandMatches.length : 0);
  const mathSymbolDensity =
    normalized.length > 0
      ? Number((mathCount / Math.max(tokens.length, 1)).toFixed(4))
      : 0;

  // Normalized 0..100 corruption score blending trigram perplexity, mojibake, OCR, wraps
  const pplPenalty = Math.max(0, Math.min(38, (charPerplexity - 9.5) * 2.1));
  const mojibakePenalty = Math.min(35, (mojibakeCount + ligatureCount) * 4.5);
  const ocrPenalty = Math.min(35, ocrNoiseRatio * 180);
  const wrapPenalty = Math.min(20, brokenWrapRatio * 32);
  const compositeScore = Number(
    Math.min(
      100,
      Math.max(0, pplPenalty + mojibakePenalty + ocrPenalty + wrapPenalty),
    ).toFixed(1),
  );

  const severity: CorruptionTelemetry["severity"] =
    compositeScore >= 55
      ? "severe"
      : compositeScore >= 28
        ? "heavy"
        : compositeScore >= 10
          ? "moderate"
          : "clean";

  const diagnostics: string[] = [];
  if (mojibakeCount > 0) {
    diagnostics.push(`${mojibakeCount} UTF-8/Latin-1 mojibake sequence(s)`);
  }
  if (ligatureCount > 0) {
    diagnostics.push(`${ligatureCount} PDF ligature glyph(s)`);
  }
  if (ocrNoiseRatio > 0.02) {
    diagnostics.push(
      `${(ocrNoiseRatio * 100).toFixed(1)}% OCR confusion tokens`,
    );
  }
  if (brokenWrapRatio > 0.15) {
    diagnostics.push(
      `${hyphenWraps + midSentenceBreaks} broken line wraps / hyphenations`,
    );
  }
  if (charPerplexity > 15) {
    diagnostics.push(`Elevated character perplexity (${charPerplexity})`);
  }

  return {
    charEntropy,
    charPerplexity,
    mojibakeCount: mojibakeCount + ligatureCount,
    ocrNoiseRatio,
    brokenWrapRatio,
    mathSymbolDensity,
    compositeScore,
    severity,
    diagnostics,
  };
}

function isLikelyHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 90) return false;
  if (/^#+\s+\S/.test(trimmed)) return true;
  if (/^\\(?:section|subsection|subsubsection|chapter)\*?\{/.test(trimmed)) {
    return true;
  }
  if (
    /^(?:\d+(?:\.\d+)*|[IVX]+)[.)]?\s+[A-Z][A-Za-z0-9\s,&:-]{2,70}$/.test(
      trimmed,
    ) &&
    !/[.?!]$/.test(trimmed)
  ) {
    return true;
  }
  if (
    /^(?:Abstract|Introduction|Background|Related Work|Preliminaries|Methodology|Methods|Approach|Experiments|Evaluation|Results|Discussion|Conclusion|Conclusions|Acknowledgements|Acknowledgments|References|Bibliography|Appendix)\s*[:.]?$/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (
    /^(?:Theorem|Lemma|Proposition|Corollary|Definition|Remark|Proof)\b/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  return false;
}

function isLikelyListLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^(?:[-*•◦▪‣]|\(?\d{1,3}[.)]|\([a-zA-Z]\))\s+\S/.test(trimmed) &&
    !/^\d+\.\d+\s+[A-Z]/.test(trimmed)
  );
}

function isLikelyTableLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/\|/.test(trimmed) && (trimmed.match(/\|/g)?.length ?? 0) >= 2) {
    return true;
  }
  if (/\t/.test(trimmed)) return true;
  if (/\s{3,}\S+/.test(trimmed) && !/^[-*]/.test(trimmed)) return true;
  return false;
}

function isLikelyEquationLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (
    /^\$\$[\s\S]+\$\$$/.test(trimmed) ||
    /^\\\[[\s\S]+\\\]$/.test(trimmed) ||
    /^\\begin\{(?:equation|align|gather|multline)\*?\}/.test(trimmed)
  ) {
    return true;
  }
  const mathOps = (trimmed.match(/[=<>≤≥≠≈∈∑∏∫∂∇^_√→]/g) ?? []).length;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return (
    mathOps >= 2 &&
    wordCount <= 16 &&
    !/[.?!]$/.test(trimmed.replace(/\(\d+\)$/, "").trim())
  );
}

function stripControlAndZeroWidth(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (
      (code < 32 && code !== 9 && code !== 10) ||
      code === 127 ||
      code === 0x00ad ||
      (code >= 0x200b && code <= 0x200d) ||
      code === 0xfeff
    ) {
      continue;
    }
    out += input[i];
  }
  return out;
}

function isLikelyAuthorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 180) return false;
  if (/^[Aa]bstract\b/.test(trimmed)) return false;
  return (
    /(?:university|institute|department|laboratory|college|school|faculty|center|centre|@)/i.test(
      trimmed,
    ) &&
    trimmed.split(/\s+/).length <= 24 &&
    !/[.?!]$/.test(trimmed)
  );
}

export function cleanRawText(
  rawText: string,
  repairs: TokenRepair[] = [],
): string {
  let text = stripControlAndZeroWidth(
    rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
  );

  // 1. Mojibake repair
  for (const [corrupt, fixed, reason] of MOJIBAKE_MAP) {
    if (text.includes(corrupt)) {
      text = text.split(corrupt).join(fixed);
      repairs.push({
        original: corrupt,
        repaired: fixed,
        kind: "mojibake",
        confidence: 0.99,
        reason,
      });
    }
  }
  // Catch trailing Windows-1252 right quote where byte 0x9D dropped or became NBSP/space
  if (/â€/.test(text)) {
    text = text.replace(/â€(?=\s|$|[.,;:!?])/g, '"');
  }
  // Remove stray Latin-1 U+00C2 prefix before spaces
  if (/Â\s/.test(text)) {
    text = text.replace(/Â(?=\s)/g, "");
  }

  // 2. Ligature expansion
  for (const [lig, expanded] of LIGATURE_MAP) {
    if (text.includes(lig)) {
      text = text.split(lig).join(expanded);
      repairs.push({
        original: lig,
        repaired: expanded,
        kind: "ligature",
        confidence: 0.99,
        reason: "PDF typographic ligature normalized to ASCII",
      });
    }
  }

  // 3. Typographic punctuation normalization
  for (const [pattern, replacement] of UNICODE_PUNCT_MAP) {
    text = text.replace(pattern, replacement);
  }

  // 4. Suppress repeated running headers / footers & isolated page numbers
  const rawLines = text.split("\n");
  const lineFreq = new Map<string, number>();
  for (const line of rawLines) {
    const key = line.trim();
    if (key.length >= 4 && key.length <= 64) {
      lineFreq.set(key, (lineFreq.get(key) ?? 0) + 1);
    }
  }

  const filteredLines: string[] = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const trimmed = rawLines[i].trim();
    const prevBlank = i === 0 || rawLines[i - 1].trim() === "";
    const nextBlank =
      i === rawLines.length - 1 || rawLines[i + 1].trim() === "";
    const isStandalonePageNum =
      prevBlank &&
      nextBlank &&
      (/^(?:page\s+\d+(?:\s+of\s+\d+)?|-\s*\d+\s*-|\d{1,3})$/i.test(trimmed) ||
        /^preprint\.?\s+under\s+review\.?$/i.test(trimmed));
    const isRepeatedRunningHeader =
      (lineFreq.get(trimmed) ?? 0) >= 2 &&
      trimmed.length <= 64 &&
      !/[.?!]$/.test(trimmed) &&
      !isLikelyHeadingLine(trimmed) &&
      !isLikelyEquationLine(trimmed) &&
      !isLikelyTableLine(trimmed) &&
      (prevBlank || nextBlank);

    if (isStandalonePageNum || isRepeatedRunningHeader) {
      continue;
    }
    filteredLines.push(rawLines[i]);
  }

  // 5. Rejoin hyphenated cross-line words and unwrap mid-paragraph wraps
  const healedLines: string[] = [];
  let buffer = "";

  const flushBuffer = () => {
    if (buffer.trim()) {
      healedLines.push(buffer.trim());
    }
    buffer = "";
  };

  for (const rawLine of filteredLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushBuffer();
      if (
        healedLines.length > 0 &&
        healedLines[healedLines.length - 1] !== ""
      ) {
        healedLines.push("");
      }
      continue;
    }

    // Structural lines stay on their own lines rather than merging into prose
    if (
      isLikelyAuthorLine(trimmed) ||
      isLikelyHeadingLine(trimmed) ||
      isLikelyListLine(trimmed) ||
      isLikelyTableLine(trimmed) ||
      isLikelyEquationLine(trimmed) ||
      /^\[\d{1,3}\]\s+\S/.test(trimmed)
    ) {
      flushBuffer();
      healedLines.push(trimmed);
      continue;
    }

    if (!buffer) {
      buffer = trimmed;
      continue;
    }

    // Check hyphenated line break
    if (/[a-zA-Z]{2,}-$/.test(buffer) && /^[a-z]{2,}/.test(trimmed)) {
      const leftWordMatch = buffer.match(/([a-zA-Z]{2,})-$/);
      const rightWordMatch = trimmed.match(/^([a-z]{2,})/);
      if (leftWordMatch && rightWordMatch) {
        const merged = `${leftWordMatch[1]}${rightWordMatch[1]}`;
        repairs.push({
          original: `${leftWordMatch[1]}-\n${rightWordMatch[1]}`,
          repaired: merged,
          kind: "word-merge",
          confidence: 0.94,
          reason: "Rejoined hyphenated line-wrap split",
        });
      }
      buffer = `${buffer.slice(0, -1)}${trimmed}`;
    } else {
      buffer = `${buffer} ${trimmed}`;
    }
  }
  flushBuffer();

  return healedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Stage 2: Bayesian Noisy-Channel Denoising & Viterbi Word Segmentation
// ---------------------------------------------------------------------------

const HIGH_PRIOR_WORDS = [
  // Function / stop words & connectives
  "the",
  "of",
  "and",
  "to",
  "in",
  "a",
  "an",
  "is",
  "that",
  "for",
  "it",
  "with",
  "as",
  "was",
  "on",
  "are",
  "be",
  "by",
  "this",
  "which",
  "or",
  "from",
  "at",
  "not",
  "we",
  "our",
  "their",
  "these",
  "those",
  "have",
  "has",
  "had",
  "can",
  "will",
  "would",
  "should",
  "could",
  "may",
  "might",
  "if",
  "then",
  "else",
  "when",
  "where",
  "while",
  "since",
  "because",
  "although",
  "however",
  "moreover",
  "therefore",
  "thus",
  "hence",
  "furthermore",
  "additionally",
  "between",
  "among",
  "across",
  "under",
  "over",
  "above",
  "below",
  "through",
  "into",
  "onto",
  "within",
  "without",
  "each",
  "every",
  "all",
  "some",
  "any",
  "such",
  "more",
  "most",
  "less",
  "than",
  "only",
  "also",
  "both",
  "either",
  "neither",
  "two",
  "three",
  "first",
  "second",
  "third",
  "one",
  "zero",
  "new",
  "well",
  "very",
  "using",
  "based",
  "given",
];

const ACADEMIC_MATH_LEXICON = [
  "abstract",
  "introduction",
  "background",
  "preliminaries",
  "methodology",
  "methods",
  "approach",
  "experiments",
  "experimental",
  "evaluation",
  "results",
  "discussion",
  "conclusion",
  "conclusions",
  "references",
  "bibliography",
  "acknowledgments",
  "acknowledgements",
  "appendix",
  "section",
  "subsection",
  "theorem",
  "lemma",
  "proposition",
  "corollary",
  "definition",
  "remark",
  "proof",
  "claim",
  "conjecture",
  "example",
  "assumption",
  "hypotheses",
  "hypothesis",
  "equation",
  "equations",
  "formula",
  "formulas",
  "inequality",
  "identity",
  "expression",
  "operator",
  "operators",
  "linear",
  "nonlinear",
  "matrix",
  "matrices",
  "vector",
  "vectors",
  "tensor",
  "tensors",
  "scalar",
  "eigenvalue",
  "eigenvalues",
  "eigenvector",
  "eigenvectors",
  "eigenspace",
  "spectral",
  "spectrum",
  "singular",
  "decomposition",
  "factorization",
  "convergence",
  "converges",
  "convergent",
  "divergence",
  "diverge",
  "asymptotic",
  "estimate",
  "estimates",
  "estimation",
  "estimator",
  "bound",
  "bounds",
  "bounded",
  "upper",
  "lower",
  "optimal",
  "optimality",
  "optimization",
  "optimize",
  "minimize",
  "minimization",
  "maximize",
  "maximization",
  "gradient",
  "hessian",
  "jacobian",
  "laplacian",
  "differential",
  "derivative",
  "integral",
  "integration",
  "summation",
  "series",
  "sequence",
  "limit",
  "continuous",
  "continuity",
  "smooth",
  "smoothness",
  "differentiable",
  "compact",
  "convex",
  "convexity",
  "concave",
  "hilbert",
  "banach",
  "sobolev",
  "manifold",
  "manifolds",
  "topology",
  "topological",
  "metric",
  "norm",
  "norms",
  "inner",
  "product",
  "projection",
  "orthogonal",
  "orthonormal",
  "subspace",
  "kernel",
  "range",
  "rank",
  "trace",
  "determinant",
  "inverse",
  "invertible",
  "adjoint",
  "symmetric",
  "hermitian",
  "positive",
  "definite",
  "semidefinite",
  "stochastic",
  "random",
  "probability",
  "probabilistic",
  "distribution",
  "distributions",
  "gaussian",
  "normal",
  "uniform",
  "bernoulli",
  "poisson",
  "variance",
  "covariance",
  "expectation",
  "expected",
  "mean",
  "median",
  "quantile",
  "confidence",
  "interval",
  "intervals",
  "bayesian",
  "posterior",
  "prior",
  "likelihood",
  "inference",
  "markov",
  "ergodic",
  "stationary",
  "entropy",
  "perplexity",
  "mutual",
  "information",
  "regularization",
  "regularized",
  "penalty",
  "lasso",
  "ridge",
  "regression",
  "classification",
  "clustering",
  "neural",
  "network",
  "networks",
  "layer",
  "layers",
  "attention",
  "transformer",
  "training",
  "validation",
  "testing",
  "generalization",
  "overfitting",
  "empirical",
  "loss",
  "objective",
  "function",
  "functions",
  "functional",
  "variable",
  "variables",
  "parameter",
  "parameters",
  "coefficient",
  "coefficients",
  "constant",
  "constants",
  "polynomial",
  "rational",
  "exponential",
  "logarithm",
  "logarithmic",
  "trigonometric",
  "fourier",
  "wavelet",
  "transform",
  "domain",
  "codomain",
  "image",
  "preimage",
  "algorithm",
  "algorithms",
  "algorithmic",
  "complexity",
  "runtime",
  "memory",
  "iteration",
  "iterations",
  "iterative",
  "numerical",
  "discretization",
  "discrete",
  "finite",
  "difference",
  "elements",
  "element",
  "volume",
  "mesh",
  "grid",
  "solver",
  "solvers",
  "preconditioner",
  "krylov",
  "multigrid",
  "stability",
  "stable",
  "unstable",
  "consistency",
  "consistent",
  "accuracy",
  "accurate",
  "precision",
  "recall",
  "residual",
  "residuals",
  "error",
  "errors",
  "data",
  "dataset",
  "datasets",
  "sample",
  "samples",
  "sampling",
  "noise",
  "noisy",
  "signal",
  "signals",
  "filter",
  "filtering",
  "reconstruction",
  "reconstruct",
  "reconstructed",
  "structure",
  "structured",
  "document",
  "documents",
  "manuscript",
  "paper",
  "journal",
  "preprint",
  "figure",
  "figures",
  "table",
  "tables",
  "caption",
  "label",
  "citation",
  "citations",
  "model",
  "models",
  "modeling",
  "modelling",
  "framework",
  "system",
  "systems",
  "analysis",
  "analytical",
  "theoretical",
  "theory",
  "properties",
  "property",
  "satisfy",
  "satisfies",
  "satisfied",
  "holds",
  "hold",
  "obtain",
  "obtains",
  "obtained",
  "establish",
  "establishes",
  "established",
  "follows",
  "follow",
  "consider",
  "considering",
  "suppose",
  "assume",
  "assuming",
  "denote",
  "denotes",
  "denoted",
  "define",
  "defines",
  "defined",
  "observe",
  "observed",
  "shows",
  "show",
  "shown",
  "demonstrate",
  "demonstrates",
  "demonstrated",
  "compare",
  "compares",
  "compared",
  "comparison",
  "baseline",
  "baselines",
  "benchmark",
  "benchmarks",
  "outperforms",
  "achieves",
  "achieve",
  "improve",
  "improves",
  "improved",
  "improvement",
  "significant",
  "significantly",
  "proposed",
  "propose",
  "proposes",
  "present",
  "presents",
  "presented",
  "investigate",
  "investigates",
  "studied",
  "study",
  "studies",
  "problem",
  "problems",
  "solution",
  "solutions",
  "unique",
  "uniqueness",
  "existence",
  "exists",
  "exist",
  "arbitrary",
  "sufficient",
  "necessary",
  "condition",
  "conditions",
  "respectively",
  "similarly",
  "conversely",
  "specifically",
  "particularly",
  "consequently",
  "equivalently",
  "indeed",
  "clearly",
  "obviously",
  "recall",
  "note",
  "notice",
  "state",
  "statement",
  "stated",
  "apply",
  "applying",
  "applied",
  "application",
  "applications",
  "substitute",
  "substituting",
  "expanding",
  "expansion",
  "combine",
  "combining",
  "combined",
  "average",
  "total",
  "number",
  "value",
  "values",
  "size",
  "dimension",
  "dimensions",
  "degree",
  "order",
  "rate",
  "speed",
  "ratio",
  "percent",
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "zeta",
  "eta",
  "theta",
  "iota",
  "kappa",
  "lambda",
  "mu",
  "nu",
  "xi",
  "rho",
  "sigma",
  "tau",
  "phi",
  "chi",
  "psi",
  "omega",
  "where",
  "there",
  "which",
  "whose",
  "their",
  "other",
  "another",
  "several",
  "various",
  "different",
  "similar",
  "standard",
  "classical",
  "modern",
  "general",
  "special",
  "simple",
  "complex",
  "large",
  "small",
  "high",
  "low",
  "fast",
  "slow",
  "strong",
  "weak",
  "exact",
  "approximate",
  "local",
  "global",
  "initial",
  "final",
  "previous",
  "next",
  "step",
  "steps",
  "stage",
  "stages",
  "phase",
  "time",
  "space",
  "state",
  "control",
  "policy",
  "dynamics",
  "dynamical",
  "flow",
  "graph",
  "graphs",
  "node",
  "nodes",
  "edge",
  "edges",
  "tree",
  "path",
  "paths",
  "cycle",
  "feature",
  "features",
  "weight",
  "weights",
  "bias",
  "score",
  "scores",
  "learning",
  "machine",
  "statistical",
  "statistics",
  "mathematics",
  "mathematical",
  "compute",
  "computed",
  "computation",
  "computational",
];

const LATEX_COMMAND_LEXICON = [
  "section",
  "subsection",
  "subsubsection",
  "paragraph",
  "chapter",
  "title",
  "author",
  "maketitle",
  "abstract",
  "begin",
  "end",
  "equation",
  "align",
  "gather",
  "theorem",
  "lemma",
  "proposition",
  "corollary",
  "definition",
  "remark",
  "proof",
  "itemize",
  "enumerate",
  "item",
  "table",
  "tabular",
  "figure",
  "caption",
  "label",
  "ref",
  "eqref",
  "cite",
  "citet",
  "citep",
  "bibliography",
  "bibliographystyle",
  "bibitem",
  "frac",
  "sqrt",
  "sum",
  "prod",
  "int",
  "oint",
  "partial",
  "nabla",
  "infty",
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "theta",
  "lambda",
  "mu",
  "sigma",
  "omega",
  "mathbf",
  "mathbb",
  "mathcal",
  "mathrm",
  "textbf",
  "textit",
  "emph",
  "left",
  "right",
  "quad",
  "qquad",
  "toprule",
  "midrule",
  "bottomrule",
  "includegraphics",
  "usepackage",
  "documentclass",
  "newtheorem",
  "hyperref",
];

interface VocabularyModel {
  wordLogPrior: Map<string, number>;
  wordsByLength: Map<number, string[]>;
  allWords: string[];
  latexCommands: Set<string>;
}

let cachedVocab: VocabularyModel | null = null;

function getBaseVocabulary(): VocabularyModel {
  if (cachedVocab) return cachedVocab;

  const wordLogPrior = new Map<string, number>();
  for (let i = 0; i < HIGH_PRIOR_WORDS.length; i += 1) {
    wordLogPrior.set(HIGH_PRIOR_WORDS[i], -2.6 - Math.log1p(i) * 0.35);
  }
  for (let i = 0; i < ACADEMIC_MATH_LEXICON.length; i += 1) {
    const w = ACADEMIC_MATH_LEXICON[i];
    if (!wordLogPrior.has(w)) {
      wordLogPrior.set(w, -4.2 - Math.log1p(i) * 0.28);
    }
  }

  const wordsByLength = new Map<number, string[]>();
  const allWords = Array.from(wordLogPrior.keys());
  for (const word of allWords) {
    const arr = wordsByLength.get(word.length) ?? [];
    arr.push(word);
    wordsByLength.set(word.length, arr);
  }

  cachedVocab = {
    wordLogPrior,
    wordsByLength,
    allWords,
    latexCommands: new Set(LATEX_COMMAND_LEXICON),
  };
  return cachedVocab;
}

const SINGLE_CHAR_CONFUSION: Record<string, number> = {
  "0:o": 0.22,
  "o:0": 0.22,
  "1:l": 0.22,
  "l:1": 0.22,
  "1:i": 0.25,
  "i:1": 0.25,
  "5:s": 0.28,
  "s:5": 0.28,
  "8:b": 0.32,
  "b:8": 0.32,
  "c:e": 0.32,
  "e:c": 0.32,
  "t:f": 0.35,
  "f:t": 0.35,
  "n:u": 0.35,
  "u:n": 0.35,
  "h:b": 0.38,
  "b:h": 0.38,
  "a:e": 0.48,
  "e:a": 0.48,
  "i:l": 0.3,
  "l:i": 0.3,
  "4:a": 0.36,
  "3:e": 0.36,
};

const DIGRAPH_CONFUSION: Record<string, number> = {
  "rn:m": 0.24,
  "m:rn": 0.24,
  "cl:d": 0.28,
  "d:cl": 0.28,
  "vv:w": 0.24,
  "w:vv": 0.24,
  "ii:u": 0.34,
  "u:ii": 0.34,
  "ri:n": 0.35,
  "n:ri": 0.35,
  "nn:m": 0.42,
  "m:nn": 0.42,
  "oo:00": 0.3,
  "00:oo": 0.3,
};

function buildCharCodePairMap(
  entries: Record<string, number>,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const [key, cost] of Object.entries(entries)) {
    const colon = key.indexOf(":");
    if (colon !== 1 || key.length !== 3) continue;
    const packed = (key.charCodeAt(0) << 16) | key.charCodeAt(2);
    map.set(packed, cost);
  }
  return map;
}

function buildDigraphCodeMap(
  entries: Record<string, number>,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const [key, cost] of Object.entries(entries)) {
    const colon = key.indexOf(":");
    if (colon === -1) continue;
    const left = key.slice(0, colon);
    const right = key.slice(colon + 1);
    if (left.length + right.length !== 3) continue;
    const packed =
      (left.length === 2 ? 0x1000000 : 0) |
      (left.charCodeAt(0) << 16) |
      ((left.length === 2 ? left.charCodeAt(1) : right.charCodeAt(0)) << 8) |
      (left.length === 2 ? right.charCodeAt(0) : right.charCodeAt(1));
    map.set(packed, cost);
  }
  return map;
}

const SINGLE_CHAR_CONFUSION_MAP = buildCharCodePairMap(SINGLE_CHAR_CONFUSION);
const DIGRAPH_CONFUSION_MAP = buildDigraphCodeMap(DIGRAPH_CONFUSION);

let scratchConfusionDp = new Float64Array(1024);

function ensureConfusionDpBuffer(needed: number): Float64Array {
  if (scratchConfusionDp.length < needed) {
    let nextCap = scratchConfusionDp.length || 1024;
    while (nextCap < needed) nextCap *= 2;
    scratchConfusionDp = new Float64Array(nextCap);
  }
  return scratchConfusionDp;
}

/**
 * Weighted OCR & keyboard confusion Damerau-Levenshtein edit distance.
 * Accounts for common glyph confusions (rn<->m, cl<->d, 0<->o, 1<->l/i, c<->e)
 * and adjacent character transpositions using a flat scratch DP buffer.
 */
export function confusionEditDistance(source: string, target: string): number {
  const a = source.toLowerCase();
  const b = target.toLowerCase();
  const n = a.length;
  const m = b.length;
  if (a === b) return 0;
  if (n === 0) return m;
  if (m === 0) return n;

  const INF = 1e6;
  const cols = m + 1;
  const needed = (n + 1) * cols;
  const dp = ensureConfusionDpBuffer(needed);
  dp.fill(INF, 0, needed);
  dp[0] = 0;

  for (let i = 1; i <= n; i += 1) dp[i * cols] = i;
  for (let j = 1; j <= m; j += 1) dp[j] = j;

  for (let i = 1; i <= n; i += 1) {
    const rowOffset = i * cols;
    const prevRowOffset = rowOffset - cols;
    const codeA = a.charCodeAt(i - 1);
    const prevCodeA = i >= 2 ? a.charCodeAt(i - 2) : 0;

    for (let j = 1; j <= m; j += 1) {
      const codeB = b.charCodeAt(j - 1);
      const subCost =
        codeA === codeB
          ? 0
          : (SINGLE_CHAR_CONFUSION_MAP.get((codeA << 16) | codeB) ?? 1.0);

      let best = Math.min(
        dp[prevRowOffset + j] + 1.0,
        dp[rowOffset + j - 1] + 1.0,
        dp[prevRowOffset + j - 1] + subCost,
      );

      if (i > 1 && j > 1) {
        const prevCodeB = b.charCodeAt(j - 2);
        if (codeA === prevCodeB && prevCodeA === codeB) {
          const trans = dp[(i - 2) * cols + j - 2] + 0.45;
          if (trans < best) best = trans;
        }
      }

      // 2->1 visual digraph substitutions (e.g. "rn" -> "m", "00" -> "oo")
      if (i >= 2) {
        const digCost = DIGRAPH_CONFUSION_MAP.get(
          0x1000000 | (prevCodeA << 16) | (codeA << 8) | codeB,
        );
        if (digCost !== undefined) {
          const cand = dp[(i - 2) * cols + j - 1] + digCost;
          if (cand < best) best = cand;
        }
      }

      // 1->2 visual expansion (e.g. "m" -> "rn")
      if (j >= 2) {
        const prevCodeB = b.charCodeAt(j - 2);
        const digCost = DIGRAPH_CONFUSION_MAP.get(
          (codeA << 16) | (prevCodeB << 8) | codeB,
        );
        if (digCost !== undefined) {
          const cand = dp[prevRowOffset + j - 2] + digCost;
          if (cand < best) best = cand;
        }
      }

      dp[rowOffset + j] = best;
    }
  }

  return Number(dp[n * cols + m].toFixed(3));
}

function matchCasing(template: string, replacement: string): string {
  if (template.length > 1 && template === template.toUpperCase()) {
    return replacement.toUpperCase();
  }
  if (/^[A-Z]/.test(template)) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

const DIRECT_OCR_OVERRIDES: Record<string, { word: string; reason: string }> = {
  thc: { word: "the", reason: "Common OCR c/e glyph confusion" },
  tbe: { word: "the", reason: "Common OCR b/h glyph confusion" },
  tlie: { word: "the", reason: "Common OCR l+i/h glyph confusion" },
  wltb: { word: "with", reason: "Common OCR i/l + h/b confusion" },
  witb: { word: "with", reason: "Common OCR b/h glyph confusion" },
  frorn: { word: "from", reason: "Common OCR rn/m digraph confusion" },
  rnethod: { word: "method", reason: "Common OCR rn/m digraph confusion" },
  rnethods: { word: "methods", reason: "Common OCR rn/m digraph confusion" },
  rnath: { word: "math", reason: "Common OCR rn/m digraph confusion" },
  rnatrix: { word: "matrix", reason: "Common OCR rn/m digraph confusion" },
  theorern: { word: "theorem", reason: "Common OCR rn/m digraph confusion" },
  lernma: { word: "lemma", reason: "Common OCR rn/m digraph confusion" },
  algorithrn: {
    word: "algorithm",
    reason: "Common OCR rn/m digraph confusion",
  },
  systern: { word: "system", reason: "Common OCR rn/m digraph confusion" },
  problern: { word: "problem", reason: "Common OCR rn/m digraph confusion" },
  equatlon: { word: "equation", reason: "Common OCR l/i glyph confusion" },
  convergencc: {
    word: "convergence",
    reason: "Common OCR c/e glyph confusion",
  },
  pr00f: { word: "proof", reason: "OCR digit-zero confusion (0->o)" },
  alg0rithm: { word: "algorithm", reason: "OCR digit-zero confusion (0->o)" },
  th3orem: { word: "theorem", reason: "OCR digit-three confusion (3->e)" },
};

function viterbiSegmentCompound(
  token: string,
  vocab: Map<string, number>,
  allowSingleLetterWords: boolean,
): { words: string[]; avgScore: number } | null {
  const lower = token.toLowerCase();
  if (!/^[a-z]{8,42}$/.test(lower) || vocab.has(lower)) return null;

  const n = lower.length;
  const bestScore = new Array<number>(n + 1).fill(-Infinity);
  const prevIdx = new Array<number>(n + 1).fill(-1);
  bestScore[0] = 0;

  for (let end = 1; end <= n; end += 1) {
    for (let start = Math.max(0, end - 18); start < end; start += 1) {
      if (!Number.isFinite(bestScore[start])) continue;
      const piece = lower.slice(start, end);
      const isSingle = piece.length === 1;
      if (
        isSingle &&
        (!allowSingleLetterWords || (piece !== "a" && piece !== "i"))
      ) {
        continue;
      }
      const prior = vocab.get(piece);
      if (prior === undefined) continue;
      // Favor fewer longer words with strong prior
      const score = bestScore[start] + prior + 0.15 * Math.min(piece.length, 6);
      if (score > bestScore[end]) {
        bestScore[end] = score;
        prevIdx[end] = start;
      }
    }
  }

  if (!Number.isFinite(bestScore[n]) || prevIdx[n] === -1) return null;

  const pieces: string[] = [];
  let cursor = n;
  while (cursor > 0) {
    const start = prevIdx[cursor];
    if (start < 0) return null;
    pieces.push(lower.slice(start, cursor));
    cursor = start;
  }
  pieces.reverse();
  if (pieces.length < 2) return null;

  const avgScore = bestScore[n] / pieces.length;
  if (avgScore < -5.8) return null;

  return {
    words: pieces.map((w, idx) =>
      idx === 0 && /^[A-Z]/.test(token)
        ? w.charAt(0).toUpperCase() + w.slice(1)
        : w,
    ),
    avgScore,
  };
}

function buildAdaptiveDocumentVocab(text: string): Map<string, number> {
  const base = getBaseVocabulary();
  const merged = new Map(base.wordLogPrior);
  const docCounts = new Map<string, number>();

  for (const match of text.matchAll(/\b[A-Za-z]{4,24}\b/g)) {
    const word = match[0].toLowerCase();
    docCounts.set(word, (docCounts.get(word) ?? 0) + 1);
  }

  for (const [word, count] of docCounts.entries()) {
    if (
      count >= 2 &&
      !merged.has(word) &&
      !DIRECT_OCR_OVERRIDES[word] &&
      !/(?:rn[aeiou]|^[a-z]*[0-9])/.test(word)
    ) {
      merged.set(word, -4.6);
    }
  }

  return merged;
}

export function denoiseTextNoisyChannel(
  text: string,
  aggressiveness: ReconstructionAggressiveness = "balanced",
): { cleaned: string; repairs: TokenRepair[] } {
  const repairs: TokenRepair[] = [];
  const baseVocab = getBaseVocabulary();
  const vocab = buildAdaptiveDocumentVocab(text);

  // First heal spaced-out single letters like "T h e o r e m" or "A b s t r a c t"
  let working = text.replace(
    /\b([A-Za-z])\s+([A-Za-z])\s+([A-Za-z])(?:\s+([A-Za-z])){1,12}\b/g,
    (full) => {
      const collapsed = full.replace(/\s+/g, "");
      if (vocab.has(collapsed.toLowerCase()) && collapsed.length >= 4) {
        repairs.push({
          original: full,
          repaired: collapsed,
          kind: "word-merge",
          confidence: 0.92,
          reason: "Rejoined spaced-out OCR glyphs into vocabulary word",
        });
        return collapsed;
      }
      return full;
    },
  );

  // Heal missing-backslash structural LaTeX commands on line starts
  working = working.replace(
    /(^|\n)[ \t]*(begin|end)\{(document|abstract|theorem|lemma|proof|equation|align|itemize|enumerate|table|tabular|figure)\}/g,
    (_full, prefix: string, cmd: string, env: string) => {
      const fixed = `${prefix}\\${cmd}{${env}}`;
      repairs.push({
        original: `${cmd}{${env}}`,
        repaired: `\\${cmd}{${env}}`,
        kind: "latex-cmd",
        confidence: 0.96,
        reason: "Restored missing backslash on LaTeX environment command",
      });
      return fixed;
    },
  );

  const lambda =
    aggressiveness === "aggressive"
      ? 3.8
      : aggressiveness === "balanced"
        ? 4.6
        : 5.8;
  const maxEditDist =
    aggressiveness === "aggressive"
      ? 1.5
      : aggressiveness === "balanced"
        ? 1.15
        : 0.75;

  // Mask protected spans (\cite{...}, \ref{...}, \label{...}, URLs)
  const protectedPlaceholders: string[] = [];
  const masked = working.replace(
    /(?:\\(?:cite|ref|eqref|label|url|href|includegraphics)\*?\{[^}]*\}|https?:\/\/\S+|10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/g,
    (match) => {
      const idx = protectedPlaceholders.length;
      protectedPlaceholders.push(match);
      return `__ARCANAPROT_${idx}__`;
    },
  );

  const cmdCache = new Map<
    string,
    { repaired: string; confidence: number; reason: string } | null
  >();

  // Repair corrupted LaTeX commands (\sectoin -> \section, etc.)
  let cmdRepaired = masked.replace(
    /\\([a-zA-Z]{3,20})/g,
    (full, cmdName: string) => {
      const lowerCmd = cmdName.toLowerCase();
      if (baseVocab.latexCommands.has(lowerCmd)) return full;
      if (
        lowerCmd === "textbf" ||
        lowerCmd === "mathbb" ||
        lowerCmd === "mathcal"
      ) {
        return full;
      }

      if (cmdCache.has(lowerCmd)) {
        const cached = cmdCache.get(lowerCmd);
        if (!cached) return full;
        repairs.push({
          original: full,
          repaired: cached.repaired,
          kind: "latex-cmd",
          confidence: cached.confidence,
          reason: cached.reason,
        });
        return cached.repaired;
      }

      let bestCmd: string | null = null;
      let bestDist = Infinity;
      for (const candidate of baseVocab.latexCommands) {
        if (Math.abs(candidate.length - lowerCmd.length) > 2) continue;
        const d = confusionEditDistance(lowerCmd, candidate);
        if (d < bestDist) {
          bestDist = d;
          bestCmd = candidate;
        }
      }

      if (bestCmd && bestDist <= 0.95) {
        const repaired = `\\${bestCmd}`;
        const confidence = Number(
          Math.max(0.75, 0.98 - bestDist * 0.2).toFixed(2),
        );
        const reason = `Bayesian command channel distance ${bestDist.toFixed(2)}`;
        cmdCache.set(lowerCmd, { repaired, confidence, reason });
        repairs.push({
          original: full,
          repaired,
          kind: "latex-cmd",
          confidence,
          reason,
        });
        return repaired;
      }
      cmdCache.set(lowerCmd, null);
      return full;
    },
  );

  interface CachedTokenRepair {
    candidate: string;
    kind: TokenRepair["kind"];
    confidence: number;
    reason: string;
    preserveCase: boolean;
  }
  const tokenCache = new Map<string, CachedTokenRepair | null>();
  const lowerCounts = new Int16Array(128);
  const candStamp = new Int32Array(128);
  const candSeen = new Int16Array(128);
  let stamp = 0;

  // Token-level noisy-channel decoding + compound word splitting
  const lines = cmdRepaired.split("\n");
  const denoisedLines = lines.map((line) =>
    line.replace(
      /(^|[\s([{"'`])([A-Za-z][A-Za-z0-9]{1,36}|[01][A-Za-z]{2,30})(?=$|[\s.,;:!?)\]}"'])/g,
      (
        full,
        prefix: string,
        rawTok: string,
        offset: number,
        fullLine: string,
      ) => {
        // Leave tokens preceded immediately by backslash (already handled as commands)
        const beforeChar =
          offset > 0 ? fullLine[offset + prefix.length - 1] : "";
        if (beforeChar === "\\" || rawTok.startsWith("__ARCANAPROT")) {
          return full;
        }
        // Protect pure roman numerals like I, II, IV, X and acronyms like IEEE, AI, ML
        if (/^[A-Z]{2,8}$/.test(rawTok)) return full;
        const lower = rawTok.toLowerCase();
        if (vocab.has(lower)) return full;

        // Protect alphanumeric math labels like x1, n0, H1, L2, p0
        if (/^[A-Za-z]\d{1,2}$/.test(rawTok)) return full;

        // Check direct high-precision OCR table first
        const direct = DIRECT_OCR_OVERRIDES[lower];
        if (direct) {
          const out = matchCasing(rawTok, direct.word);
          repairs.push({
            original: rawTok,
            repaired: out,
            kind: "ocr-channel",
            confidence: 0.95,
            reason: direct.reason,
          });
          return `${prefix}${out}`;
        }

        // Handle short/digit-mixed OCR words like "1n", "t0", "0f"
        const hasDigitInWord =
          /[a-zA-Z]/.test(rawTok) &&
          /[013458]/.test(rawTok) &&
          !/^\d+(?:st|nd|rd|th)$/i.test(rawTok);

        if (aggressiveness === "conservative" && !hasDigitInWord) {
          return full;
        }

        const cacheKey =
          rawTok.length >= 8 &&
          aggressiveness !== "conservative" &&
          /^[A-Za-z]+$/.test(rawTok)
            ? `S:${rawTok}`
            : `L:${lower}:${hasDigitInWord ? 1 : 0}`;
        if (tokenCache.has(cacheKey)) {
          const cached = tokenCache.get(cacheKey);
          if (!cached) return full;
          const out = cached.preserveCase
            ? matchCasing(rawTok, cached.candidate)
            : cached.candidate;
          repairs.push({
            original: rawTok,
            repaired: out,
            kind: cached.kind,
            confidence: cached.confidence,
            reason: cached.reason,
          });
          return `${prefix}${out}`;
        }

        // Check compound word splitting first for long unspaced words
        if (
          rawTok.length >= 8 &&
          aggressiveness !== "conservative" &&
          /^[A-Za-z]+$/.test(rawTok)
        ) {
          const split = viterbiSegmentCompound(
            rawTok,
            vocab,
            aggressiveness === "aggressive",
          );
          if (split) {
            const joined = split.words.join(" ");
            const reason = "Viterbi unigram word boundary segmentation";
            tokenCache.set(cacheKey, {
              candidate: joined,
              kind: "word-split",
              confidence: 0.87,
              reason,
              preserveCase: false,
            });
            repairs.push({
              original: rawTok,
              repaired: joined,
              kind: "word-split",
              confidence: 0.87,
              reason,
            });
            return `${prefix}${joined}`;
          }
        }

        // Bayesian candidate search in lexicon
        let bestCandidate: string | null = null;
        let bestPosterior = -Infinity;
        let bestDist = Infinity;
        const allowedDist = hasDigitInWord
          ? Math.max(maxEditDist, 1.35)
          : maxEditDist;
        const maxAllowedMismatch = Math.floor((allowedDist + 1e-9) / 0.12);

        lowerCounts.fill(0);
        for (let i = 0; i < lower.length; i += 1) {
          const code = lower.charCodeAt(i);
          if (code < 128) lowerCounts[code] += 1;
        }

        for (
          let len = Math.max(2, lower.length - 1);
          len <= lower.length + 1;
          len += 1
        ) {
          const bucket = baseVocab.wordsByLength.get(len);
          if (!bucket) continue;
          for (const candidate of bucket) {
            const candLen = candidate.length;
            if (Math.abs(candLen - lower.length) > 1) continue;

            // Lossless character-multiset intersection lower bound (>= 0.12 per mismatch)
            const maxLen = candLen > lower.length ? candLen : lower.length;
            if (maxLen > maxAllowedMismatch) {
              stamp += 1;
              if (stamp >= 0x7fffffff) {
                candStamp.fill(0);
                stamp = 1;
              }
              let common = 0;
              for (let j = 0; j < candLen; j += 1) {
                const code = candidate.charCodeAt(j);
                if (code >= 128) continue;
                if (candStamp[code] !== stamp) {
                  candStamp[code] = stamp;
                  candSeen[code] = 0;
                }
                if (candSeen[code] < lowerCounts[code]) {
                  candSeen[code] += 1;
                  common += 1;
                }
              }
              if (maxLen - common > maxAllowedMismatch) continue;
            }

            const dist = confusionEditDistance(lower, candidate);
            if (dist > allowedDist) {
              continue;
            }
            const logPrior = vocab.get(candidate) ?? -6.0;
            const score = logPrior - lambda * dist;
            if (score > bestPosterior) {
              bestPosterior = score;
              bestCandidate = candidate;
              bestDist = dist;
            }
          }
        }

        if (bestCandidate && bestDist > 0) {
          // Require visual confusion support unless digit-in-word or very close
          const minRequiredDist = hasDigitInWord
            ? 1.35
            : aggressiveness === "aggressive"
              ? 0.95
              : 0.65;
          if (bestDist <= minRequiredDist) {
            const out = matchCasing(rawTok, bestCandidate);
            const conf = Number(
              Math.max(0.62, Math.min(0.98, 0.98 - bestDist * 0.28)).toFixed(2),
            );
            const reason = `Bayesian noisy-channel score (d=${bestDist.toFixed(2)})`;
            tokenCache.set(cacheKey, {
              candidate: bestCandidate,
              kind: "ocr-channel",
              confidence: conf,
              reason,
              preserveCase: true,
            });
            repairs.push({
              original: rawTok,
              repaired: out,
              kind: "ocr-channel",
              confidence: conf,
              reason,
            });
            return `${prefix}${out}`;
          }
        }

        tokenCache.set(cacheKey, null);
        return full;
      },
    ),
  );

  cmdRepaired = denoisedLines
    .join("\n")
    .replace(
      /__ARCANAPROT_(\d+)__/g,
      (_full, idx: string) => protectedPlaceholders[Number(idx)] ?? "",
    );

  return { cleaned: cmdRepaired, repairs };
}

// ---------------------------------------------------------------------------
// Stage 3: Linear-Chain CRF / Viterbi Structural Sequence Decoding
// ---------------------------------------------------------------------------

const ALL_BLOCK_LABELS: BlockLabel[] = [
  "title",
  "author",
  "abstract",
  "heading",
  "subheading",
  "theorem_env",
  "proof_env",
  "equation",
  "list_item",
  "table_block",
  "reference",
  "prose",
];

function isSubsectionPattern(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^##\s+\S/.test(trimmed) ||
    /^\d+\.\d+(?:\.\d+)?[.)]?\s+[A-Z]/.test(trimmed) ||
    /^\\sub(?:sub)?section\*?\{/.test(trimmed)
  );
}

export function segmentIntoBlocks(text: string): string[] {
  const lines = text.split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }

    // Group contiguous pipe/tab/multi-space table rows into one table_block
    if (isLikelyTableLine(line)) {
      const tableLines: string[] = [line];
      i += 1;
      while (i < lines.length && isLikelyTableLine(lines[i].trim())) {
        tableLines.push(lines[i].trim());
        i += 1;
      }
      blocks.push(tableLines.join("\n"));
      continue;
    }

    // Keep individual list items separate so labeler marks consecutive list_item blocks
    if (isLikelyListLine(line)) {
      blocks.push(line);
      i += 1;
      continue;
    }

    // Keep reference entries and author/affiliation lines isolated
    if (/^\[\d{1,3}\]\s+\S/.test(line) || isLikelyAuthorLine(line)) {
      blocks.push(line);
      i += 1;
      continue;
    }

    // Single-line heading, equation, theorem/proof header stays isolated
    if (isLikelyHeadingLine(line) || isLikelyEquationLine(line)) {
      // If a Theorem/Proof header sits directly followed by contiguous prose lines, combine paragraph
      if (
        /^(?:Theorem|Lemma|Proposition|Corollary|Definition|Remark|Proof)\b/i.test(
          line,
        ) &&
        !/[.?!]$/.test(line)
      ) {
        const para: string[] = [line];
        i += 1;
        while (
          i < lines.length &&
          lines[i].trim() !== "" &&
          !isLikelyAuthorLine(lines[i].trim()) &&
          !isLikelyHeadingLine(lines[i].trim()) &&
          !isLikelyListLine(lines[i].trim()) &&
          !isLikelyTableLine(lines[i].trim()) &&
          !isLikelyEquationLine(lines[i].trim())
        ) {
          para.push(lines[i].trim());
          i += 1;
        }
        blocks.push(para.join(" "));
        continue;
      }
      blocks.push(line);
      i += 1;
      continue;
    }

    // Standard multi-line paragraph until blank line or structural break
    const para: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (
        !next ||
        isLikelyAuthorLine(next) ||
        isLikelyHeadingLine(next) ||
        isLikelyListLine(next) ||
        isLikelyTableLine(next) ||
        isLikelyEquationLine(next) ||
        /^\[\d{1,3}\]\s+\S/.test(next)
      ) {
        break;
      }
      para.push(next);
      i += 1;
    }
    blocks.push(para.join(" "));
  }

  return blocks;
}

export function extractBlockFeatures(
  block: string,
  index: number,
  totalBlocks: number,
): Record<string, number> {
  const trimmed = block.trim();
  const lines = trimmed.split("\n");
  const words = trimmed.split(/\s+/).filter(Boolean);
  const firstLine = lines[0]?.trim() ?? trimmed;

  const titleCaseWords = words.filter((w) =>
    /^[A-Z][a-zA-Z0-9-]*$/.test(w.replace(/[.,:;!?]/g, "")),
  ).length;
  const titleCaseRatio =
    words.length > 0 ? titleCaseWords / Math.min(words.length, 16) : 0;

  const hasLeadingNumber =
    /^(?:\d+[.)]?\s+[A-Z]|#+\s+|\\section\*?\{)/.test(firstLine) &&
    !/^\d+\.\d+/.test(firstLine)
      ? 1
      : 0;
  const hasSubNumber = isSubsectionPattern(firstLine) ? 1 : 0;
  const hasAbstractCue = /^(?:abstract|summary)\s*[:.-]?/i.test(trimmed)
    ? 1
    : 0;
  const hasTheoremCue =
    /^(?:theorem|lemma|proposition|corollary|definition|remark)\b/i.test(
      trimmed,
    )
      ? 1
      : 0;
  const hasProofCue = /^(?:proof|sketch of proof)\b/i.test(trimmed) ? 1 : 0;

  const mathHits = (
    trimmed.match(
      /[=<>≤≥≠≈∈∑∏∫∂∇^_√→]|\\(?:frac|sum|int|alpha|beta|gamma|lambda|mathbb)/g,
    ) ?? []
  ).length;
  const mathDensity = Math.min(1, mathHits / Math.max(words.length, 1));
  const isDisplayEquationCue =
    lines.length === 1 && isLikelyEquationLine(trimmed) ? 1 : 0;
  const hasListMarker = lines.length === 1 && isLikelyListLine(trimmed) ? 1 : 0;

  let tableRegularity = 0;
  if (lines.length >= 2 && lines.every((l) => isLikelyTableLine(l))) {
    tableRegularity = 1;
  } else if (lines.length === 1 && (trimmed.match(/\|/g)?.length ?? 0) >= 2) {
    tableRegularity = 0.8;
  }

  const hasReferenceCue =
    /^\[\d{1,3}\]\s+/.test(trimmed) ||
    (/(?:et al\.|Proceedings of|IEEE|Springer|Elsevier|arXiv:|doi:|\(\d{4}\))/.test(
      trimmed,
    ) &&
      trimmed.length < 380 &&
      /(?:19|20)\d{2}/.test(trimmed))
      ? 1
      : 0;

  const hasAuthorCue =
    /(?:university|institute|department|laboratory|faculty|@|\b[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+\s*,)/.test(
      trimmed,
    ) &&
    trimmed.length < 220 &&
    words.length <= 28
      ? 1
      : 0;

  const hasNamedSectionWord =
    /^(?:Introduction|Background|Related Work|Preliminaries|Methodology|Methods|Approach|Experiments|Evaluation|Results|Discussion|Conclusion|Conclusions|References|Bibliography|Appendix)\b/i.test(
      trimmed.replace(/^(?:\d+\.?\s*|#+\s*)/, ""),
    ) && words.length <= 8
      ? 1
      : 0;

  const endsWithTerminalPunct = /[.?!]$/.test(trimmed) ? 1 : 0;
  const isAllCapsShort =
    words.length <= 10 &&
    trimmed.length >= 4 &&
    trimmed === trimmed.toUpperCase() &&
    /[A-Z]/.test(trimmed)
      ? 1
      : 0;

  return {
    relPos: totalBlocks > 1 ? index / (totalBlocks - 1) : 0,
    isFirst: index === 0 ? 1 : 0,
    isEarly: index <= 2 ? 1 : 0,
    wordCountNorm: Math.min(1, words.length / 40),
    isShortLine: words.length <= 16 && lines.length === 1 ? 1 : 0,
    titleCaseRatio: Number(titleCaseRatio.toFixed(3)),
    hasLeadingNumber,
    hasSubNumber,
    hasNamedSectionWord,
    hasAbstractCue,
    hasTheoremCue,
    hasProofCue,
    mathDensity: Number(mathDensity.toFixed(3)),
    isDisplayEquationCue,
    hasListMarker,
    tableRegularity,
    hasReferenceCue,
    hasAuthorCue,
    endsWithTerminalPunct,
    isAllCapsShort,
  };
}

function scoreEmissions(f: Record<string, number>): Record<BlockLabel, number> {
  const isLongProse = f.wordCountNorm > 0.4 && f.endsWithTerminalPunct > 0;
  return {
    title:
      (f.isFirst ? 3.2 : f.isEarly ? 0.4 : -3.5) +
      f.isShortLine * 2.1 +
      f.titleCaseRatio * 2.4 +
      f.isAllCapsShort * 1.4 -
      f.endsWithTerminalPunct * 1.6 -
      f.hasAbstractCue * 5.0 -
      f.hasLeadingNumber * 3.0 -
      f.hasSubNumber * 3.0 -
      f.hasTheoremCue * 4.5 -
      f.hasProofCue * 4.5 -
      f.isDisplayEquationCue * 5.0 -
      f.hasListMarker * 5.0 -
      f.tableRegularity * 5.0 -
      f.hasReferenceCue * 5.0 -
      f.hasNamedSectionWord * 4.0 -
      (f.wordCountNorm > 0.5 ? 3.5 : 0),
    author:
      (f.isEarly ? 1.8 : -2.6) +
      f.hasAuthorCue * 4.5 +
      f.isShortLine * 1.1 -
      f.endsWithTerminalPunct * 1.2 -
      f.hasAbstractCue * 4.5 -
      f.hasNamedSectionWord * 4.0 -
      f.hasTheoremCue * 4.0 -
      f.hasListMarker * 4.0,
    abstract:
      f.hasAbstractCue * 8.5 +
      (f.isEarly ? 0.6 : -2.0) -
      f.hasTheoremCue * 4.0 -
      f.isDisplayEquationCue * 4.0,
    heading:
      -1.2 +
      f.hasLeadingNumber * 4.8 +
      f.hasNamedSectionWord * 5.4 +
      f.isShortLine * 2.0 +
      f.titleCaseRatio * 1.2 -
      f.hasSubNumber * 4.0 -
      f.endsWithTerminalPunct * 2.0 -
      f.hasTheoremCue * 5.0 -
      f.hasProofCue * 5.0 -
      f.isDisplayEquationCue * 5.0 -
      f.hasListMarker * 5.0 -
      f.tableRegularity * 5.0 -
      (f.wordCountNorm > 0.3 ? 3.5 : 0),
    subheading:
      -2.0 +
      f.hasSubNumber * 7.2 +
      f.isShortLine * 1.4 -
      f.endsWithTerminalPunct * 1.5 -
      f.hasListMarker * 4.0,
    theorem_env:
      -2.2 +
      f.hasTheoremCue * 8.6 -
      f.hasProofCue * 4.0 -
      f.hasListMarker * 3.0,
    proof_env:
      -2.2 +
      f.hasProofCue * 8.6 -
      f.hasTheoremCue * 4.0 -
      f.hasListMarker * 3.0,
    equation:
      -1.8 +
      f.isDisplayEquationCue * 7.2 +
      f.mathDensity * 3.2 -
      f.hasTheoremCue * 3.0 -
      f.hasProofCue * 3.0 -
      f.hasListMarker * 4.0 -
      f.tableRegularity * 4.0 -
      (isLongProse ? 4.5 : 0),
    list_item: -2.0 + f.hasListMarker * 8.5 - f.tableRegularity * 3.5,
    table_block: -2.2 + f.tableRegularity * 8.8 - f.hasListMarker * 3.0,
    reference:
      -1.8 +
      f.hasReferenceCue * 7.2 +
      (f.relPos > 0.5 ? 1.2 : -1.0) -
      f.hasTheoremCue * 4.0 -
      f.hasProofCue * 4.0,
    prose:
      1.6 +
      f.endsWithTerminalPunct * 1.8 +
      f.wordCountNorm * 2.4 -
      f.hasAbstractCue * 3.5 -
      f.hasTheoremCue * 4.5 -
      f.hasProofCue * 4.5 -
      f.hasSubNumber * 4.0 -
      f.hasNamedSectionWord * 4.0 -
      f.hasLeadingNumber * 3.0 -
      f.isDisplayEquationCue * 4.5 -
      f.hasListMarker * 5.0 -
      f.tableRegularity * 5.5 -
      (f.hasReferenceCue && f.relPos > 0.4 ? 3.5 : 0),
  };
}

function transitionScore(prev: BlockLabel, next: BlockLabel): number {
  if (prev === "title" && next === "author") return 2.4;
  if (prev === "title" && next === "abstract") return 1.8;
  if (prev === "title" && next === "heading") return 1.1;
  if (prev === "title" && next === "title") return -3.0;
  if (prev === "author" && next === "abstract") return 2.2;
  if (prev === "author" && next === "heading") return 1.4;
  if (prev === "abstract" && next === "heading") return 2.0;
  if (prev === "heading" && next === "prose") return 1.4;
  if (prev === "heading" && next === "subheading") return 1.4;
  if (prev === "heading" && next === "theorem_env") return 1.2;
  if (prev === "theorem_env" && next === "proof_env") return 2.6;
  if (prev === "proof_env" && next === "prose") return 1.0;
  if (prev === "list_item" && next === "list_item") return 1.8;
  if (prev === "reference" && next === "reference") return 2.6;
  if (prev === "table_block" && next === "table_block") return 1.4;
  if (prev === "prose" && next === "equation") return 1.1;
  if (prev === "equation" && next === "prose") return 1.2;
  if (prev === "reference" && next === "title") return -4.0;
  if (next === "title") return -2.5;
  if (prev === "prose" && next === "abstract") return -2.2;
  return 0;
}

function softmaxScores(scores: number[]): number[] {
  const maxVal = Math.max(...scores);
  const exps = scores.map((s) =>
    Math.exp(Math.max(-20, Math.min(20, s - maxVal))),
  );
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

export function classifyBlocksViterbi(
  rawBlocks: string[],
  labelOverrides?: Partial<Record<number, BlockLabel>>,
): ClassifiedBlock[] {
  if (rawBlocks.length === 0) return [];
  const total = rawBlocks.length;
  const K = ALL_BLOCK_LABELS.length;
  const featuresList = rawBlocks.map((b, i) =>
    extractBlockFeatures(b, i, total),
  );

  const dp: number[][] = Array.from({ length: total }, () =>
    new Array<number>(K).fill(-Infinity),
  );
  const backptr: number[][] = Array.from({ length: total }, () =>
    new Array<number>(K).fill(-1),
  );

  const emissionsList = featuresList.map((feat, idx) => {
    const rawScores = scoreEmissions(feat);
    const forced = labelOverrides?.[idx];
    if (forced) {
      for (const lbl of ALL_BLOCK_LABELS) {
        rawScores[lbl] = lbl === forced ? 30 : -30;
      }
    }
    return rawScores;
  });

  // Init
  for (let s = 0; s < K; s += 1) {
    const lbl = ALL_BLOCK_LABELS[s];
    const startBias =
      lbl === "title"
        ? 0.8
        : lbl === "proof_env"
          ? -1.2
          : lbl === "reference"
            ? -1.5
            : 0;
    dp[0][s] = emissionsList[0][lbl] + startBias;
  }

  // Viterbi recurrence
  for (let t = 1; t < total; t += 1) {
    for (let cur = 0; cur < K; cur += 1) {
      const curLbl = ALL_BLOCK_LABELS[cur];
      const emit = emissionsList[t][curLbl];
      let bestScore = -Infinity;
      let bestPrev = 0;
      for (let prev = 0; prev < K; prev += 1) {
        const cand =
          dp[t - 1][prev] +
          transitionScore(ALL_BLOCK_LABELS[prev], curLbl) +
          emit;
        if (cand > bestScore) {
          bestScore = cand;
          bestPrev = prev;
        }
      }
      dp[t][cur] = bestScore;
      backptr[t][cur] = bestPrev;
    }
  }

  // Backtrack best state sequence
  const decodedIndices = new Array<number>(total).fill(K - 1);
  let bestLast = 0;
  for (let s = 1; s < K; s += 1) {
    if (dp[total - 1][s] > dp[total - 1][bestLast]) {
      bestLast = s;
    }
  }
  decodedIndices[total - 1] = bestLast;
  for (let t = total - 2; t >= 0; t -= 1) {
    decodedIndices[t] = backptr[t + 1][decodedIndices[t + 1]];
  }

  return rawBlocks.map((raw, idx) => {
    const chosenIdx = decodedIndices[idx];
    const chosenLbl = ALL_BLOCK_LABELS[chosenIdx];
    const prevLbl = idx > 0 ? ALL_BLOCK_LABELS[decodedIndices[idx - 1]] : null;

    const contextualScores = ALL_BLOCK_LABELS.map((lbl) => {
      const emit = emissionsList[idx][lbl];
      const trans = prevLbl ? transitionScore(prevLbl, lbl) : 0;
      return emit + trans;
    });
    const probs = softmaxScores(contextualScores);

    const ranked = ALL_BLOCK_LABELS.map((lbl, sIdx) => ({
      lbl,
      prob: probs[sIdx],
    })).sort((a, b) => b.prob - a.prob);

    const chosenProb = probs[chosenIdx] ?? ranked[0].prob;
    const runner = ranked.find((r) => r.lbl !== chosenLbl) ?? ranked[1];
    const confidence = labelOverrides?.[idx]
      ? 1.0
      : Number(chosenProb.toFixed(3));

    return {
      index: idx,
      rawText: raw,
      cleanedText: raw,
      label: chosenLbl,
      confidence,
      runnerUpLabel: runner.lbl,
      runnerUpConfidence: Number(runner.prob.toFixed(3)),
      features: featuresList[idx],
      lowConfidence: confidence < 0.65,
    };
  });
}

// ---------------------------------------------------------------------------
// Stage 4: Symbolic-Statistical LaTeX Synthesis & Escaping
// ---------------------------------------------------------------------------

const UNICODE_TO_LATEX_MATH: Array<[RegExp, string]> = [
  [/α/g, "\\alpha "],
  [/β/g, "\\beta "],
  [/γ/g, "\\gamma "],
  [/δ/g, "\\delta "],
  [/ε/g, "\\varepsilon "],
  [/ζ/g, "\\zeta "],
  [/η/g, "\\eta "],
  [/θ/g, "\\theta "],
  [/ι/g, "\\iota "],
  [/κ/g, "\\kappa "],
  [/λ/g, "\\lambda "],
  [/μ/g, "\\mu "],
  [/ν/g, "\\nu "],
  [/ξ/g, "\\xi "],
  [/π/g, "\\pi "],
  [/ρ/g, "\\rho "],
  [/σ/g, "\\sigma "],
  [/τ/g, "\\tau "],
  [/φ/g, "\\phi "],
  [/χ/g, "\\chi "],
  [/ψ/g, "\\psi "],
  [/ω/g, "\\omega "],
  [/Γ/g, "\\Gamma "],
  [/Δ/g, "\\Delta "],
  [/Θ/g, "\\Theta "],
  [/Λ/g, "\\Lambda "],
  [/Π/g, "\\Pi "],
  [/Σ/g, "\\Sigma "],
  [/Φ/g, "\\Phi "],
  [/Ψ/g, "\\Psi "],
  [/Ω/g, "\\Omega "],
  [/∑/g, "\\sum "],
  [/∏/g, "\\prod "],
  [/∫/g, "\\int "],
  [/∂/g, "\\partial "],
  [/∇/g, "\\nabla "],
  [/∞/g, "\\infty "],
  [/≤/g, "\\le "],
  [/≥/g, "\\ge "],
  [/≠/g, "\\neq "],
  [/≈/g, "\\approx "],
  [/≡/g, "\\equiv "],
  [/±/g, "\\pm "],
  [/×/g, "\\times "],
  [/÷/g, "\\div "],
  [/∈/g, "\\in "],
  [/∉/g, "\\notin "],
  [/⊂/g, "\\subset "],
  [/⊆/g, "\\subseteq "],
  [/∀/g, "\\forall "],
  [/∃/g, "\\exists "],
  [/→/g, "\\to "],
  [/↦/g, "\\mapsto "],
  [/↔/g, "\\leftrightarrow "],
  [/∥/g, "\\|"],
];

function convertAsciiMathOperators(expr: string): string {
  let out = expr
    .replace(/<=/g, " \\le ")
    .replace(/>=/g, " \\ge ")
    .replace(/!=/g, " \\neq ")
    .replace(/->/g, " \\to ")
    .replace(/\+\/-/g, " \\pm ");
  for (const [pattern, replacement] of UNICODE_TO_LATEX_MATH) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s+/g, " ").trim();
}

function escapeProseCharsOnly(segment: string): string {
  // Mask intact math spans and LaTeX commands using an underscore-free sentinel
  const kept: string[] = [];
  const masked = segment.replace(
    /(?:\$\$[\s\S]+?\$\$|\$[^$]+\$|\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?(?:\{[^}]*\})*)/g,
    (m) => {
      const idx = kept.length;
      kept.push(m);
      return `ARCANAKEEP${idx}END`;
    },
  );

  const escaped = masked
    .replace(/(?<!\\)%/g, "\\%")
    .replace(/(?<!\\)&/g, "\\&")
    .replace(/(?<!\\)#/g, "\\#")
    .replace(/(?<!\\)_/g, "\\_");

  return escaped.replace(
    /ARCANAKEEP(\d+)END/g,
    (_full, idx: string) => kept[Number(idx)] ?? "",
  );
}

function formatProseWithMathAndCitations(
  text: string,
  hasBib: boolean,
): string {
  const kept: string[] = [];
  const pushKept = (val: string) => {
    const idx = kept.length;
    kept.push(val);
    return `ARCANAKEEP${idx}END`;
  };

  // Mask existing math spans & LaTeX commands first
  let working = text.replace(
    /(?:\$\$[\s\S]+?\$\$|\$[^$]+\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\\(?:section|subsection|cite|ref|eqref|label|textbf|textit|emph|url|href|begin|end)\*?\{[^}]*\})/g,
    (m) => pushKept(m),
  );

  const maskNewMath = (s: string) =>
    s.replace(/\$[^$]+\$/g, (m) => pushKept(m));

  // 1. Relational / arrow math spans (e.g. "α ≤ 0.25", "x_i -> 0", "E_k <= C rho^k")
  const rhsTerm =
    "(?:[A-Za-z0-9α-ωΑ-Ω]+(?:_[A-Za-z0-9{}]+|\\^\\{?[A-Za-z0-9+-]+\\}?)|[A-Za-zα-ωΑ-Ω](?![A-Za-z])|\\d+(?:\\.\\d+)?)";
  const relPattern = new RegExp(
    `([A-Za-z0-9α-ωΑ-Ω_^{}()]+\\s*(?:<=|>=|!=|->|<->|≤|≥|≠|≈|∈)\\s*${rhsTerm}(?:\\s+${rhsTerm}){0,3})`,
    "g",
  );
  working = working.replace(relPattern, (match) => {
    if (match.includes("ARCANAKEEP")) return match;
    return `$${convertAsciiMathOperators(match)}$`;
  });
  working = maskNewMath(working);

  // 2. Complexity notation like O(h^2), O(n log n) before inner superscript matching
  working = working.replace(/\bO\(([A-Za-z0-9\s^+-]{1,18})\)/g, "$$O($1)$$");
  working = maskNewMath(working);

  // 3. Remaining standalone Unicode math symbols
  working = working.replace(
    /([A-Za-z0-9]*[αβγδεζηθικλμνξρστφχψωΓΔΘΛΞΠΣΦΨΩ∑∏∫∂∇∞≤≥≠≈≡±×∈∀∃→√]+[A-Za-z0-9^_()*+-]*)/g,
    (match) => {
      if (match.includes("ARCANAKEEP")) return match;
      return `$${convertAsciiMathOperators(match)}$`;
    },
  );
  working = maskNewMath(working);

  // 4. Remaining inline subscript/superscript tokens like x_i, u_h, R^n, H^1
  working = working.replace(
    /\b([A-Za-z](?:_[A-Za-z0-9]+|\^\{?[A-Za-z0-9+-]+\}?))\b/g,
    "$$$1$$",
  );
  working = maskNewMath(working);

  // 5. Simple numeric citations [1] or [1, 2] when references are present
  if (hasBib) {
    working = working.replace(
      /\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]/g,
      (full, nums: string) => {
        const keys = nums
          .split(/\s*,\s*/)
          .filter(Boolean)
          .map((n) => `ref${n}`);
        return keys.length > 0 ? pushKept(`~\\cite{${keys.join(",")}}`) : full;
      },
    );
  }

  while (/ARCANAKEEP\d+END/.test(working)) {
    working = working.replace(
      /ARCANAKEEP(\d+)END/g,
      (_full, idx: string) => kept[Number(idx)] ?? "",
    );
  }

  return escapeProseCharsOnly(working).replace(/\s+~\\cite/g, "~\\cite");
}

function slugifyHeading(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || "section";
}

function parseTableRows(tableBlock: string): {
  headers: string[];
  rows: string[][];
} {
  const lines = tableBlock
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^[\s|:-]+$/.test(l));

  const splitRow = (line: string): string[] => {
    if (/\|/.test(line)) {
      return line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());
    }
    if (/\t/.test(line)) {
      return line.split("\t").map((c) => c.trim());
    }
    return line.split(/\s{2,}/).map((c) => c.trim());
  };

  const parsed = lines.map(splitRow).filter((r) => r.length > 0);
  if (parsed.length === 0) return { headers: ["Metric", "Value"], rows: [] };
  const colCount = Math.max(...parsed.map((r) => r.length));
  const normalizeRow = (r: string[]) =>
    Array.from({ length: colCount }, (_, i) => r[i] ?? "");

  return {
    headers: normalizeRow(parsed[0]),
    rows: parsed.slice(1).map(normalizeRow),
  };
}

function synthesizeStructuredLatex(
  blocks: ClassifiedBlock[],
  options: ReconstructOptions,
): { reconstructedLatex: string; bodyLatex: string; notes: string[] } {
  const outputMode = options.outputMode ?? "document";
  const targetFormat = options.targetFormat ?? "article";
  const notes: string[] = [];

  const hasBib = blocks.some((b) => b.label === "reference");
  let titleText = "";
  let authorText = "";
  let abstractText = "";
  let needsTheoremPkg = false;
  let needsBooktabs = false;
  let needsMathPkg = false;

  const bodyParts: string[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];
    const text = block.cleanedText.trim();

    if (block.label === "title") {
      const stripped = text.replace(/^\\title\{([\s\S]*)\}$/, "$1").trim();
      titleText = titleText ? `${titleText} -- ${stripped}` : stripped;
      i += 1;
      continue;
    }

    if (block.label === "author") {
      const stripped = text.replace(/^\\author\{([\s\S]*)\}$/, "$1").trim();
      authorText = authorText ? `${authorText} \\and ${stripped}` : stripped;
      i += 1;
      continue;
    }

    if (block.label === "abstract") {
      const stripped = text
        .replace(/^\\begin\{abstract\}|\s*\\end\{abstract\}$/g, "")
        .replace(/^(?:abstract|summary)\s*[:.-]?\s*/i, "")
        .trim();
      abstractText = formatProseWithMathAndCitations(stripped, hasBib);
      if (outputMode === "snippet") {
        bodyParts.push(`\\begin{abstract}\n${abstractText}\n\\end{abstract}`);
      }
      i += 1;
      continue;
    }

    if (block.label === "heading") {
      const rawTitle = text
        .replace(/^\\section\*?\{([\s\S]*)\}$/, "$1")
        .replace(/^#+\s*/, "")
        .replace(/^(?:\d+\.?|[IVX]+\.)\s+/, "")
        .replace(/\s*[:.]$/, "")
        .trim();
      const safeTitle = escapeProseCharsOnly(rawTitle || "Section");
      bodyParts.push(
        `\\section{${safeTitle}}\n\\label{sec:${slugifyHeading(rawTitle)}}`,
      );
      i += 1;
      continue;
    }

    if (block.label === "subheading") {
      const rawTitle = text
        .replace(/^\\sub(?:sub)?section\*?\{([\s\S]*)\}$/, "$1")
        .replace(/^#+\s*/, "")
        .replace(/^\d+(?:\.\d+)*\.?\s+/, "")
        .replace(/\s*[:.]$/, "")
        .trim();
      const safeTitle = escapeProseCharsOnly(rawTitle || "Subsection");
      bodyParts.push(`\\subsection{${safeTitle}}`);
      i += 1;
      continue;
    }

    if (block.label === "theorem_env") {
      needsTheoremPkg = true;
      needsMathPkg = true;
      const envMatch = text.match(
        /^(theorem|lemma|proposition|corollary|definition|remark)\b(?:\s+\d+(?:\.\d+)*)?(?:\s*\(([^)]+)\))?\s*[:.]?\s*([\s\S]*)$/i,
      );
      const envName = envMatch ? envMatch[1].toLowerCase() : "theorem";
      const optTitle = envMatch?.[2]?.trim();
      const content = envMatch ? envMatch[3].trim() : text;
      const formatted = formatProseWithMathAndCitations(content, hasBib);
      const header = optTitle
        ? `\\begin{${envName}}[${escapeProseCharsOnly(optTitle)}]`
        : `\\begin{${envName}}`;
      bodyParts.push(`${header}\n${formatted}\n\\end{${envName}}`);
      i += 1;
      continue;
    }

    if (block.label === "proof_env") {
      needsTheoremPkg = true;
      needsMathPkg = true;
      const stripped = text
        .replace(/^\\begin\{proof\}|\s*\\end\{proof\}$/g, "")
        .replace(/^(?:proof|sketch of proof)\s*[:.-]?\s*/i, "")
        .replace(/\s*(?:Q\.?E\.?D\.?|[□∎])\s*$/i, "")
        .trim();
      const formatted = formatProseWithMathAndCitations(stripped, hasBib);
      bodyParts.push(`\\begin{proof}\n${formatted}\n\\end{proof}`);
      i += 1;
      continue;
    }

    if (block.label === "equation") {
      needsMathPkg = true;
      const stripped = text
        .replace(/^\$\$|\$\$$/g, "")
        .replace(/^\\\[|\\\]$/g, "")
        .replace(/^\\begin\{equation\*?\}|\\end\{equation\*?\}$/g, "")
        .replace(/\(\d+(?:\.\d+)?\)$/, "")
        .trim();
      const latexEq = convertAsciiMathOperators(stripped);
      bodyParts.push(`\\begin{equation}\n  ${latexEq}\n\\end{equation}`);
      i += 1;
      continue;
    }

    if (block.label === "list_item") {
      const items: string[] = [];
      const isNumbered = /^(?:\(?\d{1,3}[.)]|\([a-zA-Z]\))\s+/.test(text);
      while (i < blocks.length && blocks[i].label === "list_item") {
        const cleanedItem = blocks[i].cleanedText
          .trim()
          .replace(/^(?:[-*•◦▪‣]|\(?\d{1,3}[.)]|\([a-zA-Z]\))\s+/, "");
        items.push(
          `  \\item ${formatProseWithMathAndCitations(cleanedItem, hasBib)}`,
        );
        i += 1;
      }
      const env = isNumbered ? "enumerate" : "itemize";
      bodyParts.push(`\\begin{${env}}\n${items.join("\n")}\n\\end{${env}}`);
      continue;
    }

    if (block.label === "table_block") {
      needsBooktabs = true;
      const { headers, rows } = parseTableRows(text);
      const colSpec = `l${"r".repeat(Math.max(0, headers.length - 1))}`;
      const headerRow = `${headers.map((h) => escapeProseCharsOnly(h)).join(" & ")} \\\\`;
      const dataRows = rows
        .map(
          (row) =>
            `${row.map((cell) => formatProseWithMathAndCitations(cell, false)).join(" & ")} \\\\`,
        )
        .join("\n    ");
      bodyParts.push(
        `\\begin{table}[htbp]
  \\centering
  \\caption{Reconstructed summary table.}
  \\label{tab:reconstructed-${i + 1}}
  \\begin{tabular}{${colSpec}}
    \\toprule
    ${headerRow}
    \\midrule
    ${dataRows}
    \\bottomrule
  \\end{tabular}
\\end{table}`,
      );
      i += 1;
      continue;
    }

    if (block.label === "reference") {
      const entries: string[] = [];
      let refCounter = 1;
      while (i < blocks.length && blocks[i].label === "reference") {
        const rawRef = blocks[i].cleanedText.trim();
        const numMatch = rawRef.match(/^\[(\d{1,3})\]\s+([\s\S]+)$/);
        const refKey = numMatch ? `ref${numMatch[1]}` : `ref${refCounter}`;
        const refBody = numMatch ? numMatch[2] : rawRef;
        entries.push(`  \\bibitem{${refKey}} ${escapeProseCharsOnly(refBody)}`);
        refCounter += 1;
        i += 1;
      }
      bodyParts.push(
        `\\begin{thebibliography}{99}\n${entries.join("\n")}\n\\end{thebibliography}`,
      );
      continue;
    }

    // Body prose
    const formattedProse = formatProseWithMathAndCitations(text, hasBib);
    if (formattedProse.includes("$")) needsMathPkg = true;
    bodyParts.push(formattedProse);
    i += 1;
  }

  const bodyLatex = bodyParts.join("\n\n");
  if (outputMode === "snippet") {
    return { reconstructedLatex: bodyLatex, bodyLatex, notes };
  }

  const packages: string[] = [
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage{amsmath,amssymb,amsthm}",
  ];
  if (needsBooktabs) packages.push("\\usepackage{booktabs}");
  packages.push("\\usepackage{hyperref}");

  const theoremDecls = needsTheoremPkg
    ? `\n\\newtheorem{theorem}{Theorem}
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{proposition}[theorem]{Proposition}
\\newtheorem{corollary}[theorem]{Corollary}
\\newtheorem{definition}{Definition}
\\newtheorem{remark}{Remark}\n`
    : "";

  const frontmatterLines: string[] = [];
  const resolvedTitle = titleText
    ? escapeProseCharsOnly(titleText)
    : "Reconstructed Manuscript";
  const resolvedAuthor = authorText
    ? escapeProseCharsOnly(authorText)
    : "Research Author";

  frontmatterLines.push(`\\title{${resolvedTitle}}`);
  frontmatterLines.push(`\\author{${resolvedAuthor}}`);
  frontmatterLines.push("\\date{}");

  const docLines: string[] = [
    "\\documentclass[11pt]{article}",
    "",
    ...packages,
    theoremDecls,
    ...frontmatterLines,
    "",
    "\\begin{document}",
    "\\maketitle",
    "",
  ];

  if (abstractText) {
    docLines.push(`\\begin{abstract}\n${abstractText}\n\\end{abstract}`, "");
  }

  if (bodyLatex) {
    docLines.push(bodyLatex, "");
  } else {
    docLines.push("\\section{Introduction}\n", "");
  }

  docLines.push("\\end{document}");

  let reconstructedLatex = docLines.join("\n").replace(/\n{3,}/g, "\n\n");

  if (targetFormat !== "article") {
    try {
      const adapted = adaptManuscriptToPublisher(
        reconstructedLatex,
        targetFormat,
        {
          title: resolvedTitle,
          authors: resolvedAuthor,
        },
      );
      reconstructedLatex = adapted.texContent;
      notes.push(`Adapted manuscript template to ${targetFormat}.`);
    } catch {
      notes.push(
        `Fell back to standard article format (unable to adapt to ${targetFormat}).`,
      );
    }
  }

  if (needsMathPkg) {
    notes.push(
      "Restored inline/display math expressions into LaTeX delimiters.",
    );
  }

  return { reconstructedLatex, bodyLatex, notes };
}

// ---------------------------------------------------------------------------
// Stage 5: Closed-Loop Linter Verification & Public Entrypoints
// ---------------------------------------------------------------------------

export function verifyReconstructedLatex(latex: string): {
  verifiedLatex: string;
  beforeCount: number;
  afterIssues: LatexLintIssue[];
  safeFixesApplied: number;
} {
  const initialIssues = lintLatexFile(latex, "reconstructed.tex");
  const safeFixable = initialIssues.filter((issue) => Boolean(issue.fix));
  let verifiedLatex = latex;
  let safeFixesApplied = 0;

  if (safeFixable.length > 0) {
    const fixed = applyAllSafeLintFixes(latex, initialIssues);
    if (fixed !== latex) {
      verifiedLatex = fixed;
      safeFixesApplied = safeFixable.length;
    }
  }

  const afterIssues = lintLatexFile(verifiedLatex, "reconstructed.tex");
  return {
    verifiedLatex,
    beforeCount: initialIssues.length,
    afterIssues,
    safeFixesApplied,
  };
}

export function reconstructTextLocal(
  rawText: string,
  options: ReconstructOptions = {},
): ReconstructionResult {
  const aggressiveness = options.aggressiveness ?? "balanced";
  const stage1Repairs: TokenRepair[] = [];

  const beforeTelemetry = analyzeTextCorruption(rawText);
  const stage1Cleaned = cleanRawText(rawText, stage1Repairs);
  const { cleaned: stage2Cleaned, repairs: stage2Repairs } =
    denoiseTextNoisyChannel(stage1Cleaned, aggressiveness);

  const rawBlocks = segmentIntoBlocks(stage2Cleaned);
  const blocks = classifyBlocksViterbi(rawBlocks, options.labelOverrides);

  const { reconstructedLatex, bodyLatex, notes } = synthesizeStructuredLatex(
    blocks,
    options,
  );
  const verification = verifyReconstructedLatex(reconstructedLatex);
  const afterTelemetry = analyzeTextCorruption(stage2Cleaned);

  return {
    engine: "local-ml",
    reconstructedLatex: verification.verifiedLatex,
    bodyLatex,
    cleanedPlainText: stage2Cleaned,
    beforeTelemetry,
    afterTelemetry,
    repairs: [...stage1Repairs, ...stage2Repairs],
    blocks,
    lintBeforeCount: verification.beforeCount,
    lintAfterIssues: verification.afterIssues,
    safeFixesApplied: verification.safeFixesApplied,
    notes,
  };
}
