import { describe, expect, it } from "vitest";
import { selectWindow } from "./text-window";

const document = ["line 1", "line 2", "line 3", "line 4", "line 5"].join("\n");

describe("selectWindow", () => {
  it("returns the whole document when it fits", () => {
    const window = selectWindow(document, 0, 1000);
    expect(window.start).toBe(0);
    expect(window.end).toBe(document.length);
    expect(window.text).toBe(document);
    expect(window.startLine).toBe(1);
    expect(window.endLine).toBe(5);
  });

  it("slices around a center without splitting a line", () => {
    const window = selectWindow(document, document.indexOf("line 3"), 20);
    expect(
      window.text.split("\n").every((line) => line.startsWith("line")),
    ).toBe(true);
    expect(document.slice(window.start, window.end)).toBe(window.text);
    // The slice boundaries are line starts: the character before is \n or BOF.
    if (window.start > 0) expect(document[window.start - 1]).toBe("\n");
    if (window.end < document.length) expect(document[window.end]).toBe("\n");
  });

  it("includes the centered line", () => {
    const center = document.indexOf("line 4");
    const window = selectWindow(document, center, 14);
    expect(window.text).toContain("line 4");
  });

  it("round-trips: replacing the slice rebuilds the document", () => {
    const center = document.indexOf("line 3");
    const window = selectWindow(document, center, 20);
    const replacement = window.text.replace("line 3", "LINE THREE");
    const rebuilt =
      document.slice(0, window.start) +
      replacement +
      document.slice(window.end);
    expect(rebuilt).toBe(
      ["line 1", "line 2", "LINE THREE", "line 4", "line 5"].join("\n"),
    );
  });

  it("stays within the budget", () => {
    const window = selectWindow(document, 0, 20);
    expect(window.text.length).toBeLessThanOrEqual(20);
  });

  it("handles an empty document", () => {
    const window = selectWindow("", 0, 10);
    expect(window.text).toBe("");
    expect(window.start).toBe(0);
    expect(window.end).toBe(0);
  });

  it("clamps an out-of-range center", () => {
    const window = selectWindow(document, 10_000, 20);
    expect(window.text.length).toBeGreaterThan(0);
    expect(window.end).toBeLessThanOrEqual(document.length);
  });
});
