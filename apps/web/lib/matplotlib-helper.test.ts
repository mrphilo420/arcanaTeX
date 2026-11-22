import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { probeCodeRuntimes } from "./code-runner";
import {
  ARCANA_PLOT_PY,
  matplotlibSpecSchema,
  runMatplotlibSpec,
} from "./matplotlib-helper";

function canExecuteLocalCode(): boolean {
  return (
    (process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec")) ||
    process.env.ALLOW_UNSANDBOXED_CODE_EXECUTION === "true"
  );
}

describe("matplotlib-helper", () => {
  it("validates compact declarative plot specs with defaults", () => {
    const parsed = matplotlibSpecSchema.parse({
      title: "Training Loss",
      xLabel: "Epoch",
      yLabel: "Loss",
      series: [{ label: "Model A", x: [1, 2, 3], y: [0.9, 0.4, 0.2] }],
    });
    expect(parsed.kind).toBe("line");
    expect(parsed.preset).toBe("nature-single");
    expect(parsed.palette).toBe("okabe-ito");
    expect(parsed.outputStem).toBe("figures/plot");
  });

  it("embeds Python-side journal formatting presets and multi-format export", () => {
    expect(ARCANA_PLOT_PY).toContain("def apply_journal_style");
    expect(ARCANA_PLOT_PY).toContain("def save_figure");
    expect(ARCANA_PLOT_PY).toContain("def render_spec");
    expect(ARCANA_PLOT_PY).toContain('"pdf.fonttype": 42');
  });

  it("renders a compact JSON spec into PDF, PNG, and SVG via Python", async () => {
    if (!canExecuteLocalCode()) return;
    const runtimes = await probeCodeRuntimes();
    if (
      !runtimes.python.available ||
      !runtimes.python.packages.includes("matplotlib")
    ) {
      return;
    }

    const result = await runMatplotlibSpec({
      kind: "line",
      title: "Convergence Curve",
      xLabel: "Iteration",
      yLabel: "Error",
      preset: "ieee-single",
      palette: "okabe-ito",
      outputStem: "figures/convergence_chat",
      legend: true,
      grid: true,
      xLog: false,
      yLog: false,
      bins: 20,
      series: [
        { label: "Baseline", x: [1, 2, 3, 4], y: [1.0, 0.6, 0.35, 0.2] },
        { label: "Ours", x: [1, 2, 3, 4], y: [0.8, 0.3, 0.12, 0.05] },
      ],
    });

    expect(result.success).toBe(true);
    expect(
      result.artifacts.some((a) => a.path === "figures/convergence_chat.pdf"),
    ).toBe(true);
    expect(
      result.artifacts.some((a) => a.path === "figures/convergence_chat.png"),
    ).toBe(true);
    expect(
      result.artifacts.some((a) => a.path === "figures/convergence_chat.svg"),
    ).toBe(true);
  }, 45_000);
});
