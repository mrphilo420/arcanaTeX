import { describe, expect, it } from "vitest";
import {
  MINIMAP_LINE_STRIDE,
  MINIMAP_MIN_SLIDER_HEIGHT,
  classifyMinimapLine,
  computeMinimapGeometry,
  scrollTopForMinimapY,
} from "./minimap-layout";

describe("minimap-layout", () => {
  it("keeps minimapScrollTop at 0 and scales slider inside contentHeight for short documents", () => {
    const geom = computeMinimapGeometry({
      lineCount: 40,
      containerHeight: 600,
      scrollTop: 150,
      scrollHeight: 900,
      clientHeight: 600,
    });

    expect(geom.contentHeight).toBe(40 * MINIMAP_LINE_STRIDE);
    expect(geom.minimapScrollTop).toBe(0);
    expect(geom.maxEditorScroll).toBe(300);
    expect(geom.scrollRatio).toBeCloseTo(0.5);
    expect(geom.sliderHeight).toBeCloseTo((600 / 900) * 120);
    expect(geom.sliderTop).toBeCloseTo(0.5 * (120 - geom.sliderHeight));
  });

  it("scrolls minimap and slider proportionally for long documents", () => {
    const common = {
      lineCount: 1000,
      containerHeight: 500,
      scrollHeight: 20_000,
      clientHeight: 500,
    };

    const atTop = computeMinimapGeometry({ ...common, scrollTop: 0 });
    expect(atTop.contentHeight).toBe(1000 * MINIMAP_LINE_STRIDE);
    expect(atTop.minimapScrollTop).toBe(0);
    expect(atTop.sliderTop).toBe(0);
    expect(atTop.sliderHeight).toBeGreaterThanOrEqual(
      MINIMAP_MIN_SLIDER_HEIGHT,
    );

    const atMid = computeMinimapGeometry({
      ...common,
      scrollTop: (20_000 - 500) / 2,
    });
    expect(atMid.scrollRatio).toBeCloseTo(0.5);
    expect(atMid.minimapScrollTop).toBeCloseTo((3000 - 500) / 2);
    expect(atMid.sliderTop).toBeCloseTo(atMid.maxSliderTop / 2);

    const atBottom = computeMinimapGeometry({
      ...common,
      scrollTop: 20_000 - 500,
    });
    expect(atBottom.scrollRatio).toBe(1);
    expect(atBottom.minimapScrollTop).toBe(3000 - 500);
    expect(atBottom.sliderTop).toBeCloseTo(atBottom.maxSliderTop);
  });

  it("maps pointer coordinates back to editor scrollTop with clamping and drag offset", () => {
    const geom = computeMinimapGeometry({
      lineCount: 1000,
      containerHeight: 500,
      scrollTop: 0,
      scrollHeight: 20_000,
      clientHeight: 500,
    });

    expect(scrollTopForMinimapY(-50, 10, geom)).toBe(0);
    expect(scrollTopForMinimapY(1000, 10, geom)).toBe(geom.maxEditorScroll);

    const midPointerY = geom.maxSliderTop / 2 + 12;
    expect(scrollTopForMinimapY(midPointerY, 12, geom)).toBeCloseTo(
      geom.maxEditorScroll / 2,
    );
  });

  it("classifies LaTeX sections, commands, math, comments, and indented text", () => {
    expect(classifyMinimapLine("  \\section{Introduction}", "latex")).toEqual([
      { startCol: 2, length: 22, role: "section" },
    ]);

    expect(classifyMinimapLine("  % TODO: check proof", "latex")).toEqual([
      { startCol: 2, length: 19, role: "comment" },
    ]);

    const mixed = classifyMinimapLine(
      "  \\textbf{Let} $x^2$ be % note",
      "latex",
    );
    expect(mixed.some((s) => s.role === "command")).toBe(true);
    expect(mixed.some((s) => s.role === "math")).toBe(true);
    expect(mixed.some((s) => s.role === "comment")).toBe(true);
    expect(mixed.some((s) => s.role === "text")).toBe(true);
  });
});
