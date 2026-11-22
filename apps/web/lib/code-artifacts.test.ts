import { describe, expect, it } from "vitest";
import {
  codeArtifactToDataUrl,
  downloadCodeArtifact,
  FIGURE_ARTIFACT_EXTENSIONS,
  isFigureArtifactPath,
} from "./code-artifacts";

describe("code-artifacts", () => {
  it("recognizes publication figure artifact extensions case-insensitively", () => {
    expect(FIGURE_ARTIFACT_EXTENSIONS.has("pdf")).toBe(true);
    expect(isFigureArtifactPath("figures/loss_curve.PDF")).toBe(true);
    expect(isFigureArtifactPath("figures/heatmap.png")).toBe(true);
    expect(isFigureArtifactPath("figures/diagram.svg")).toBe(true);
    expect(isFigureArtifactPath("figures/summary.csv")).toBe(false);
    expect(isFigureArtifactPath("scripts/plot.R")).toBe(false);
  });

  it("serializes base64 and utf-8 code artifacts into data URLs", () => {
    const pngUrl = codeArtifactToDataUrl({
      path: "figures/chart.png",
      mimeType: "image/png",
      encoding: "base64",
      content: "QUJDRA==",
      truncated: false,
      bytes: 4,
    });
    expect(pngUrl).toBe("data:image/png;base64,QUJDRA==");

    const svgUrl = codeArtifactToDataUrl({
      path: "figures/plot.svg",
      mimeType: "image/svg+xml",
      encoding: "utf-8",
      content: "<svg></svg>",
      truncated: false,
      bytes: 11,
    });
    expect(svgUrl.startsWith("data:image/svg+xml;")).toBe(true);
    expect(() =>
      downloadCodeArtifact({
        path: "figures/plot.svg",
        mimeType: "image/svg+xml",
        encoding: "utf-8",
        content: "<svg></svg>",
        truncated: false,
        bytes: 11,
      }),
    ).not.toThrow();
  });
});
