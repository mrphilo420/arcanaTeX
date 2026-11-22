import { describe, expect, it } from "vitest";
import { summarizeTurnChanges } from "@/lib/ai/merge-summary";
import type { AgentFileChange } from "@/stores/agent-changes-store";

function change(overrides: Partial<AgentFileChange>): AgentFileChange {
  return {
    id: crypto.randomUUID(),
    turnId: "turn-1",
    toolCallId: "tool-1",
    kind: "edit",
    fileId: "main",
    filePath: "main.tex",
    before: "a\nb",
    after: "a\nc",
    applied: [{ start: 2, end: 3, before: "b", after: "c" }],
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("summarizeTurnChanges", () => {
  it("groups changes by file and diffs first before to last after", () => {
    const summary = summarizeTurnChanges([
      change({ before: "a\nb", after: "a\nc" }),
      change({ before: "a\nc", after: "a\nd" }),
    ]);

    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({
      fileId: "main",
      filePath: "main.tex",
      kind: "modified",
      added: 1,
      removed: 1,
    });
  });

  it("separates files and preserves their order", () => {
    const summary = summarizeTurnChanges([
      change({ fileId: "main", filePath: "main.tex" }),
      change({ fileId: "intro", filePath: "sections/intro.tex" }),
    ]);

    expect(summary.map((file) => file.filePath)).toEqual([
      "main.tex",
      "sections/intro.tex",
    ]);
  });

  it("labels created files and starts them at line 1", () => {
    const summary = summarizeTurnChanges([
      change({
        kind: "create",
        fileId: "new",
        filePath: "sections/new.tex",
        before: "",
        after: "one\ntwo",
        applied: [{ start: 0, end: 7, before: "", after: "one\ntwo" }],
      }),
    ]);

    expect(summary[0]).toMatchObject({
      kind: "created",
      added: 2,
      removed: 0,
      firstLine: 1,
    });
  });

  it("reports the first changed line", () => {
    const summary = summarizeTurnChanges([
      change({
        before: "one\ntwo\nthree",
        after: "one\nTWO\nthree",
        applied: [{ start: 4, end: 7, before: "two", after: "TWO" }],
      }),
    ]);

    expect(summary[0].firstLine).toBe(2);
  });
});
