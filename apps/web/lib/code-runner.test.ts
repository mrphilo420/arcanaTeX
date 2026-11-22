import { describe, expect, it } from "vitest";
import {
  MAX_INPUT_FILES,
  MAX_INPUT_FILE_CHARS,
  probeCodeRuntimes,
  runLocalCode,
} from "./code-runner";

describe("code-runner", () => {
  it("exposes upgraded input file limits", () => {
    expect(MAX_INPUT_FILES).toBe(16);
    expect(MAX_INPUT_FILE_CHARS).toBe(200_000);
  });

  it("probes local Python and R runtimes", async () => {
    const status = await probeCodeRuntimes({ force: true });
    expect(status.python).toBeDefined();
    expect(status.r).toBeDefined();
    expect(status.python.available).toBe(true);
    expect(status.python.packages).toContain("matplotlib");
    expect(status.r.available).toBe(true);
  }, 20_000);

  it("skips unchanged input files while collecting newly created and modified artifacts", async () => {
    const result = await runLocalCode({
      language: "python",
      files: [
        {
          path: "data/measurements.csv",
          content: "x,y\n1,2\n3,4\n",
        },
        {
          path: "notes.txt",
          content: "initial",
        },
      ],
      code: [
        "from pathlib import Path",
        'rows = Path("data/measurements.csv").read_text().strip().splitlines()',
        'Path("output.tex").write_text(f"% rows={len(rows)}\\n\\\\begin{{tikzpicture}}\\\\end{{tikzpicture}}\\n")',
        'Path("notes.txt").write_text("modified")',
        'print("done")',
      ].join("\n"),
    });

    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe("done");
    const paths = result.artifacts.map((artifact) => artifact.path);
    expect(paths).toContain("output.tex");
    expect(paths).toContain("notes.txt");
    expect(paths).not.toContain("data/measurements.csv");

    const outputTex = result.artifacts.find((a) => a.path === "output.tex");
    expect(outputTex?.encoding).toBe("utf-8");
    expect(outputTex?.content).toContain("\\begin{tikzpicture}");
  }, 15_000);

  it("executes Python matplotlib inside runLocalCode and collects binary PDF/PNG and text SVG figure artifacts", async () => {
    const result = await runLocalCode({
      language: "python",
      code: [
        "import os",
        "import numpy as np",
        "import matplotlib.pyplot as plt",
        'os.makedirs("figures", exist_ok=True)',
        "x = np.linspace(0, 2 * np.pi, 40)",
        "y = np.sin(x)",
        "fig, ax = plt.subplots(figsize=(3.5, 2.5), dpi=300)",
        'ax.plot(x, y, color="#0072B2", linewidth=1.5)',
        'ax.set_xlabel("Phase $x$")',
        'ax.set_ylabel("Amplitude")',
        'fig.savefig("figures/wave.pdf")',
        'fig.savefig("figures/wave.png", dpi=200)',
        'fig.savefig("figures/wave.svg")',
        "plt.close(fig)",
        'print("matplotlib-ok")',
      ].join("\n"),
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("matplotlib-ok");

    const pdfArtifact = result.artifacts.find(
      (a) => a.path === "figures/wave.pdf",
    );
    const pngArtifact = result.artifacts.find(
      (a) => a.path === "figures/wave.png",
    );
    const svgArtifact = result.artifacts.find(
      (a) => a.path === "figures/wave.svg",
    );

    expect(pdfArtifact).toBeDefined();
    expect(pdfArtifact?.encoding).toBe("base64");
    expect(pdfArtifact?.mimeType).toBe("application/pdf");
    expect((pdfArtifact?.bytes ?? 0) > 500).toBe(true);
    expect(
      Buffer.from(pdfArtifact?.content ?? "", "base64")
        .subarray(0, 4)
        .toString("ascii"),
    ).toBe("%PDF");

    expect(pngArtifact).toBeDefined();
    expect(pngArtifact?.encoding).toBe("base64");
    expect(pngArtifact?.mimeType).toBe("image/png");
    expect((pngArtifact?.bytes ?? 0) > 500).toBe(true);

    expect(svgArtifact).toBeDefined();
    expect(svgArtifact?.encoding).toBe("utf-8");
    expect(svgArtifact?.mimeType).toBe("image/svg+xml");
    expect(svgArtifact?.content).toContain("<svg");
  }, 45_000);

  it("executes Rscript (ggplot2 with base-R fallback) inside runLocalCode and collects binary figure artifacts", async () => {
    const result = await runLocalCode({
      language: "r",
      code: [
        'dir.create("figures", showWarnings = FALSE, recursive = TRUE)',
        "df <- data.frame(x = 1:8, y = c(1.2, 2.3, 3.1, 4.0, 5.2, 5.9, 7.1, 8.0))",
        'if (requireNamespace("ggplot2", quietly = TRUE)) {',
        "  library(ggplot2)",
        '  p <- ggplot(df, aes(x = x, y = y)) + geom_line(color = "#0072B2") + geom_point(color = "#D55E00") + theme_minimal(base_size = 8)',
        '  ggsave("figures/r-test.pdf", plot = p, width = 3.5, height = 2.5)',
        '  ggsave("figures/r-test.png", plot = p, width = 3.5, height = 2.5, dpi = 200)',
        "} else {",
        '  pdf("figures/r-test.pdf", width = 3.5, height = 2.5)',
        '  plot(df$x, df$y, type = "b", col = "#0072B2")',
        "  dev.off()",
        '  png("figures/r-test.png", width = 700, height = 500, res = 200)',
        '  plot(df$x, df$y, type = "b", col = "#0072B2")',
        "  dev.off()",
        "}",
        'cat("rscript-ok\\n")',
      ].join("\n"),
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("rscript-ok");

    const pdfArtifact = result.artifacts.find(
      (a) => a.path === "figures/r-test.pdf",
    );
    const pngArtifact = result.artifacts.find(
      (a) => a.path === "figures/r-test.png",
    );

    expect(pdfArtifact).toBeDefined();
    expect(pdfArtifact?.encoding).toBe("base64");
    expect(pdfArtifact?.mimeType).toBe("application/pdf");
    expect((pdfArtifact?.bytes ?? 0) > 500).toBe(true);

    expect(pngArtifact).toBeDefined();
    expect(pngArtifact?.encoding).toBe("base64");
    expect(pngArtifact?.mimeType).toBe("image/png");
    expect((pngArtifact?.bytes ?? 0) > 500).toBe(true);
  }, 45_000);
});
