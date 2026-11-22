import { describe, expect, it } from "vitest";
import { minimalChange } from "@/lib/editor-sync";

describe("minimalChange", () => {
  it("returns null for identical text", () => {
    expect(minimalChange("abc", "abc")).toBeNull();
  });

  it("finds an insertion at the start", () => {
    expect(minimalChange("bc", "abc")).toEqual({
      from: 0,
      to: 0,
      insert: "a",
    });
  });

  it("finds an insertion in the middle", () => {
    expect(minimalChange("ac", "abc")).toEqual({
      from: 1,
      to: 1,
      insert: "b",
    });
  });

  it("finds an insertion at the end", () => {
    expect(minimalChange("ab", "abc")).toEqual({
      from: 2,
      to: 2,
      insert: "c",
    });
  });

  it("finds a deletion", () => {
    expect(minimalChange("abc", "ac")).toEqual({
      from: 1,
      to: 2,
      insert: "",
    });
  });

  it("replaces only the changed middle", () => {
    expect(minimalChange("hello world", "hello there")).toEqual({
      from: 6,
      to: 11,
      insert: "there",
    });
  });

  it("handles a full replacement", () => {
    expect(minimalChange("old", "new")).toEqual({
      from: 0,
      to: 3,
      insert: "new",
    });
  });

  it("does not swallow repeated characters at the boundary", () => {
    expect(minimalChange("aaab", "aaac")).toEqual({
      from: 3,
      to: 4,
      insert: "c",
    });
  });
});
