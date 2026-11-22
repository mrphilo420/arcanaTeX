import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { probeCodeRuntimes, runLocalCode } from "./code-runner";
import {
  buildLatexFigureSnippet,
  compileFigureCode,
  deduceFigureSpec,
  ensureGraphicxInLatex,
  FIGURE_PALETTES,
  JOURNAL_FIGURE_SPECS,
  layoutFruchtermanReingold,
  layoutSugiyamaDag,
} from "./figure-engine";

describe("figure-engine", () => {
  it("exports all 8 journal figure presets with 300 DPI and Type 42 PDF compliance", () => {
    const ids = Object.keys(JOURNAL_FIGURE_SPECS);
    expect(ids).toEqual([
      "nature-single",
      "nature-double",
      "ieee-single",
      "ieee-double",
      "elsevier-single",
      "elsevier-double",
      "ams-siam",
      "arxiv-preprint",
    ]);

    for (const spec of Object.values(JOURNAL_FIGURE_SPECS)) {
      expect(spec.dpi).toBe(300);
      expect(spec.pdfFontType).toBe(42);
      expect(spec.widthInches).toBeGreaterThan(3);
      expect(spec.heightInches).toBeGreaterThan(2);
    }
  });

  it("exports colorblind-safe Okabe-Ito, Paul Tol Muted, and Grayscale palettes", () => {
    expect(Object.keys(FIGURE_PALETTES)).toEqual([
      "okabe-ito",
      "tol-muted",
      "grayscale",
    ]);
    expect(FIGURE_PALETTES["okabe-ito"].colors[0]).toBe("#0072B2");
    expect(FIGURE_PALETTES["okabe-ito"].markers.length).toBeGreaterThanOrEqual(
      6,
    );
  });

  it("computes deterministic Sugiyama layered DAG layouts with cycle breaking and crossing minimization", () => {
    const nodes = ["Input", "BranchA", "BranchB", "Merge", "Output"];
    const edges = [
      { from: "Input", to: "BranchA" },
      { from: "Input", to: "BranchB" },
      { from: "BranchA", to: "Merge" },
      { from: "BranchB", to: "Merge" },
      { from: "Merge", to: "Output" },
      { from: "Output", to: "BranchA", label: "feedback" }, // cycle edge
    ];

    const first = layoutSugiyamaDag(nodes, edges);
    const second = layoutSugiyamaDag(nodes, edges);

    expect(first).toEqual(second);
    expect(first.nodes).toHaveLength(5);
    expect(first.layerCount).toBe(4);
    expect(first.crossings).toBe(0);

    for (const node of first.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(1);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(1);
    }

    const inputNode = first.nodes.find((n) => n.id === "Input")!;
    const mergeNode = first.nodes.find((n) => n.id === "Merge")!;
    const outputNode = first.nodes.find((n) => n.id === "Output")!;
    expect(inputNode.x).toBeLessThan(mergeNode.x);
    expect(mergeNode.x).toBeLessThan(outputNode.x);

    const feedbackEdge = first.edges.find(
      (e) => e.from === "Output" && e.to === "BranchA",
    );
    expect(feedbackEdge?.backEdge).toBe(true);
  });

  it("computes deterministic Fruchterman-Reingold force-directed layouts normalized to [0, 1] x [0, 1]", () => {
    const nodes = ["A", "B", "C", "D", "E", "F"];
    const edges: Array<[string, string]> = [
      ["A", "B"],
      ["B", "C"],
      ["C", "A"],
      ["D", "E"],
      ["E", "F"],
      ["F", "D"],
      ["C", "D"],
    ];

    const layout1 = layoutFruchtermanReingold(nodes, edges, 100);
    const layout2 = layoutFruchtermanReingold(nodes, edges, 100);

    expect(layout1).toEqual(layout2);
    expect(layout1.nodes).toHaveLength(6);

    for (let i = 0; i < layout1.nodes.length; i++) {
      const a = layout1.nodes[i];
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThanOrEqual(1);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeLessThanOrEqual(1);
      for (let j = i + 1; j < layout1.nodes.length; j++) {
        const b = layout1.nodes[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        expect(dist).toBeGreaterThan(0.05);
      }
    }
  });

  it("deduces figure families, layouts, CSV bindings, and numbered instructions from prompts", () => {
    const dagPlan = deduceFigureSpec(
      "Architecture diagram: Raw Signal -> Fourier Encoder -> Koopman Latent -> Policy Output",
      { presetId: "ieee-double", paletteId: "okabe-ito" },
    );
    expect(dagPlan.family).toBe("dag-flowchart");
    expect(dagPlan.graphLayout?.nodes).toHaveLength(4);
    expect(dagPlan.instructions.length).toBeGreaterThanOrEqual(6);
    expect(dagPlan.instructions[0]).toMatch(/^1\./);

    const violinPlan = deduceFigureSpec(
      "Violin and quantile distribution of posterior log-likelihood across 4 MCMC samplers",
    );
    expect(violinPlan.family).toBe("distribution-violin");
    expect(violinPlan.recommendedLanguage).toBe("r");

    const csvPlan = deduceFigureSpec(
      "Log-log spectral convergence error decay vs mesh resolution",
      {
        csvPath: "data/convergence.csv",
        csvContent: "mesh_n,spectral_err,fd_err\n8,0.1,0.3\n16,0.01,0.15\n",
      },
    );
    expect(csvPlan.family).toBe("line-convergence");
    expect(csvPlan.xScale).toBe("log");
    expect(csvPlan.yScale).toBe("log");
    expect(csvPlan.csvColumns).toEqual(["mesh_n", "spectral_err", "fd_err"]);
    expect(csvPlan.xLabel).toBe("mesh_n");
  });

  it("compiles and executes deduced Python and R figure scripts end-to-end via runLocalCode", async () => {
    const dagPlan = deduceFigureSpec(
      "Causal DAG: Encoder -> Latent Operator -> Verifier -> Controller",
      { presetId: "nature-single", language: "python" },
    );
    const pyCode = compileFigureCode(dagPlan, "python");
    expect(pyCode).toContain('"pdf.fonttype": 42');
    expect(pyCode).toContain("3.5, 2.65");

    const rPlan = deduceFigureSpec(
      "Scatter regression with 95% confidence band in R",
      { presetId: "ieee-single", language: "r" },
    );
    const rCode = compileFigureCode(rPlan, "r");
    expect(rCode).toContain("figures/");

    const canExecute =
      (process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec")) ||
      process.env.ALLOW_UNSANDBOXED_CODE_EXECUTION === "true";
    if (!canExecute) return;

    const runtimes = await probeCodeRuntimes();
    if (
      runtimes.python.available &&
      runtimes.python.packages.includes("matplotlib")
    ) {
      const pyResult = await runLocalCode({
        language: "python",
        code: pyCode,
      });
      expect(pyResult.success).toBe(true);
      expect(
        pyResult.artifacts.some(
          (a) => a.path === `figures/${dagPlan.slug}.pdf`,
        ),
      ).toBe(true);
      expect(
        pyResult.artifacts.some(
          (a) => a.path === `figures/${dagPlan.slug}.png`,
        ),
      ).toBe(true);
      expect(
        pyResult.artifacts.some(
          (a) => a.path === `figures/${dagPlan.slug}.svg`,
        ),
      ).toBe(true);
    }

    if (runtimes.r.available) {
      const rResult = await runLocalCode({
        language: "r",
        code: rCode,
      });
      expect(rResult.success).toBe(true);
      expect(
        rResult.artifacts.some((a) => a.path === `figures/${rPlan.slug}.pdf`),
      ).toBe(true);
      expect(
        rResult.artifacts.some((a) => a.path === `figures/${rPlan.slug}.png`),
      ).toBe(true);
    }
  }, 45_000);

  it("builds LaTeX figure snippets and injects \\usepackage{graphicx} safely", () => {
    const singleSnippet = buildLatexFigureSnippet({
      imagePath: "figures/convergence.pdf",
      caption: "Error decay.",
      label: "convergence",
      doubleColumn: false,
    });
    expect(singleSnippet).toContain("\\begin{figure}[htbp]");
    expect(singleSnippet).toContain(
      "\\includegraphics[width=0.85\\linewidth]{figures/convergence.pdf}",
    );
    expect(singleSnippet).toContain("\\label{fig:convergence}");

    const doubleSnippet = buildLatexFigureSnippet({
      imagePath: "figures/overview.pdf",
      caption: "System overview.",
      label: "fig:overview",
      doubleColumn: true,
    });
    expect(doubleSnippet).toContain("\\begin{figure*}[t]");

    const updatedTex = ensureGraphicxInLatex(
      "\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n",
      singleSnippet,
    );
    expect(updatedTex).toContain("\\usepackage{graphicx}");
    expect(updatedTex).toContain("\\begin{figure}[htbp]");
    expect(updatedTex.indexOf("\\usepackage{graphicx}")).toBeLessThan(
      updatedTex.indexOf("\\begin{document}"),
    );
    expect(updatedTex.indexOf("\\begin{figure}[htbp]")).toBeLessThan(
      updatedTex.indexOf("\\end{document}"),
    );
  });
});
