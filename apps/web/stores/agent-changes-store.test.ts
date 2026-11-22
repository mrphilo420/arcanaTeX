import { beforeEach, describe, expect, it } from "vitest";
import { useAgentChangesStore } from "@/stores/agent-changes-store";

const applied = [{ start: 0, end: 1, before: "a", after: "b" }];

function recordChange(turnId: string, fileId = "file-1") {
  return useAgentChangesStore.getState().record({
    turnId,
    toolCallId: `tool-${turnId}-${fileId}`,
    kind: "edit",
    fileId,
    filePath: `${fileId}.tex`,
    before: "a",
    after: "b",
    applied,
  });
}

beforeEach(() => {
  useAgentChangesStore.getState().clearAll();
});

describe("agent changes store", () => {
  it("groups changes by turn", () => {
    recordChange("turn-1");
    recordChange("turn-1");
    recordChange("turn-2");

    expect(
      useAgentChangesStore.getState().changesForTurn("turn-1"),
    ).toHaveLength(2);
    expect(
      useAgentChangesStore.getState().changesForTurn("turn-2"),
    ).toHaveLength(1);
    expect(useAgentChangesStore.getState().hasChangesForTurn("turn-1")).toBe(
      true,
    );
    expect(useAgentChangesStore.getState().hasChangesForTurn("turn-3")).toBe(
      false,
    );
  });

  it("tracks the current turn and binds assistant messages", () => {
    const store = useAgentChangesStore.getState();
    store.beginTurn("turn-1");
    store.bindMessage("assistant-1");
    store.bindMessage("assistant-2", "turn-2");

    expect(useAgentChangesStore.getState().turnByMessage).toEqual({
      "assistant-1": "turn-1",
      "assistant-2": "turn-2",
    });
  });

  it("keeps the first turn until a new one begins", () => {
    const store = useAgentChangesStore.getState();
    store.beginTurn("turn-1");
    store.beginTurn("turn-1");
    store.beginTurn("turn-2");

    expect(useAgentChangesStore.getState().currentTurnId).toBe("turn-2");
  });

  it("clears one turn without touching another", () => {
    recordChange("turn-1");
    recordChange("turn-2");

    useAgentChangesStore.getState().clearTurn("turn-1");

    expect(
      useAgentChangesStore.getState().changesForTurn("turn-1"),
    ).toHaveLength(0);
    expect(
      useAgentChangesStore.getState().changesForTurn("turn-2"),
    ).toHaveLength(1);
  });

  it("removes a single change", () => {
    const change = recordChange("turn-1");
    useAgentChangesStore.getState().remove(change.id);

    expect(useAgentChangesStore.getState().changes).toHaveLength(0);
  });

  it("tracks the file under review and clears it with the turn", () => {
    const store = useAgentChangesStore.getState();
    store.startReview("turn-1", "file-1");

    expect(useAgentChangesStore.getState().reviewTurnId).toBe("turn-1");
    expect(useAgentChangesStore.getState().reviewFileId).toBe("file-1");

    recordChange("turn-1");
    useAgentChangesStore.getState().clearTurn("turn-1");

    expect(useAgentChangesStore.getState().reviewTurnId).toBeNull();
    expect(useAgentChangesStore.getState().reviewFileId).toBeNull();
  });
});
