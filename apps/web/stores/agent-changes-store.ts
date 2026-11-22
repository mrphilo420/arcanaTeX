import { create } from "zustand";
import type { AppliedEdit } from "@/lib/ai/file-edits";

export type AgentChangeKind = "edit" | "create";

/**
 * One AI-initiated change to one file. `applied` holds the anchored offsets
 * from `applyEdits`, so undo can invert exactly this change instead of
 * restoring a whole-file snapshot.
 */
export interface AgentFileChange {
  id: string;
  turnId: string;
  toolCallId: string;
  kind: AgentChangeKind;
  fileId: string;
  filePath: string;
  before: string;
  after: string;
  applied: AppliedEdit[];
  createdAt: number;
}

export type AgentChangeInput = Omit<AgentFileChange, "id" | "createdAt">;

interface AgentChangesState {
  changes: AgentFileChange[];
  currentTurnId: string | null;
  /** Assistant message id -> turn id, for rendering the summary card later. */
  turnByMessage: Record<string, string>;
  /** The file currently opened for review, if any. */
  reviewTurnId: string | null;
  reviewFileId: string | null;
  beginTurn: (turnId: string) => void;
  bindMessage: (messageId: string, turnId?: string) => void;
  record: (input: AgentChangeInput) => AgentFileChange;
  changesForTurn: (turnId: string) => AgentFileChange[];
  hasChangesForTurn: (turnId: string) => boolean;
  startReview: (turnId: string, fileId: string) => void;
  stopReview: () => void;
  remove: (id: string) => void;
  clearTurn: (turnId: string) => void;
  clearAll: () => void;
}

export const useAgentChangesStore = create<AgentChangesState>((set, get) => ({
  changes: [],
  currentTurnId: null,
  turnByMessage: {},
  reviewTurnId: null,
  reviewFileId: null,

  beginTurn: (turnId) => {
    if (!turnId || get().currentTurnId === turnId) return;
    set({ currentTurnId: turnId });
  },

  bindMessage: (messageId, turnId) => {
    const resolved = turnId ?? get().currentTurnId;
    if (!messageId || !resolved) return;
    if (get().turnByMessage[messageId] === resolved) return;
    set((state) => ({
      turnByMessage: { ...state.turnByMessage, [messageId]: resolved },
    }));
  },

  record: (input) => {
    const change: AgentFileChange = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    set((state) => ({ changes: [...state.changes, change] }));
    return change;
  },

  changesForTurn: (turnId) =>
    get().changes.filter((change) => change.turnId === turnId),

  hasChangesForTurn: (turnId) =>
    get().changes.some((change) => change.turnId === turnId),

  startReview: (turnId, fileId) =>
    set({ reviewTurnId: turnId, reviewFileId: fileId }),

  stopReview: () => set({ reviewTurnId: null, reviewFileId: null }),

  remove: (id) =>
    set((state) => ({
      changes: state.changes.filter((change) => change.id !== id),
    })),

  clearTurn: (turnId) =>
    set((state) => {
      const clearingReview = state.reviewTurnId === turnId;
      return {
        changes: state.changes.filter((change) => change.turnId !== turnId),
        reviewTurnId: clearingReview ? null : state.reviewTurnId,
        reviewFileId: clearingReview ? null : state.reviewFileId,
      };
    }),

  clearAll: () =>
    set({
      changes: [],
      currentTurnId: null,
      turnByMessage: {},
      reviewTurnId: null,
      reviewFileId: null,
    }),
}));

/**
 * The turn id used by tools. The runtime provider begins a turn from the last
 * user message; "untracked" is a safe fallback for tool calls that happen
 * before that effect runs.
 */
export function currentAgentTurnId(): string {
  return useAgentChangesStore.getState().currentTurnId ?? "untracked";
}
