import { describe, expect, it } from "vitest";
import { type AiFixPatch, applyAiFixPatches } from "./ai-fixes";
import type { ProjectFile } from "./project-files";

function tex(id: string, content: string, path = `${id}.tex`): ProjectFile {
  return { id, name: path, path, type: "tex", content };
}

function patch(overrides: Partial<AiFixPatch> = {}): AiFixPatch {
  return {
    diagnosticId: "d1",
    fileId: "f1",
    filePath: "f1.tex",
    startLine: 1,
    endLine: 1,
    replacement: "replacement",
    explanation: "test",
    confidence: "high",
    ...overrides,
  };
}

describe("applyAiFixPatches", () => {
  it("replaces the requested line range", () => {
    const files = [tex("f1", "alpha\nbeta\ngamma")];
    const result = applyAiFixPatches(files, [
      patch({ startLine: 2, endLine: 2, replacement: "BETA" }),
    ]);

    expect(result.files[0].content).toBe("alpha\nBETA\ngamma");
    expect(result.applied).toHaveLength(1);
    expect(result.skipped).toEqual([]);
  });

  it("applies several patches bottom-up so line numbers do not shift", () => {
    const files = [tex("f1", "one\ntwo\nthree\nfour")];
    const result = applyAiFixPatches(files, [
      patch({
        diagnosticId: "a",
        startLine: 2,
        endLine: 2,
        replacement: "TWO\nEXTRA",
      }),
      patch({
        diagnosticId: "b",
        startLine: 4,
        endLine: 4,
        replacement: "FOUR",
      }),
    ]);

    expect(result.files[0].content).toBe("one\nTWO\nEXTRA\nthree\nFOUR");
    expect(result.applied).toHaveLength(2);
  });

  it("skips a patch that overlaps an earlier one", () => {
    const files = [tex("f1", "one\ntwo\nthree\nfour")];
    const result = applyAiFixPatches(files, [
      patch({ diagnosticId: "a", startLine: 2, endLine: 3 }),
      patch({ diagnosticId: "b", startLine: 3, endLine: 4 }),
    ]);

    expect(result.applied).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].diagnosticId).toBe("b");
    expect(result.skipped[0].reason).toMatch(/overlap/i);
  });

  it("skips a patch for an unknown file", () => {
    const result = applyAiFixPatches(
      [tex("f1", "x")],
      [patch({ fileId: "missing" })],
    );

    expect(result.applied).toHaveLength(0);
    expect(result.skipped[0].reason).toMatch(/unknown or non-TeX/i);
  });

  it("skips a patch for a non-TeX file even if its id exists", () => {
    const binary: ProjectFile = {
      ...tex("f1", "x"),
      type: "binary",
    };
    const result = applyAiFixPatches([binary], [patch()]);

    expect(result.applied).toHaveLength(0);
    expect(result.skipped[0].reason).toMatch(/unknown or non-TeX/i);
  });

  it("rejects an inverted or oversized range", () => {
    const long = Array.from(
      { length: 100 },
      (_, index) => `line ${index}`,
    ).join("\n");

    const inverted = applyAiFixPatches(
      [tex("f1", long)],
      [patch({ startLine: 5, endLine: 4 })],
    );
    expect(inverted.skipped[0].reason).toMatch(/invalid or oversized/i);

    const oversized = applyAiFixPatches(
      [tex("f1", long)],
      [patch({ startLine: 1, endLine: 62 })],
    );
    expect(oversized.skipped[0].reason).toMatch(/invalid or oversized/i);
  });

  it("rejects an oversized replacement", () => {
    const result = applyAiFixPatches(
      [tex("f1", "x")],
      [patch({ replacement: "y".repeat(8_001) })],
    );

    expect(result.applied).toHaveLength(0);
    expect(result.skipped[0].reason).toMatch(/invalid or oversized/i);
  });

  it("normalizes CRLF and a trailing newline in the replacement", () => {
    const result = applyAiFixPatches(
      [tex("f1", "one\ntwo\nthree")],
      [patch({ startLine: 2, endLine: 2, replacement: "A\r\nB\r\n" })],
    );

    expect(result.files[0].content).toBe("one\nA\nB\nthree");
  });

  it("turns a literal backslash-n escape into a real newline", () => {
    const result = applyAiFixPatches(
      [
        tex(
          "f1",
          "\\documentclass{article}\n\\begin{document}\nx\n\\end{document}",
        ),
      ],
      [
        patch({
          startLine: 1,
          endLine: 1,
          replacement:
            "\\documentclass{article}\\n\\setlength{\\emergencystretch}{2em}",
        }),
      ],
    );

    expect(result.files[0].content).toContain(
      "\\documentclass{article}\n\\setlength{\\emergencystretch}{2em}",
    );
    expect(result.files[0].content).not.toContain("article}\\n");
  });

  it("does not rewrite a LaTeX command that starts with \\n", () => {
    const result = applyAiFixPatches(
      [tex("f1", "one")],
      [patch({ replacement: "a \\neq b" })],
    );

    expect(result.files[0].content).toBe("a \\neq b");
  });

  it("leaves other files and the input untouched", () => {
    const original = tex("f1", "one\ntwo");
    const other = tex("f2", "keep me");
    const result = applyAiFixPatches(
      [original, other],
      [patch({ startLine: 1, endLine: 1, replacement: "ONE" })],
    );

    expect(original.content).toBe("one\ntwo");
    expect(result.files[1]).toBe(other);
    expect(result.files[0]).not.toBe(original);
  });

  it("floors fractional line numbers from the model", () => {
    const result = applyAiFixPatches(
      [tex("f1", "one\ntwo\nthree")],
      [patch({ startLine: 2.9, endLine: 2.1, replacement: "TWO" })],
    );

    expect(result.files[0].content).toBe("one\nTWO\nthree");
    expect(result.applied[0].startLine).toBe(2);
    expect(result.applied[0].endLine).toBe(2);
  });
});
