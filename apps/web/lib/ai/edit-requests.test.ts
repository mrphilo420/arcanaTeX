import { describe, expect, it } from "vitest";

import { planFindAndReplace, planPatch, type FileLike } from "./edit-requests";

const files: FileLike[] = [
  {
    id: "a",
    path: "main.tex",
    name: "main.tex",
    type: "tex",
    content: "Hello world\nfoo\nfoo\n",
  },
  {
    id: "b",
    path: "chapters/two.tex",
    name: "two.tex",
    type: "tex",
    content: "Chapter two\n",
  },
  { id: "c", path: "fig.png", name: "fig.png", type: "image", content: null },
];

describe("planFindAndReplace", () => {
  it("uses the active file when path is omitted", () => {
    const r = planFindAndReplace(files, "a", {
      find: "Hello",
      replace: "Howdy",
    });
    expect(r).toMatchObject({ success: true, fileId: "a", replacements: 1 });
    if (r.success) expect(r.newContent).toBe("Howdy world\nfoo\nfoo\n");
  });

  it("targets another file by path", () => {
    const r = planFindAndReplace(files, "a", {
      find: "two",
      replace: "2",
      path: "chapters/two.tex",
    });
    expect(r).toMatchObject({
      success: true,
      fileId: "b",
      newContent: "Chapter 2\n",
    });
  });

  it("errors when the file is not found", () => {
    const r = planFindAndReplace(files, "a", {
      find: "x",
      replace: "y",
      path: "nope.tex",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("File not found: nope.tex");
  });

  it("errors on a binary file", () => {
    const r = planFindAndReplace(files, "a", {
      find: "x",
      replace: "y",
      path: "fig.png",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("Cannot edit a binary file");
  });

  it("errors when find is not found", () => {
    const r = planFindAndReplace(files, "a", { find: "zzz", replace: "y" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("Could not find");
  });

  it("reports ambiguity with count and lines", () => {
    const r = planFindAndReplace(files, "a", { find: "foo", replace: "bar" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("matches 2 places");
      expect(r.error).toContain("lines 2, 3");
      expect(r.error).toContain("contextBefore");
    }
  });

  it("replaceAll replaces every match and reports the count", () => {
    const fs: FileLike[] = [
      {
        id: "a",
        path: "main.tex",
        name: "main.tex",
        type: "tex",
        content: "a a a",
      },
    ];
    const r = planFindAndReplace(fs, "a", {
      find: "a",
      replace: "b",
      replaceAll: true,
    });
    expect(r).toMatchObject({
      success: true,
      replacements: 3,
      newContent: "b b b",
    });
  });

  it("rejects a no-op", () => {
    const r = planFindAndReplace(files, "a", {
      find: "Hello",
      replace: "Hello",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("identical");
  });

  it("keeps CRLF", () => {
    const fs: FileLike[] = [
      {
        id: "a",
        path: "main.tex",
        name: "main.tex",
        type: "tex",
        content: "one\r\ntwo\r\nthree\r\n",
      },
    ];
    const r = planFindAndReplace(fs, "a", {
      find: "one\ntwo",
      replace: "1\n2",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.newContent).toBe("1\r\n2\r\nthree\r\n");
      expect(r.newContent.replace(/\r\n/g, "")).not.toContain("\n");
    }
  });

  it("rejects an empty find even when replace is empty", () => {
    const r = planFindAndReplace(files, "a", { find: "", replace: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("must not be empty");
  });

  it("treats CRLF and LF variants of the same text as identical", () => {
    const r = planFindAndReplace(files, "a", { find: "a\r\n", replace: "a\n" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("identical");
  });
});

describe("planPatch", () => {
  it("line-range patch behaves as before", () => {
    expect(
      planPatch("a\nb\nc", { startLine: 2, endLine: 2, replacement: "X" }),
    ).toEqual({
      ok: true,
      startLine: 2,
      endLine: 2,
      before: "b",
      after: "X",
    });
  });

  it("rejects a reversed range", () => {
    expect(
      planPatch("a\nb\nc", { startLine: 3, endLine: 2, replacement: "X" }),
    ).toEqual({
      ok: false,
      error: "endLine must be >= startLine.",
    });
  });

  it("rejects a range outside the file", () => {
    expect(
      planPatch("a\nb", { startLine: 5, endLine: 5, replacement: "X" }),
    ).toEqual({
      ok: false,
      error: "Line range is outside the file (2 lines).",
    });
  });

  it("rejects a range over 300 lines", () => {
    const content = Array.from({ length: 400 }, (_, i) => `l${i}`).join("\n");
    expect(
      planPatch(content, { startLine: 1, endLine: 302, replacement: "X" }),
    ).toEqual({
      ok: false,
      error: "Patch is too large to review safely.",
    });
  });

  it("rejects an identical replacement", () => {
    expect(
      planPatch("a\nb\nc", { startLine: 2, endLine: 2, replacement: "b" }),
    ).toEqual({
      ok: false,
      error: "The replacement is identical.",
    });
  });

  it("requires oldText or both lines", () => {
    expect(planPatch("a", { replacement: "X" })).toEqual({
      ok: false,
      error: "Provide oldText or both startLine and endLine.",
    });
    expect(planPatch("a", { startLine: 1, replacement: "X" })).toMatchObject({
      ok: false,
      error: "Provide oldText or both startLine and endLine.",
    });
  });

  it("oldText anchors to whole lines", () => {
    expect(planPatch("a\nb\nc", { oldText: "b", replacement: "X" })).toEqual({
      ok: true,
      startLine: 2,
      endLine: 2,
      before: "b",
      after: "X",
    });
  });

  it("oldText as a mid-line fragment keeps the rest of the line", () => {
    expect(
      planPatch("let x := foo bar\n", { oldText: "foo", replacement: "baz" }),
    ).toEqual({
      ok: true,
      startLine: 1,
      endLine: 1,
      before: "let x := foo bar",
      after: "let x := baz bar",
    });
  });

  it("multi-line oldText spans lines", () => {
    expect(
      planPatch("a\nb\nc\nd", { oldText: "b\nc", replacement: "X" }),
    ).toEqual({
      ok: true,
      startLine: 2,
      endLine: 3,
      before: "b\nc",
      after: "X",
    });
  });

  it("oldText ignores stale line numbers", () => {
    expect(
      planPatch("a\nb\nc", {
        startLine: 1,
        endLine: 1,
        oldText: "c",
        replacement: "X",
      }),
    ).toMatchObject({
      ok: true,
      startLine: 3,
      endLine: 3,
      before: "c",
      after: "X",
    });
  });

  it("handles CRLF content", () => {
    expect(
      planPatch("a\r\nb\r\nc", { oldText: "b", replacement: "X" }),
    ).toEqual({
      ok: true,
      startLine: 2,
      endLine: 2,
      before: "b",
      after: "X",
    });
    expect(
      planPatch("let x := foo bar\r\nnext\r\n", {
        oldText: "foo",
        replacement: "baz",
      }),
    ).toEqual({
      ok: true,
      startLine: 1,
      endLine: 1,
      before: "let x := foo bar",
      after: "let x := baz bar",
    });
  });

  it("enforces the 300-line limit for oldText", () => {
    const lines = Array.from({ length: 400 }, (_, i) => `l${i}`);
    const oldText = lines.slice(0, 303).join("\n");
    expect(planPatch(lines.join("\n"), { oldText, replacement: "X" })).toEqual({
      ok: false,
      error: "Patch is too large to review safely.",
    });
  });

  it("oldText with a trailing newline substitutes exactly", () => {
    expect(planPatch("a\nb\nc", { oldText: "b\n", replacement: "X" })).toEqual({
      ok: true,
      startLine: 2,
      endLine: 3,
      before: "b\nc",
      after: "Xc",
    });
  });

  it("oldText with a trailing newline can delete the line", () => {
    expect(planPatch("a\nb\nc", { oldText: "b\n", replacement: "" })).toEqual({
      ok: true,
      startLine: 2,
      endLine: 3,
      before: "b\nc",
      after: "c",
    });
  });

  it("oldText with a trailing newline is not identical when it joins lines", () => {
    expect(planPatch("a\nb\nc", { oldText: "b\n", replacement: "b" })).toEqual({
      ok: true,
      startLine: 2,
      endLine: 3,
      before: "b\nc",
      after: "bc",
    });
  });

  it("oldText with a trailing newline at the end of the file reaches the empty last line", () => {
    const content = "a\nb\n";
    const r = planPatch(content, { oldText: "b\n", replacement: "X" });
    expect(r).toEqual({
      ok: true,
      startLine: 2,
      endLine: 3,
      before: "b\n",
      after: "X",
    });
    if (r.ok) {
      // Matches the review dialog's recompute from the line range.
      expect(
        content
          .split("\n")
          .slice(r.startLine - 1, r.endLine)
          .join("\n"),
      ).toBe(r.before);
    }
  });

  it("reports not found and ambiguity", () => {
    expect(planPatch("a\nb", { oldText: "zzz", replacement: "X" })).toEqual({
      ok: false,
      error: "oldText was not found in the file.",
    });
    expect(
      planPatch("foo\nx\nfoo", { oldText: "foo", replacement: "X" }),
    ).toEqual({
      ok: false,
      error:
        "oldText matches 2 places (lines 1, 3). Include more surrounding text.",
    });
  });

  it("falls back to smart anchoring when oldText differs only in whitespace or indent", () => {
    const content = [
      "\\begin{document}",
      "    \\begin{lemma}",
      "        a   =   b",
      "    \\end{lemma}",
      "\\end{document}",
    ].join("\n");
    const plan = planPatch(content, {
      oldText: "\\begin{lemma}\n  a = b\n\\end{lemma}",
      replacement: "\\begin{lemma}\n  a = c\n\\end{lemma}",
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.after).toBe(
      "    \\begin{lemma}\n      a = c\n    \\end{lemma}",
    );
    expect(plan.integrityWarnings).toBeUndefined();
  });

  it("reports integrityWarnings when a patch introduces unclosed braces or math", () => {
    const content = "\\begin{document}\n$x = 1$\n\\end{document}";
    const plan = planPatch(content, {
      oldText: "$x = 1$",
      replacement: "$x = {1",
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.integrityWarnings).toBeDefined();
    expect(plan.integrityWarnings?.some((w) => w.includes("L01"))).toBe(true);
    expect(plan.integrityWarnings?.some((w) => w.includes("L03"))).toBe(true);
  });

  it("planFindAndReplace falls back to smart match and reports integrityWarnings", () => {
    const texFiles: FileLike[] = [
      {
        id: "t1",
        path: "main.tex",
        name: "main.tex",
        type: "tex",
        content: "\\begin{document}\n  $a   +   b$\n\\end{document}\n",
      },
    ];
    const plan = planFindAndReplace(texFiles, "t1", {
      find: "$a + b$",
      replace: "$a + \\left(b$",
    });
    expect(plan.success).toBe(true);
    if (!plan.success) return;
    expect(plan.newContent).toContain("$a + \\left(b$");
    expect(plan.integrityWarnings?.some((w) => w.includes("L04"))).toBe(true);
  });
});
