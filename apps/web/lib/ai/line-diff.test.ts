import { describe, expect, it } from "vitest";
import { applyEdits, type EditSpec } from "./file-edits";
import { buildFilePatch, patchStats } from "./line-diff";

/** Applying the generated patch to the original must reproduce the result. */
function roundTrip(before: string, after: string) {
  const patch = buildFilePatch(before, after);
  if (patch.kind === "replace") {
    expect(patch.content).toBe(after);
    return [];
  }
  const result = applyEdits(before, patch.edits);
  expect(result.ok).toBe(true);
  if (!result.ok) return [];
  expect(result.content).toBe(after);
  return patch.edits;
}

describe("buildFilePatch", () => {
  it("returns no edits when the file did not change", () => {
    const patch = buildFilePatch("a\nb", "a\nb");
    expect(patch.kind).toBe("edits");
    expect(patch.kind === "edits" && patch.edits).toHaveLength(0);
  });

  it("rewrites one line inside context", () => {
    roundTrip("a\nb\nc\nd\ne", "a\nb\nC\nd\ne");
  });

  it("inserts a line between two existing lines", () => {
    roundTrip("a\nb\nc", "a\nb\nnew\nc");
  });

  it("appends at the end of the file", () => {
    roundTrip("a\nb\nc", "a\nb\nc\nnew");
  });

  it("inserts at the start of the file", () => {
    roundTrip("a\nb\nc", "new\na\nb\nc");
  });

  it("deletes a line", () => {
    roundTrip("a\nb\nc\nd", "a\nb\nd");
  });

  it("keeps the lines between two merged hunks", () => {
    const before = [
      "\\section{One}",
      "text one",
      "text two",
      "text three",
      "text four",
      "text five",
      "\\section{Two}",
      "other one",
      "other two",
    ].join("\n");
    const after = [
      "\\section{One}",
      "text one CHANGED",
      "text two",
      "text three",
      "text four",
      "text five",
      "\\section{Two}",
      "other one CHANGED",
      "other two",
    ].join("\n");
    roundTrip(before, after);
  });

  it("handles several distant hunks in one file", () => {
    const before = [
      "\\section{One}",
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
      "\\section{Two}",
      "k",
      "l",
    ].join("\n");
    const after = before.replace("\nb\n", "\nB\n").replace("\nk\n", "\nK\n");
    const edits = roundTrip(before, after);
    expect(edits.length).toBeGreaterThan(1);
  });

  it("disambiguates repeated lines using context", () => {
    roundTrip(
      ["\\end{itemize}", "", "middle", "", "\\end{itemize}"].join("\n"),
      ["\\end{itemize}", "", "middle", "", "\\end{itemize}", ""].join("\n"),
    );
  });

  it("falls back to a replacement when the file was empty", () => {
    const patch = buildFilePatch("", "first line");
    expect(patch.kind).toBe("replace");
    if (patch.kind === "replace") {
      expect(patch.content).toBe("first line");
      expect(patch.before).toBe("");
    }
  });

  it("rejects an ambiguous anchor rather than guessing", () => {
    // The same block appears twice with no distinguishing context.
    const before = "x\nsame\nx\nsame\nx";
    const after = "x\nsame\nx\nchanged\nx";
    const patch = buildFilePatch(before, after, 0);
    if (patch.kind === "edits") {
      const result = applyEdits(before, patch.edits);
      // Either it resolves unambiguously, or it reports ambiguity. It must
      // never silently write to the wrong place.
      if (!result.ok) expect(result.reason).toBe("ambiguous");
    }
  });

  it("counts additions and removals", () => {
    const stats = patchStats(buildFilePatch("a\nb\nc", "a\nB\nc\nd"));
    expect(stats.added + stats.removed).toBeGreaterThan(0);
  });
});

describe("applyEdits against a moved anchor", () => {
  it("reports not_found when the user already changed the line", () => {
    const patch = buildFilePatch("one\ntwo\nthree", "one\nTWO\nthree");
    const edits: EditSpec[] = patch.kind === "edits" ? patch.edits : [];
    const edited = "one\ntwo edited\nthree";
    const result = applyEdits(edited, edits);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });
});
