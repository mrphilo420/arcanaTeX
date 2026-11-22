import { z } from "zod";
import { runLocalCode, type CodeRunResult } from "@/lib/code-runner";

export const MATPLOTLIB_PRESETS = [
  "nature-single",
  "nature-double",
  "ieee-single",
  "ieee-double",
  "elsevier-single",
  "elsevier-double",
  "ams-siam",
  "arxiv-preprint",
] as const;

export const MATPLOTLIB_PALETTES = [
  "okabe-ito",
  "nature-npg",
  "ieee-contrast",
  "viridis-discrete",
] as const;

export const matplotlibSeriesSchema = z.object({
  label: z.string().max(120).optional(),
  x: z
    .array(z.union([z.number(), z.string()]))
    .max(5_000)
    .optional(),
  y: z.array(z.number()).max(5_000).optional(),
  yerr: z.array(z.number()).max(5_000).optional(),
  values: z.array(z.number()).max(10_000).optional(),
  color: z.string().max(32).optional(),
  linestyle: z.enum(["-", "--", "-.", ":"]).optional(),
  marker: z.enum(["o", "s", "^", "D", "v", "x", "+"]).optional(),
  alpha: z.number().min(0.05).max(1).optional(),
});

export const matplotlibSpecSchema = z.object({
  kind: z
    .enum([
      "line",
      "scatter",
      "bar",
      "errorbar",
      "histogram",
      "boxplot",
      "heatmap",
    ])
    .default("line"),
  title: z.string().max(200).optional(),
  xLabel: z.string().max(120).optional(),
  yLabel: z.string().max(120).optional(),
  preset: z.enum(MATPLOTLIB_PRESETS).default("nature-single"),
  palette: z.enum(MATPLOTLIB_PALETTES).default("okabe-ito"),
  outputStem: z
    .string()
    .max(120)
    .default("figures/plot")
    .describe("Output path stem without extension, e.g. figures/loss_curve"),
  legend: z.boolean().default(true),
  grid: z.boolean().default(true),
  xLog: z.boolean().default(false),
  yLog: z.boolean().default(false),
  bins: z.number().int().min(2).max(200).default(20),
  series: z.array(matplotlibSeriesSchema).max(16).default([]),
  heatmap: z
    .object({
      matrix: z.array(z.array(z.number()).max(200)).max(200),
      xTicks: z.array(z.string().max(64)).max(200).optional(),
      yTicks: z.array(z.string().max(64)).max(200).optional(),
      cmap: z.string().max(40).default("viridis"),
      annotate: z.boolean().default(true),
    })
    .optional(),
});

export type MatplotlibSpec = z.infer<typeof matplotlibSpecSchema>;

/**
 * Shared Python formatting and multi-format export module injected into
 * sandboxed Python runs so LLMs never spend tokens writing Matplotlib styling.
 */
export const ARCANA_PLOT_PY = `import json
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

PRESETS = {
    "nature-single": {"figsize": (3.5, 2.65), "dpi": 300, "family": "sans-serif", "base": 8.0, "title": 9.0, "label": 8.0, "tick": 7.0, "lw": 1.35, "ax_lw": 0.75},
    "nature-double": {"figsize": (7.2, 3.8), "dpi": 300, "family": "sans-serif", "base": 8.5, "title": 9.5, "label": 8.5, "tick": 7.5, "lw": 1.5, "ax_lw": 0.8},
    "ieee-single": {"figsize": (3.5, 2.5), "dpi": 300, "family": "serif", "base": 8.0, "title": 9.0, "label": 8.0, "tick": 7.0, "lw": 1.3, "ax_lw": 0.75},
    "ieee-double": {"figsize": (7.16, 3.6), "dpi": 300, "family": "serif", "base": 8.5, "title": 9.5, "label": 8.5, "tick": 7.5, "lw": 1.45, "ax_lw": 0.8},
    "elsevier-single": {"figsize": (3.54, 2.65), "dpi": 300, "family": "sans-serif", "base": 8.0, "title": 9.0, "label": 8.0, "tick": 7.0, "lw": 1.35, "ax_lw": 0.75},
    "elsevier-double": {"figsize": (7.48, 3.9), "dpi": 300, "family": "sans-serif", "base": 8.5, "title": 9.5, "label": 8.5, "tick": 7.5, "lw": 1.5, "ax_lw": 0.8},
    "ams-siam": {"figsize": (4.8, 3.2), "dpi": 300, "family": "serif", "base": 9.0, "title": 10.0, "label": 9.0, "tick": 8.0, "lw": 1.4, "ax_lw": 0.8},
    "arxiv-preprint": {"figsize": (5.6, 3.5), "dpi": 300, "family": "serif", "base": 9.5, "title": 10.5, "label": 9.5, "tick": 8.5, "lw": 1.5, "ax_lw": 0.85},
}

PALETTES = {
    "okabe-ito": ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#000000"],
    "nature-npg": ["#E64B35", "#4DBBD5", "#00A087", "#3C5488", "#F39B7F", "#8491B4", "#91D1C2"],
    "ieee-contrast": ["#1B4F72", "#B03A2E", "#117A65", "#7D3C98", "#B7950B", "#2874A6", "#5D6D7E"],
    "viridis-discrete": ["#440154", "#3B528B", "#21918C", "#5EC962", "#FDE725"],
}


def apply_journal_style(preset="nature-single", palette="okabe-ito"):
    spec = PRESETS.get(preset, PRESETS["nature-single"])
    colors = PALETTES.get(palette, PALETTES["okabe-ito"])
    plt.rcParams.update({
        "figure.figsize": spec["figsize"],
        "figure.dpi": spec["dpi"],
        "font.family": spec["family"],
        "font.size": spec["base"],
        "axes.titlesize": spec["title"],
        "axes.titleweight": "semibold",
        "axes.labelsize": spec["label"],
        "xtick.labelsize": spec["tick"],
        "ytick.labelsize": spec["tick"],
        "legend.fontsize": spec["tick"],
        "legend.frameon": False,
        "lines.linewidth": spec["lw"],
        "axes.linewidth": spec["ax_lw"],
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.prop_cycle": plt.cycler(color=colors),
        "pdf.fonttype": 42,
        "ps.fonttype": 42,
        "svg.fonttype": "none",
    })
    return spec, colors


def save_figure(fig, stem="figures/plot", dpi=300):
    clean_stem = (stem or "figures/plot").lstrip("/").rsplit(".", 1)[0]
    parent = os.path.dirname(clean_stem)
    if parent:
        os.makedirs(parent, exist_ok=True)
    for ext in ("pdf", "png", "svg"):
        fig.savefig(f"{clean_stem}.{ext}", dpi=dpi, bbox_inches="tight")
    plt.close(fig)
    return [f"{clean_stem}.{ext}" for ext in ("pdf", "png", "svg")]


def render_spec(spec):
    preset_cfg, colors = apply_journal_style(
        spec.get("preset", "nature-single"),
        spec.get("palette", "okabe-ito"),
    )
    fig, ax = plt.subplots(figsize=preset_cfg["figsize"], dpi=preset_cfg["dpi"])
    kind = spec.get("kind", "line")
    series = spec.get("series") or []

    if kind == "heatmap" and spec.get("heatmap"):
        hm = spec["heatmap"]
        mat = np.asarray(hm["matrix"], dtype=float)
        im = ax.imshow(mat, cmap=hm.get("cmap", "viridis"), aspect="auto")
        fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
        if hm.get("xTicks"):
            ax.set_xticks(range(len(hm["xTicks"])))
            ax.set_xticklabels(hm["xTicks"], rotation=30, ha="right")
        if hm.get("yTicks"):
            ax.set_yticks(range(len(hm["yTicks"])))
            ax.set_yticklabels(hm["yTicks"])
        if hm.get("annotate", True) and mat.size <= 100:
            thresh = float(np.nanmedian(mat))
            for i in range(mat.shape[0]):
                for j in range(mat.shape[1]):
                    val = mat[i, j]
                    ax.text(
                        j, i, f"{val:.2g}",
                        ha="center", va="center",
                        color="white" if val < thresh else "black",
                        fontsize=max(6.0, preset_cfg["tick"] - 0.5),
                    )
    elif kind == "boxplot":
        data = [s.get("values") or s.get("y") or [] for s in series]
        labels = [s.get("label") or f"G{i+1}" for i, s in enumerate(series)]
        bp = ax.boxplot(data, tick_labels=labels, patch_artist=True)
        for idx, patch in enumerate(bp["boxes"]):
            patch.set_facecolor(colors[idx % len(colors)])
            patch.set_alpha(0.72)
    elif kind == "histogram":
        bins = int(spec.get("bins", 20))
        for idx, s in enumerate(series):
            vals = s.get("values") or s.get("y") or []
            ax.hist(
                vals,
                bins=bins,
                alpha=float(s.get("alpha", 0.65)),
                label=s.get("label") or f"Series {idx+1}",
                color=s.get("color") or colors[idx % len(colors)],
                edgecolor="white",
                linewidth=0.5,
            )
    elif kind == "bar":
        count = max(1, len(series))
        first_x = (series[0].get("x") if series else None) or []
        base_idx = np.arange(len(first_x) if first_x else len((series[0].get("y") if series else []) or []))
        width = 0.8 / count
        for idx, s in enumerate(series):
            y = np.asarray(s.get("y") or [], dtype=float)
            offset = (idx - (count - 1) / 2.0) * width
            x_pos = np.arange(len(y)) + offset
            yerr = s.get("yerr")
            ax.bar(
                x_pos, y, width=width * 0.92,
                yerr=yerr, capsize=2.5 if yerr else 0,
                label=s.get("label") or f"Series {idx+1}",
                color=s.get("color") or colors[idx % len(colors)],
                alpha=float(s.get("alpha", 0.9)),
            )
        if first_x and any(isinstance(v, str) for v in first_x):
            ax.set_xticks(base_idx)
            ax.set_xticklabels([str(v) for v in first_x], rotation=20 if len(first_x) > 5 else 0)
    else:
        for idx, s in enumerate(series):
            y = s.get("y") or []
            x = s.get("x") if s.get("x") is not None else list(range(len(y)))
            color = s.get("color") or colors[idx % len(colors)]
            label = s.get("label") or (f"Series {idx+1}" if len(series) > 1 else None)
            alpha = float(s.get("alpha", 0.95))
            if kind == "scatter":
                ax.scatter(x, y, label=label, color=color, marker=s.get("marker", "o"), s=22, alpha=alpha)
            elif kind == "errorbar":
                ax.errorbar(
                    x, y, yerr=s.get("yerr"),
                    label=label, color=color,
                    linestyle=s.get("linestyle", "-"),
                    marker=s.get("marker", "o"),
                    markersize=3.5, capsize=2.5, alpha=alpha,
                )
            else:
                ax.plot(
                    x, y,
                    label=label, color=color,
                    linestyle=s.get("linestyle", "-"),
                    marker=s.get("marker"),
                    markersize=3.5, alpha=alpha,
                )

    if spec.get("title"):
        ax.set_title(spec["title"])
    if spec.get("xLabel"):
        ax.set_xlabel(spec["xLabel"])
    if spec.get("yLabel"):
        ax.set_ylabel(spec["yLabel"])
    if spec.get("xLog"):
        ax.set_xscale("log")
    if spec.get("yLog"):
        ax.set_yscale("log")
    if spec.get("grid", True) and kind != "heatmap":
        ax.grid(True, linestyle=":", linewidth=0.5, alpha=0.45)
    if spec.get("legend", True) and len(series) > 1 and kind not in ("heatmap", "boxplot"):
        ax.legend(loc="best")

    fig.tight_layout()
    saved = save_figure(fig, spec.get("outputStem", "figures/plot"), dpi=preset_cfg["dpi"])
    print("arcana_plot saved:", ", ".join(saved))
    return saved
`;

/**
 * Executes a compact declarative Matplotlib spec using the shared Python
 * `arcana_plot.py` styling and multi-format exporter module.
 */
export async function runMatplotlibSpec(
  spec: MatplotlibSpec,
): Promise<CodeRunResult> {
  const validated = matplotlibSpecSchema.parse(spec);
  return runLocalCode({
    language: "python",
    code: [
      "import json",
      "import arcana_plot",
      'with open("plot_spec.json", "r", encoding="utf-8") as f:',
      "    arcana_plot.render_spec(json.load(f))",
    ].join("\n"),
    files: [
      { path: "arcana_plot.py", content: ARCANA_PLOT_PY },
      {
        path: "plot_spec.json",
        content: JSON.stringify(validated),
      },
    ],
  });
}
