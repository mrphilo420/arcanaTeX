import { describe, expect, it } from "vitest";
import {
  anchorEdit,
  anchorEditSmart,
  applyEdits,
  invertEdit,
  invertEdits,
  offsetsToLineRange,
  reindentReplacement,
  resolveProjectFile,
  lineOffset,
} from "@/lib/ai/file-edits";

describe("anchorEdit", () => {
  it("anchorEdit reports overlapping occurrences as ambiguous", () => {
    expect(anchorEdit("aaa", { find: "aa" })).toEqual({
      ok: false,
      reason: "ambiguous",
      count: 2,
      lines: [1, 1],
    });
  });

  it("applyEdits replaceAll uses non-overlapping matches", () => {
    const r = applyEdits("aaa", [
      { find: "aa", replace: "b", replaceAll: true },
    ]);
    expect(r).toMatchObject({ ok: true, content: "ba" });
    if (r.ok) expect(r.applied).toHaveLength(1);
  });

  it("returns ok with offsets for a unique match", () => {
    expect(anchorEdit("a\nfoo\nb", { find: "foo" })).toEqual({
      ok: true,
      start: 2,
      end: 5,
    });
  });

  it("reports not_found", () => {
    expect(anchorEdit("a\nb", { find: "foo" })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("rejects an empty find", () => {
    expect(anchorEdit("a", { find: "" })).toEqual({
      ok: false,
      reason: "empty_find",
    });
  });

  it("reports ambiguity with count and lines", () => {
    expect(anchorEdit("x\nfoo\nfoo\n", { find: "foo" })).toEqual({
      ok: false,
      reason: "ambiguous",
      count: 2,
      lines: [2, 3],
    });
  });

  it("disambiguates with contextBefore/contextAfter", () => {
    const content = "A foo\nB foo\n";
    expect(anchorEdit(content, { find: "foo", contextBefore: "B " })).toEqual({
      ok: true,
      start: 8,
      end: 11,
    });
    expect(
      anchorEdit(content, { find: "foo", contextAfter: "\n" }),
    ).toMatchObject({ ok: false, reason: "ambiguous" });
  });

  it("matches LF find against CRLF content", () => {
    expect(anchorEdit("a\r\nfoo\r\nb", { find: "a\nfoo" })).toMatchObject({
      ok: true,
    });
  });
});

describe("applyEdits", () => {
  it("replaces a multi-line find", () => {
    const result = applyEdits("x\na\nfoo\nb", [
      { find: "a\nfoo", replace: "bar" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe("x\nbar\nb");
    expect(result.applied[0].before).toBe("a\nfoo");
  });

  it("keeps CRLF", () => {
    const result = applyEdits("a\r\nfoo\r\nb", [
      { find: "foo", replace: "x\ny" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe("a\r\nx\r\ny\r\nb");
    expect(result.content.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("is atomic", () => {
    const result = applyEdits("a foo b", [
      { find: "foo", replace: "bar" },
      { find: "missing", replace: "z" },
    ]);
    expect(result).toEqual({ ok: false, reason: "not_found", editIndex: 1 });
    expect("content" in result).toBe(false);
  });

  it("rejects overlapping edits", () => {
    const result = applyEdits("abcdef", [
      { find: "abcd", replace: "x" },
      { find: "cdef", replace: "y" },
    ]);
    expect(result).toMatchObject({ ok: false, reason: "overlap" });
  });

  it("replaceAll applies every occurrence", () => {
    const result = applyEdits("foo a foo b foo", [
      { find: "foo", replace: "bar", replaceAll: true },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.applied).toHaveLength(3);
    expect(result.content).toBe("bar a bar b bar");
    expect(result.content).not.toContain("foo");
  });

  it("records offsets in the result content", () => {
    const result = applyEdits("aa bb cc", [
      { find: "aa", replace: "longer text" },
      { find: "cc", replace: "Z" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const edit = result.applied[1];
    expect(edit.end).toBe(edit.start + edit.after.length);
    expect(result.content.slice(edit.start, edit.end)).toBe(edit.after);
  });
});

describe("invertEdit", () => {
  it("undoes a clean edit", () => {
    const original = "one\ntwo\nthree";
    const result = applyEdits(original, [{ find: "two", replace: "2" }]);
    if (!result.ok) throw new Error("apply failed");
    expect(invertEdit(result.content, result.applied[0])).toEqual({
      ok: true,
      content: original,
    });
  });

  it("succeeds after an unrelated later edit elsewhere", () => {
    const result = applyEdits("one\ntwo", [{ find: "one", replace: "uno" }]);
    if (!result.ok) throw new Error("apply failed");
    const inverted = invertEdit(
      `${result.content}\nappended`,
      result.applied[0],
    );
    expect(inverted).toEqual({ ok: true, content: "one\ntwo\nappended" });
  });

  it("reports conflict when the edited text changed", () => {
    const result = applyEdits("one\ntwo", [{ find: "one", replace: "uno" }]);
    if (!result.ok) throw new Error("apply failed");
    expect(invertEdit("xyz\ntwo", result.applied[0])).toEqual({
      ok: false,
      reason: "conflict",
    });
  });
});

describe("invertEdits", () => {
  it("reverts several edits in reverse order", () => {
    const original = "alpha\nbeta\ngamma";
    const result = applyEdits(original, [
      { find: "alpha", replace: "ALPHA" },
      { find: "gamma", replace: "GAMMA" },
    ]);
    if (!result.ok) throw new Error("apply failed");

    expect(invertEdits(result.content, result.applied)).toEqual({
      ok: true,
      content: original,
    });
  });

  it("keeps edits made elsewhere after the AI edit", () => {
    const result = applyEdits("one\ntwo", [{ find: "one", replace: "uno" }]);
    if (!result.ok) throw new Error("apply failed");

    expect(invertEdits(`${result.content}\nappended`, result.applied)).toEqual({
      ok: true,
      content: "one\ntwo\nappended",
    });
  });

  it("reports a conflict when any edit no longer matches", () => {
    const result = applyEdits("one\ntwo", [
      { find: "one", replace: "uno" },
      { find: "two", replace: "dos" },
    ]);
    if (!result.ok) throw new Error("apply failed");

    expect(invertEdits("uno\nTWO", result.applied)).toEqual({
      ok: false,
      reason: "conflict",
    });
  });
});

describe("offsetsToLineRange", () => {
  const content = "aaa\nbbb\nccc";

  it("reports a range inside one line", () => {
    expect(offsetsToLineRange(content, 4, 7)).toEqual({
      startLine: 2,
      endLine: 2,
    });
  });

  it("reports a range crossing lines", () => {
    expect(offsetsToLineRange(content, 5, 9)).toEqual({
      startLine: 2,
      endLine: 3,
    });
  });
});

describe("resolveProjectFile", () => {
  const files = [
    { path: "main.tex", name: "main.tex" },
    { path: "chapters/intro.tex", name: "intro.tex" },
  ];

  it("matches by path, name, and suffix", () => {
    expect(resolveProjectFile(files, "main.tex")).toBe(files[0]);
    expect(resolveProjectFile(files, "intro.tex")).toBe(files[1]);
    expect(resolveProjectFile(files, "chapters/intro.tex")).toBe(files[1]);
    expect(resolveProjectFile(files, "s/intro.tex")).toBeUndefined();
    expect(resolveProjectFile(files, "nope.tex")).toBeUndefined();
  });
});

describe("lineOffset", () => {
  const content = "one\ntwo\nthree";

  it("returns the start of a line by default", () => {
    expect(lineOffset(content, 1)).toBe(0);
    expect(lineOffset(content, 2)).toBe(4);
    expect(lineOffset(content, 3)).toBe(8);
  });

  it("returns the end of the line text for after", () => {
    expect(lineOffset(content, 1, "after")).toBe(3);
    expect(lineOffset(content, 2, "after")).toBe(7);
    expect(lineOffset(content, 3, "after")).toBe(13);
  });

  it("rejects an out-of-range or fractional line", () => {
    expect(lineOffset(content, 0)).toBeNull();
    expect(lineOffset(content, 4)).toBeNull();
    expect(lineOffset(content, 1.5)).toBeNull();
  });

  it("handles an empty file as line 1", () => {
    expect(lineOffset("", 1)).toBe(0);
  });

  it("handles a trailing newline as an empty final line", () => {
    expect(lineOffset("one\n", 2)).toBe(4);
  });

  it("keeps offsets correct for CRLF content", () => {
    expect(lineOffset("one\r\ntwo\r\n", 2)).toBe(5);
  });
});

describe("anchorEditSmart and reindentReplacement", () => {
  it("prefers Tier 1 exact match when available", () => {
    const content = "alpha\nbeta\ngamma";
    expect(anchorEditSmart(content, { find: "beta" })).toEqual({
      ok: true,
      start: 6,
      end: 10,
      matchTier: "exact",
    });
  });

  it("uses Tier 2 trimmed-lines match when trailing whitespace differs", () => {
    const content = "first line   \nsecond line  \nthird";
    const res = anchorEditSmart(content, { find: "first line\nsecond line" });
    expect(res).toEqual({
      ok: true,
      start: 0,
      end: 27,
      matchTier: "trimmed-lines",
    });
  });

  it("uses Tier 3 whitespace-normalized match with indentDelta", () => {
    const content = [
      "\\begin{document}",
      "    \\begin{theorem}",
      "        x   =   1",
      "    \\end{theorem}",
      "\\end{document}",
    ].join("\n");
    const find = ["\\begin{theorem}", "  x = 1", "\\end{theorem}"].join("\n");
    const res = anchorEditSmart(content, { find });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.matchTier).toBe("whitespace-normalized");
    expect(res.indentDelta).toBe(4);

    const applied = applyEdits(content, [
      {
        find,
        replace: ["\\begin{theorem}", "  x = 2", "\\end{theorem}"].join("\n"),
        fuzzyFallback: true,
      },
    ]);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.content).toContain(
      "    \\begin{theorem}\n      x = 2\n    \\end{theorem}",
    );
  });

  it("keeps applyEdits exact-only when fuzzyFallback is not enabled", () => {
    const content = "    x   =   1";
    expect(applyEdits(content, [{ find: "x = 1", replace: "x = 2" }])).toEqual({
      ok: false,
      reason: "not_found",
      editIndex: 0,
    });
  });

  it("reports ambiguity in smart tiers instead of picking arbitrarily", () => {
    const content = "  x  =  1\n  x = 1\n";
    const res = anchorEditSmart(content, { find: "x =   1" });
    expect(res).toEqual({
      ok: false,
      reason: "ambiguous",
      count: 2,
      lines: [1, 2],
    });
  });

  it("reindentReplacement adds and strips indentation cleanly", () => {
    expect(reindentReplacement("a\n  b\n\nc", 4)).toBe(
      "    a\n      b\n\n    c",
    );
    expect(reindentReplacement("    a\n      b", -4)).toBe("a\n  b");
    expect(reindentReplacement("a\nb", 0)).toBe("a\nb");
  });
});
