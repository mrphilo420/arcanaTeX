import { describe, expect, it } from "vitest";
import { lineDiffStats } from "@/lib/ai/diff-stats";

describe("lineDiffStats", () => {
  it("reports no changes for identical text", () => {
    expect(lineDiffStats("a\nb\nc", "a\nb\nc")).toEqual({
      added: 0,
      removed: 0,
    });
  });

  it("counts a replaced line once in each direction", () => {
    expect(lineDiffStats("a\nb", "a\nc")).toEqual({ added: 1, removed: 1 });
  });

  it("counts insertions and deletions", () => {
    expect(lineDiffStats("a", "a\nb\nc")).toEqual({ added: 2, removed: 0 });
    expect(lineDiffStats("a\nb\nc", "a")).toEqual({ added: 0, removed: 2 });
  });

  it("handles empty files", () => {
    expect(lineDiffStats("", "")).toEqual({ added: 0, removed: 0 });
    expect(lineDiffStats("", "a\nb")).toEqual({ added: 2, removed: 0 });
    expect(lineDiffStats("a\nb", "")).toEqual({ added: 0, removed: 2 });
  });

  it("trims a large unchanged prefix and suffix", () => {
    const prefix = Array.from({ length: 500 }, (_, index) => `line ${index}`);
    const suffix = Array.from({ length: 500 }, (_, index) => `tail ${index}`);

    expect(
      lineDiffStats(
        [...prefix, "old", ...suffix].join("\n"),
        [...prefix, "new", ...suffix].join("\n"),
      ),
    ).toEqual({ added: 1, removed: 1 });
  });

  it("treats a full rewrite as removed plus added", () => {
    expect(lineDiffStats("a\nb", "c\nd\ne")).toEqual({
      added: 3,
      removed: 2,
    });
  });

  it("normalizes CRLF", () => {
    expect(lineDiffStats("a\r\nb", "a\nc")).toEqual({
      added: 1,
      removed: 1,
    });
  });
});
