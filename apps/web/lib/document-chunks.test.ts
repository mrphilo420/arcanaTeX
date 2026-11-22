import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assembleWholeRevision,
  buildChunkContextEnvelope,
  chunkLatexDocument,
  clearChunkSession,
  compressChunk,
  compressDocument,
  createChunkSession,
  discardAllStagedRevisions,
  getChunkSessionStorageKey,
  hashText,
  loadChunkSession,
  recordChunkAnalysis,
  saveChunkSession,
  stageChunkRevision,
  unstageChunkRevision,
} from "@/lib/document-chunks";

function buildRichPaper(): string {
  return [
    "\\documentclass[11pt]{article}",
    "\\usepackage{amsmath,amssymb,amsthm}",
    "\\title{On \\textbf{Adaptive} Convergence of $L^2$ Mirror Descent}",
    "\\author{A. Researcher}",
    "",
    "\\begin{document}",
    "\\maketitle",
    "",
    "\\begin{abstract}",
    "We prove an optimal $\\mathcal{O}(T^{-1/2})$ convergence rate for adaptive mirror descent under heavy-tailed noise.",
    "Our analysis introduces a localized Bregman Lyapunov potential and avoids bounded-gradient assumptions.",
    "\\end{abstract}",
    "",
    "\\section{Introduction}",
    "\\label{sec:intro}",
    "Stochastic first-order methods remain foundational in large-scale optimization~\\cite{nemirovski2009,bubeck2015}.",
    "However, classical analyses rely on uniform smoothness along the trajectory.",
    "",
    "\\subsection{Related Work}",
    "\\label{sec:related}",
    "Prior mirror descent bounds require global Lipschitz constants~\\cite{beck2003}.",
    "% \\section{Commented Out Phantom Section}",
    "\\begin{verbatim}",
    "\\section{Code Example Inside Verbatim Should Not Split}",
    "\\label{lbl:fake}",
    "\\end{verbatim}",
    "",
    "\\section{Main Convergence Theorem}",
    "\\label{sec:main}",
    "We state our main guarantee below in Theorem~\\ref{thm:rate}.",
    "\\begin{theorem}[Adaptive Bregman Rate]",
    "\\label{thm:rate}",
    "Under step sizes $\\eta_t = c / \\sqrt{t}$, the ergodic average satisfies",
    "\\[",
    "  \\mathbb{E}[f(\\bar{x}_T) - f(x^*)] \\le \\frac{D_\\psi(x^*, x_1) + \\sigma^2}{\\sqrt{T}}.",
    "\\]",
    "\\end{theorem}",
    "\\begin{proof}",
    "Applying the three-point Bregman identity and summing over $t=1,\\dots,T$ yields Equation~\\eqref{eq:lyap}.",
    "\\begin{equation}",
    "\\label{eq:lyap}",
    "\\langle g_t, x_t - x^* \\rangle \\le \\frac{1}{\\eta_t}(D_\\psi(x^*, x_t) - D_\\psi(x^*, x_{t+1})) + \\frac{\\eta_t}{2}\\|g_t\\|_*^2.",
    "\\end{equation}",
    "Taking expectations completes the proof.",
    "\\end{proof}",
    "",
    "\\appendix",
    "\\section{Technical Lemmas}",
    "\\label{app:lemmas}",
    "Helper bounds are verified in Corollary~\\ref{cor:helper} and missing Ref~\\ref{sec:missing}.",
    "",
    "\\bibliographystyle{plain}",
    "\\bibliography{references}",
    "",
    "\\end{document}",
    "% trailing note",
  ].join("\n");
}

describe("chunkLatexDocument", () => {
  it("partitions any document contiguously and losslessly byte-for-byte", () => {
    const docs = [
      buildRichPaper(),
      buildRichPaper().replace(/\n/g, "\r\n"),
      "Plain fragment without begin document\n\nSecond paragraph.",
      "\\begin{document}\n\\begin{abstract}\nTight abstract.\n\\end{abstract}\n\\end{document}",
      "Single line no trailing newline",
    ];

    for (const doc of docs) {
      const chunks = chunkLatexDocument(doc, { maxChunkChars: 300 });
      expect(chunks.map((c) => c.content).join("")).toBe(doc);
      expect(chunks[0].startOffset).toBe(0);
      expect(chunks[chunks.length - 1].endOffset).toBe(doc.length);
      for (let i = 1; i < chunks.length; i += 1) {
        expect(chunks[i].startOffset).toBe(chunks[i - 1].endOffset);
        expect(chunks[i].content).toBe(
          doc.slice(chunks[i].startOffset, chunks[i].endOffset),
        );
      }
    }

    expect(chunkLatexDocument("")).toEqual([]);
  });

  it("splits cleanly at preamble, frontmatter, abstract, sections, subsections, appendix, bibliography, and backmatter", () => {
    const doc = buildRichPaper();
    const chunks = chunkLatexDocument(doc);

    expect(chunks.map((c) => c.kind)).toEqual([
      "preamble",
      "frontmatter",
      "abstract",
      "section",
      "subsection",
      "section",
      "appendix",
      "bibliography",
      "backmatter",
    ]);

    expect(chunks[0].content).not.toContain("\\begin{document}");
    expect(chunks[0].heading).toBe("Preamble");
    expect(chunks[2].heading).toBe("Abstract");
    expect(chunks[3].heading).toBe("Introduction");
    expect(chunks[4].heading).toBe("Related Work");
    // Commented and verbatim sections must not create phantom chunks or fake labels
    expect(chunks[4].labels).toEqual(["sec:related"]);
    expect(chunks[5].labels).toEqual(["sec:main", "thm:rate", "eq:lyap"]);
    expect(chunks[5].cites).toEqual([]);
    expect(chunks[5].mathBlockCount).toBe(2); // \[...\] + equation
    expect(chunks[6].kind).toBe("appendix");
    expect(chunks[7].kind).toBe("bibliography");
    expect(chunks[7].content).toContain("\\bibliographystyle{plain}");
    expect(chunks[8].kind).toBe("backmatter");
    expect(chunks[8].content).toContain("\\end{document}");
  });

  it("subdivides oversized sections only at paragraph or atomic boundaries, never mid-equation or mid-theorem", () => {
    const para1 = "First paragraph explaining setup and notation. "
      .repeat(6)
      .trim();
    const theorem = [
      "\\begin{theorem}[Invariant Block]",
      "\\label{thm:inv}",
      "Every trajectory satisfies a uniform bound with constants $c_1, c_2 > 0$.",
      "\\[",
      "  \\sum_{k=1}^{n} \\alpha_k \\|x_k - x^*\\|^2 \\le C_0 + \\sum_{k=1}^{n} \\eta_k^2 \\sigma^2.",
      "\\]",
      "\\end{theorem}",
    ].join("\n");
    const displayMath = [
      "$$",
      "  \\Phi(t) = \\int_0^t \\exp(-\\gamma (t-s)) \\, \\| \\nabla f(x_s) \\|^2 \\, ds",
      "$$",
    ].join("\n");
    const para2 = "Final discussion paragraph summarizing empirical findings. "
      .repeat(6)
      .trim();

    const doc = [
      "\\section{Oversized Analysis}",
      para1,
      "",
      theorem,
      "",
      displayMath,
      "",
      para2,
      "",
    ].join("\n");

    const chunks = chunkLatexDocument(doc, { maxChunkChars: 240 });
    expect(chunks.map((c) => c.content).join("")).toBe(doc);
    expect(chunks.length).toBeGreaterThanOrEqual(3);

    const theoremChunk = chunks.find((c) =>
      c.content.includes("\\begin{theorem}"),
    );
    expect(theoremChunk).toBeDefined();
    expect(theoremChunk?.content).toContain("\\end{theorem}");
    expect(theoremChunk?.content).toContain("\\[");
    expect(theoremChunk?.content).toContain("\\]");

    const dollarChunk = chunks.find((c) => c.content.includes("\\Phi(t)"));
    expect(dollarChunk).toBeDefined();
    const dollarPairs = dollarChunk?.content.match(/\$\$/g) ?? [];
    expect(dollarPairs).toHaveLength(2);
  });

  it("does not treat \\[6pt] line breaks as display math blocks", () => {
    const doc = [
      "\\section{Table Section}",
      "Row one \\\\[6pt]",
      "Row two \\\\[4pt]",
      "",
      "Next paragraph after table.",
    ].join("\n");
    const chunks = chunkLatexDocument(doc, { maxChunkChars: 70 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].mathBlockCount).toBe(0);
  });

  it("handles \\part, \\chapter, \\subsubsection, \\printbibliography, and nested braces in headings", () => {
    const doc = [
      "\\begin{document}",
      "\\part{Foundations}",
      "Intro to part one.",
      "\\chapter{Measure Spaces}",
      "Chapter overview.",
      "\\section[Short]{Bounds for $\\frac{1}{2}$ Norms}",
      "Section body.",
      "\\subsubsection{Fine Estimate}",
      "Fine details.",
      "\\printbibliography",
      "\\end{document}",
    ].join("\n");

    const chunks = chunkLatexDocument(doc);
    expect(chunks.map((c) => c.content).join("")).toBe(doc);
    expect(chunks.map((c) => c.kind)).toEqual([
      "part",
      "chapter",
      "section",
      "subsubsection",
      "bibliography",
      "backmatter",
    ]);
    expect(chunks[2].heading).toBe("Bounds for $\\frac{1}{2}$ Norms");
  });
});

describe("compressChunk & compressDocument", () => {
  it("extracts title, abstract, outline, inventories, theorem signatures, and achieves strong compression on long papers", () => {
    const repeatedSections = Array.from({ length: 14 }, (_, idx) => {
      const n = idx + 1;
      return [
        `\\section{Analysis Part ${n}}`,
        `\\label{sec:part-${n}}`,
        `In this section we establish variance reduction property ${n} building on Theorem~\\ref{thm:rate} and citation~\\cite{ref${n}}.`,
        "Auxiliary implementation details and routine algebraic manipulations follow standard martingale concentration inequalities across bounded filtration steps. ".repeat(
          12,
        ),
        `\\begin{lemma}[Step Bound ${n}]`,
        `\\label{lem:bound-${n}}`,
        `For step ${n}, the drift term satisfies $\\Delta_${n} \\le \\eta_${n}^2 \\sigma^2$.`,
        "\\end{lemma}",
        "Further routine remarks about constants and hyperparameter tuning appear in the appendix tables. ".repeat(
          10,
        ),
      ].join("\n\n");
    }).join("\n\n");

    const longPaper = [
      "\\documentclass{article}",
      "\\title{Unified Adaptive Optimization Across Stochastic Regimes}",
      "\\begin{document}",
      "\\maketitle",
      "\\begin{abstract}",
      "We introduce a unified adaptive optimization framework achieving minimax optimal convergence rates.",
      "\\end{abstract}",
      "\\section{Main Theorem}",
      "\\begin{theorem}[Minimax Rate]",
      "\\label{thm:rate}",
      "Rate is $\\mathcal{O}(T^{-1/2})$.",
      "\\end{theorem}",
      repeatedSections,
      "\\bibliography{refs}",
      "\\end{document}",
    ].join("\n");

    const compressed = compressDocument(longPaper);

    expect(compressed.title).toBe(
      "Unified Adaptive Optimization Across Stochastic Regimes",
    );
    expect(compressed.abstractSummary).toContain("minimax optimal convergence");
    expect(compressed.outline).toContain("[chunk-001]");
    expect(compressed.outline).toContain("§Analysis Part 1");
    expect(compressed.labels).toContain("thm:rate");
    expect(compressed.labels).toContain("lem:bound-14");
    expect(compressed.cites).toContain("ref14");
    expect(compressed.statements.length).toBeGreaterThanOrEqual(15);
    expect(compressed.originalChars).toBe(longPaper.length);
    expect(compressed.compressedChars).toBe(compressed.digestMarkdown.length);
    expect(compressed.compressionRatio).toBeGreaterThan(0.75);
    expect(compressed.estimatedTokensSaved).toBeGreaterThan(5000);

    const firstChunk = chunkLatexDocument(longPaper)[2];
    const singleDigest = compressChunk(firstChunk, 220);
    expect(singleDigest.summary.length).toBeLessThanOrEqual(220);
    expect(singleDigest.compressedChars).toBe(singleDigest.summary.length);

    const tightlyCapped = compressDocument(longPaper, { maxDigestChars: 1200 });
    expect(tightlyCapped.digestMarkdown.length).toBeLessThanOrEqual(1200);
    expect(tightlyCapped.compressedChars).toBe(
      tightlyCapped.digestMarkdown.length,
    );
  });
});

describe("chunk session store, context envelope & whole-revision reassembly", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists sessions in localStorage, builds context envelopes, and splices exact revisions seamlessly", () => {
    const original = buildRichPaper();
    const session = createChunkSession({
      projectId: "proj-1",
      fileId: "file-main",
      filePath: "main.tex",
      content: original,
    });

    const intro = session.chunks.find((c) => c.heading === "Introduction");
    expect(intro).toBeDefined();

    let updated = stageChunkRevision(
      session,
      intro!.id,
      intro!.content.replace(
        "classical analyses",
        "classical Euclidean analyses",
      ),
      "Clarify Euclidean assumption",
    );
    updated = recordChunkAnalysis(updated, intro!.id, "Clear motivation.", [
      "checked-citations",
    ]);

    saveChunkSession(updated);
    const loaded = loadChunkSession("proj-1", "file-main");
    expect(loaded).not.toBeNull();
    expect(loaded?.sourceHash).toBe(hashText(original));
    expect(loaded?.analyses[intro!.id].flags).toEqual(["checked-citations"]);
    expect(
      store[getChunkSessionStorageKey("proj-1", "file-main")],
    ).toBeDefined();

    const envelope = buildChunkContextEnvelope(updated, intro!.id);
    expect(envelope.thesis).toContain("Adaptive Convergence");
    expect(envelope.outline).toContain(intro!.id);
    expect(envelope.previousTail).toContain("\\end{abstract}");
    expect(envelope.nextHead).toContain("\\subsection{Related Work}");
    expect(envelope.stagedContent).toContain("classical Euclidean analyses");

    const assembled = assembleWholeRevision(original, updated);
    expect(assembled.ok).toBe(true);
    if (assembled.ok) {
      expect(assembled.strategy).toBe("exact");
      expect(assembled.changedChunkIds).toEqual([intro!.id]);
      expect(assembled.content).toContain("classical Euclidean analyses");
      expect(assembled.stats.added).toBeGreaterThanOrEqual(1);
      expect(assembled.stats.removed).toBeGreaterThanOrEqual(1);
    }

    const unstaged = unstageChunkRevision(updated, intro!.id);
    expect(Object.keys(unstaged.stagedRevisions)).toHaveLength(0);
    const discarded = discardAllStagedRevisions(updated);
    expect(Object.keys(discarded.stagedRevisions)).toHaveLength(0);

    clearChunkSession("proj-1", "file-main");
    expect(loadChunkSession("proj-1", "file-main")).toBeNull();
  });

  it("uses anchored-fallback when document changed outside staged chunks and rejects drifted staged chunks", () => {
    const original = buildRichPaper();
    const session = createChunkSession({
      projectId: "proj-1",
      fileId: "file-main",
      filePath: "main.tex",
      content: original,
    });

    const mainChunk = session.chunks.find(
      (c) => c.heading === "Main Convergence Theorem",
    );
    expect(mainChunk).toBeDefined();

    const staged = stageChunkRevision(
      session,
      mainChunk!.id,
      mainChunk!.content.replace(
        "Taking expectations",
        "Applying Jensen's inequality",
      ),
    );

    // Edit an unrelated earlier section in the live document
    const shiftedDoc = original.replace(
      "classical analyses rely on uniform smoothness",
      "classical non-adaptive analyses rely on global smoothness",
    );
    const fallback = assembleWholeRevision(shiftedDoc, staged);
    expect(fallback.ok).toBe(true);
    if (fallback.ok) {
      expect(fallback.strategy).toBe("anchored-fallback");
      expect(fallback.changedChunkIds).toEqual([mainChunk!.id]);
      expect(fallback.content).toContain("classical non-adaptive analyses");
      expect(fallback.content).toContain("Applying Jensen's inequality");
    }

    // Now concurrently modify the staged chunk itself in the live document
    const conflictedDoc = original.replace(
      "Applying the three-point Bregman identity",
      "Applying a modified mirror identity",
    );
    const conflict = assembleWholeRevision(conflictedDoc, staged);
    expect(conflict).toEqual({
      ok: false,
      reason: "source-drift",
      driftedChunkIds: [mainChunk!.id],
    });

    // Duplicate match makes anchoring non-unique and must also return source-drift
    const duplicatedDoc = `${shiftedDoc}\n${mainChunk!.content}`;
    const ambiguous = assembleWholeRevision(duplicatedDoc, staged);
    expect(ambiguous).toEqual({
      ok: false,
      reason: "source-drift",
      driftedChunkIds: [mainChunk!.id],
    });
  });

  it("is SSR-safe when window is undefined", () => {
    vi.unstubAllGlobals();
    const session = createChunkSession({
      projectId: "ssr-proj",
      fileId: "ssr-file",
      filePath: "main.tex",
      content: "\\section{SSR}\nSafe without DOM.",
    });
    expect(() => saveChunkSession(session)).not.toThrow();
    expect(loadChunkSession("ssr-proj", "ssr-file")).toBeNull();
    expect(() => clearChunkSession("ssr-proj", "ssr-file")).not.toThrow();
  });
});
