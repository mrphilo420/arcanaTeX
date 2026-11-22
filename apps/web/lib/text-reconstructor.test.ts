import { describe, expect, it } from "vitest";
import {
  analyzeTextCorruption,
  classifyBlocksViterbi,
  cleanRawText,
  confusionEditDistance,
  denoiseTextNoisyChannel,
  reconstructTextLocal,
  segmentIntoBlocks,
} from "@/lib/text-reconstructor";

describe("text-reconstructor 5-stage ML pipeline", () => {
  it("computes corruption telemetry and cleans mojibake, ligatures, headers, and hyphenated wraps", () => {
    const raw = `Preprint Under Review

Page 2

Preprint Under Review

We analyze â€œspectralâ€  conver-\ngence when Î± â‰¤ 0.5 and ﬁxed-point iterates decay with x#q! pr00f.
Moreover, Ã© accents and wrapped
lines appear throughout.`;

    const telemetry = analyzeTextCorruption(raw);
    expect(telemetry.mojibakeCount).toBeGreaterThan(0);
    expect(telemetry.compositeScore).toBeGreaterThan(20);
    expect(telemetry.charPerplexity).toBeGreaterThan(9);

    const repairs: Parameters<typeof cleanRawText>[1] = [];
    const cleaned = cleanRawText(raw, repairs);

    expect(cleaned).not.toContain("â€œ");
    expect(cleaned).not.toContain("Î±");
    expect(cleaned).not.toContain("ﬁ");
    expect(cleaned).not.toContain("Preprint Under Review");
    expect(cleaned).not.toContain("Page 2");
    expect(cleaned).toContain("convergence");
    expect(cleaned).toContain("fixed-point");
    expect(cleaned).toContain("é");
    expect(repairs.some((r) => r.kind === "mojibake")).toBe(true);
    expect(repairs.some((r) => r.kind === "ligature")).toBe(true);
    expect(repairs.some((r) => r.kind === "word-merge")).toBe(true);
  });

  it("scores weighted OCR confusion edit distance lower for visual confusions than unrelated edits", () => {
    expect(confusionEditDistance("rnethod", "method")).toBeLessThan(0.5);
    expect(confusionEditDistance("equatlon", "equation")).toBeLessThan(0.5);
    expect(confusionEditDistance("pr00f", "proof")).toBeLessThan(0.6);
    expect(confusionEditDistance("pr00f", "table")).toBeGreaterThan(3);
  });

  it("denoises OCR confusions, mangled LaTeX commands, and compound words via Bayesian noisy-channel", () => {
    const noisy = `\\sectoin{Introduction}
We evaluate thc iterative rnethod wltb equatlon (1) and pr00f of convergencc.
Also keep Koopman and \\cite{smith2024} untouched despite theconvergence run-on.
begin{proof}
This holds under Koopman spectral bounds.
end{proof}`;

    const { cleaned, repairs } = denoiseTextNoisyChannel(noisy, "balanced");
    expect(cleaned).toContain("\\section{Introduction}");
    expect(cleaned).toContain("\\begin{proof}");
    expect(cleaned).toContain("\\end{proof}");
    expect(cleaned).toContain("the iterative method with equation");
    expect(cleaned).toContain("proof of convergence");
    expect(cleaned).toContain("the convergence");
    expect(cleaned).toContain("Koopman");
    expect(cleaned).toContain("\\cite{smith2024}");
    expect(repairs.some((r) => r.kind === "latex-cmd")).toBe(true);
    expect(repairs.some((r) => r.kind === "ocr-channel")).toBe(true);
    expect(repairs.some((r) => r.kind === "word-split")).toBe(true);
  });

  it("decodes academic manuscript structure using Viterbi sequence labeling and honors manual overrides", () => {
    const cleanSample = `Variational Bounds for Spectral Operators
Ada Lovelace, University of Oxford

Abstract: We derive sharp convergence guarantees for discrete operators.

1 Introduction
In this paper we study iterative schemes on manifolds.

1.1 Problem Formulation
Consider a symmetric positive definite operator.

Theorem 1 (Spectral Gap): Let lambda > 0 be the smallest eigenvalue.

Proof: Apply Cauchy-Schwarz and take limits. Q.E.D.

x_n = A x_{n-1} + b

- First convergence property holds.
- Second stability property holds.

Solver | Iterations | Error
CG | 42 | 1e-8
Multigrid | 8 | 1e-10

[1] Saad, Y. Iterative Methods. SIAM, 2003.`;

    const blocks = segmentIntoBlocks(cleanSample);
    const labeled = classifyBlocksViterbi(blocks);
    const labels = labeled.map((b) => b.label);

    expect(labels[0]).toBe("title");
    expect(labels).toContain("author");
    expect(labels).toContain("abstract");
    expect(labels).toContain("heading");
    expect(labels).toContain("subheading");
    expect(labels).toContain("theorem_env");
    expect(labels).toContain("proof_env");
    expect(labels).toContain("list_item");
    expect(labels).toContain("table_block");
    expect(labels).toContain("reference");

    // Manual override clamps the target block cleanly
    const overridden = classifyBlocksViterbi(blocks, { 0: "prose" });
    expect(overridden[0].label).toBe("prose");
    expect(overridden[0].confidence).toBe(1);
  });

  it("synthesizes publisher-ready LaTeX and passes closed-loop Stage 5 linter verification with 0 errors", () => {
    const rawMess = `Convergence Analysis of Multigrid Preconditioners
Alan Turing, Department of Mathematics, Cambridge

Abstract: We establish â€œoptimalâ€  conver-\ngence bounds when Î± â‰¤ 0.25. Our ﬁndings validate thc rnethod wltb O(h^2) error.

1 Introduction
As shown in [1], preconditioning accelerates convergence when x_i -> 0.

Theorem 1 (Coercivity): Every discrete state satisfies E_k <= C rho^k.

Proof: The bound follows directly by induction on k. Q.E.D.

Solver | Steps | Residual
CG | 50 | 1e-6
AMG | 7 | 1e-10

[1] Briggs, W. L. A Multigrid Tutorial. SIAM, 2000.`;

    const articleResult = reconstructTextLocal(rawMess, {
      aggressiveness: "balanced",
      outputMode: "document",
      targetFormat: "article",
    });

    expect(articleResult.afterTelemetry.compositeScore).toBeLessThan(
      articleResult.beforeTelemetry.compositeScore,
    );
    expect(articleResult.reconstructedLatex).toContain("\\documentclass");
    expect(articleResult.reconstructedLatex).toContain(
      "\\begin{theorem}[Coercivity]",
    );
    expect(articleResult.reconstructedLatex).toContain("\\begin{proof}");
    expect(articleResult.reconstructedLatex).toContain("\\begin{tabular}");
    expect(articleResult.reconstructedLatex).toContain("\\bibitem{ref1}");
    expect(articleResult.reconstructedLatex).toContain("~\\cite{ref1}");

    const errors = articleResult.lintAfterIssues.filter(
      (i) => i.severity === "error",
    );
    expect(errors).toHaveLength(0);

    // Also verifies clean IEEE publisher adaptation
    const ieeeResult = reconstructTextLocal(rawMess, {
      aggressiveness: "balanced",
      outputMode: "document",
      targetFormat: "ieee",
    });
    expect(ieeeResult.reconstructedLatex).toContain("IEEEtran");
    expect(
      ieeeResult.lintAfterIssues.filter((i) => i.severity === "error"),
    ).toHaveLength(0);
  });
});
