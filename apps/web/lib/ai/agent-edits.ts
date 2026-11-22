import { createProjectVersion } from "@/lib/projects/repository";
import {
  useAgentChangesStore,
  type AgentFileChange,
} from "@/stores/agent-changes-store";
import { useDocumentStore } from "@/stores/document-store";
import { invertEdits, normalizeEol, type AppliedEdit } from "./file-edits";

export type ApplyAgentEditInput = {
  turnId: string;
  toolCallId: string;
  fileId: string;
  before: string;
  after: string;
  applied: AppliedEdit[];
};

export type ApplyAgentEditResult =
  | { ok: true; change: AgentFileChange | null }
  | { ok: false; reason: "missing" | "conflict" };

export type UndoAgentChangeResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "conflict" };

const snapshotPromises = new Map<string, Promise<void>>();

async function snapshotProject(): Promise<void> {
  const state = useDocumentStore.getState();
  if (!state.projectId) return;

  try {
    await createProjectVersion({
      projectId: state.projectId,
      label: "Before model edits",
      name: state.projectName,
      projectCreatedAt: state.createdAt ?? Date.now(),
      files: state.files,
      activeFileId: state.activeFileId || state.files[0]?.id || "",
      mainFileId: state.mainFileId,
      compiler: state.compiler,
      comments: state.comments,
    });
  } catch (error) {
    // A failed snapshot must not block the user's edit. The in-memory change
    // records still support undo for this session.
    console.error("Could not snapshot the project before AI edits", error);
  }
}

/**
 * Takes one project snapshot before the first change of a turn. Concurrent
 * tool calls in the same turn share the same promise and never snapshot twice.
 */
export async function prepareAgentTurn(turnId: string): Promise<void> {
  if (useAgentChangesStore.getState().hasChangesForTurn(turnId)) return;

  const existing = snapshotPromises.get(turnId);
  if (existing) return existing;

  const task = snapshotProject().finally(() => {
    snapshotPromises.delete(turnId);
  });
  snapshotPromises.set(turnId, task);
  return task;
}

/**
 * The only code path that mutates file content on behalf of the AI. It records
 * the exact change so the turn can be reviewed or undone later.
 */
export async function applyAgentEdit(
  input: ApplyAgentEditInput,
): Promise<ApplyAgentEditResult> {
  await prepareAgentTurn(input.turnId);

  const state = useDocumentStore.getState();
  const file = state.files.find((candidate) => candidate.id === input.fileId);
  if (!file) return { ok: false, reason: "missing" };

  const current = file.content ?? "";
  if (current !== input.before) return { ok: false, reason: "conflict" };
  if (input.before === input.after) return { ok: true, change: null };

  // Callers provide anchored edits. Fall back to a whole-file replacement so
  // an edit is never recorded without a way to undo it.
  const applied =
    input.applied.length > 0
      ? input.applied
      : [
          {
            start: 0,
            end: normalizeEol(input.after).length,
            before: normalizeEol(input.before),
            after: normalizeEol(input.after),
          },
        ];

  state.updateFileContent(input.fileId, input.after);
  const change = useAgentChangesStore.getState().record({
    turnId: input.turnId,
    toolCallId: input.toolCallId,
    kind: "edit",
    fileId: input.fileId,
    filePath: file.path,
    before: input.before,
    after: input.after,
    applied,
  });

  return { ok: true, change };
}

/** Records a file created by the AI. Undo deletes the file instead of emptying it. */
export function recordAgentFileCreate(input: {
  turnId: string;
  toolCallId: string;
  fileId: string;
  filePath: string;
  content: string;
}): AgentFileChange {
  const normalized = normalizeEol(input.content);
  return useAgentChangesStore.getState().record({
    turnId: input.turnId,
    toolCallId: input.toolCallId,
    kind: "create",
    fileId: input.fileId,
    filePath: input.filePath,
    before: "",
    after: input.content,
    applied: [
      {
        start: 0,
        end: normalized.length,
        before: "",
        after: normalized,
      },
    ],
  });
}

/** Reverts one recorded change if the edited text is still exactly as applied. */
export function undoAgentChange(id: string): UndoAgentChangeResult {
  const changes = useAgentChangesStore.getState();
  const change = changes.changes.find((candidate) => candidate.id === id);
  if (!change) return { ok: false, reason: "missing" };

  if (change.kind === "create") {
    const state = useDocumentStore.getState();
    const file = state.files.find(
      (candidate) => candidate.id === change.fileId,
    );
    if (file && (file.content ?? "") !== change.after) {
      return { ok: false, reason: "conflict" };
    }
    if (file) state.deleteFile(change.fileId);
    changes.remove(id);
    return { ok: true };
  }

  const state = useDocumentStore.getState();
  const file = state.files.find((candidate) => candidate.id === change.fileId);
  if (!file) return { ok: false, reason: "missing" };

  const result = invertEdits(file.content ?? "", change.applied);
  if (!result.ok) return { ok: false, reason: "conflict" };

  state.updateFileContent(change.fileId, result.content);
  changes.remove(id);
  return { ok: true };
}

/**
 * Reverts a whole turn atomically: every edit is inverted in memory first,
 * and nothing is written if any file no longer matches.
 */
export function undoAgentTurn(turnId: string): UndoAgentChangeResult {
  const changes = useAgentChangesStore.getState();
  const turnChanges = changes.changesForTurn(turnId);
  const state = useDocumentStore.getState();
  const drafts = new Map<string, string>();
  const creations = new Set<string>();

  for (let index = turnChanges.length - 1; index >= 0; index -= 1) {
    const change = turnChanges[index];

    if (change.kind === "create") {
      const file = state.files.find(
        (candidate) => candidate.id === change.fileId,
      );
      const currentContent = drafts.get(change.fileId) ?? file?.content ?? "";
      if (file && currentContent !== change.after) {
        return { ok: false, reason: "conflict" };
      }
      creations.add(change.fileId);
      continue;
    }

    const file = state.files.find(
      (candidate) => candidate.id === change.fileId,
    );
    if (!file) return { ok: false, reason: "missing" };

    const base = drafts.get(change.fileId) ?? file.content ?? "";
    const result = invertEdits(base, change.applied);
    if (!result.ok) return { ok: false, reason: "conflict" };
    drafts.set(change.fileId, result.content);
  }

  for (const [fileId, content] of drafts) {
    useDocumentStore.getState().updateFileContent(fileId, content);
  }
  for (const fileId of creations) {
    const current = useDocumentStore.getState();
    if (current.files.some((file) => file.id === fileId)) {
      current.deleteFile(fileId);
    }
  }

  changes.clearTurn(turnId);
  return { ok: true };
}
