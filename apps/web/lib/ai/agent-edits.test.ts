import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/projects/repository", () => ({
  createProjectVersion: vi.fn(async () => ({})),
}));

import { applyAgentEdit, undoAgentTurn } from "@/lib/ai/agent-edits";
import { useAgentChangesStore } from "@/stores/agent-changes-store";
import { useDocumentStore } from "@/stores/document-store";

function seedProject() {
  useDocumentStore.setState({
    projectId: "project-1",
    projectName: "Test project",
    createdAt: Date.now(),
    files: [
      {
        id: "main",
        name: "main.tex",
        path: "main.tex",
        type: "tex",
        content: "one\ntwo",
      },
    ],
    activeFileId: "main",
    mainFileId: "main",
    compiler: "pdflatex",
    comments: [],
  });
}

function currentContent(): string {
  return (
    useDocumentStore.getState().files.find((file) => file.id === "main")
      ?.content ?? ""
  );
}

beforeEach(() => {
  useAgentChangesStore.getState().clearAll();
  seedProject();
});

describe("applyAgentEdit", () => {
  it("applies and records an anchored edit", async () => {
    const result = await applyAgentEdit({
      turnId: "turn-1",
      toolCallId: "tool-1",
      fileId: "main",
      before: "one\ntwo",
      after: "uno\ntwo",
      applied: [{ start: 0, end: 3, before: "one", after: "uno" }],
    });

    expect(result.ok).toBe(true);
    expect(currentContent()).toBe("uno\ntwo");
    expect(
      useAgentChangesStore.getState().changesForTurn("turn-1"),
    ).toHaveLength(1);
  });

  it("rejects an edit when the file changed first", async () => {
    useDocumentStore.getState().updateFileContent("main", "changed");

    const result = await applyAgentEdit({
      turnId: "turn-1",
      toolCallId: "tool-1",
      fileId: "main",
      before: "one\ntwo",
      after: "uno\ntwo",
      applied: [{ start: 0, end: 3, before: "one", after: "uno" }],
    });

    expect(result).toEqual({ ok: false, reason: "conflict" });
    expect(currentContent()).toBe("changed");
    expect(useAgentChangesStore.getState().changes).toHaveLength(0);
  });

  it("does not record a no-op", async () => {
    const result = await applyAgentEdit({
      turnId: "turn-1",
      toolCallId: "tool-1",
      fileId: "main",
      before: "one\ntwo",
      after: "one\ntwo",
      applied: [],
    });

    expect(result).toEqual({ ok: true, change: null });
    expect(useAgentChangesStore.getState().changes).toHaveLength(0);
  });
});

describe("undoAgentTurn", () => {
  it("restores the file after a recorded edit", async () => {
    await applyAgentEdit({
      turnId: "turn-1",
      toolCallId: "tool-1",
      fileId: "main",
      before: "one\ntwo",
      after: "uno\ntwo",
      applied: [{ start: 0, end: 3, before: "one", after: "uno" }],
    });

    expect(undoAgentTurn("turn-1")).toEqual({ ok: true });
    expect(currentContent()).toBe("one\ntwo");
    expect(useAgentChangesStore.getState().changes).toHaveLength(0);
  });

  it("refuses to undo when the edited text changed", async () => {
    await applyAgentEdit({
      turnId: "turn-1",
      toolCallId: "tool-1",
      fileId: "main",
      before: "one\ntwo",
      after: "uno\ntwo",
      applied: [{ start: 0, end: 3, before: "one", after: "uno" }],
    });
    useDocumentStore.getState().updateFileContent("main", "UNO\ntwo");

    expect(undoAgentTurn("turn-1")).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(currentContent()).toBe("UNO\ntwo");
  });

  it("keeps later edits that do not overlap the AI change", async () => {
    await applyAgentEdit({
      turnId: "turn-1",
      toolCallId: "tool-1",
      fileId: "main",
      before: "one\ntwo",
      after: "uno\ntwo",
      applied: [{ start: 0, end: 3, before: "one", after: "uno" }],
    });
    useDocumentStore.getState().updateFileContent("main", "uno\ntwo\nthree");

    expect(undoAgentTurn("turn-1")).toEqual({ ok: true });
    expect(currentContent()).toBe("one\ntwo\nthree");
  });
});
