"use client";

import { useAuiState } from "@assistant-ui/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  FileCodeIcon,
  GitMergeIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { undoAgentTurn } from "@/lib/ai/agent-edits";
import {
  summarizeTurnChanges,
  type MergeFileSummary,
} from "@/lib/ai/merge-summary";
import { cn } from "@/lib/utils";
import { useAgentChangesStore } from "@/stores/agent-changes-store";
import { useDocumentStore } from "@/stores/document-store";

export interface MergeChangesCardViewProps {
  files: MergeFileSummary[];
  isReviewing: (file: MergeFileSummary) => boolean;
  onUndoAll: () => void;
  onKeepAll: () => void;
  onReview: (file: MergeFileSummary) => void;
}

export function MergeChangesCardView({
  files,
  isReviewing,
  onUndoAll,
  onKeepAll,
  onReview,
}: MergeChangesCardViewProps) {
  const [expanded, setExpanded] = useState(true);

  if (files.length === 0) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-border/70 bg-muted/30">
      <div className="flex items-center gap-2 px-3 py-2">
        <GitMergeIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground text-sm">
          Merge Changes
        </span>
        <span className="text-muted-foreground text-xs">auto-applied</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onUndoAll}
            className="text-muted-foreground text-xs transition-colors hover:text-foreground"
          >
            Undo all
          </button>
          <button
            type="button"
            onClick={onKeepAll}
            className="text-muted-foreground text-xs transition-colors hover:text-foreground"
          >
            Keep all
          </button>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse changes" : "Expand changes"}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {expanded ? (
              <ChevronUpIcon className="size-4" />
            ) : (
              <ChevronDownIcon className="size-4" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-border/60 border-t">
          {files.map((file) => {
            const reviewing = isReviewing(file);

            return (
              <div
                key={file.fileId}
                className="flex items-center gap-2 px-3 py-2 text-xs"
              >
                <FileCodeIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate font-mono text-foreground">
                  {file.filePath}:{file.firstLine}
                </span>
                <span className="text-muted-foreground">{file.kind}</span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono">
                  <span className="text-[#2a8f83] dark:text-[#5db8a6]">
                    +{file.added}
                  </span>
                  <span className="text-destructive">−{file.removed}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onReview(file)}
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-muted",
                    reviewing
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Review
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MergeChangesCard() {
  const messageId = useAuiState((state) => state.message.id);
  const status = useAuiState((state) => state.message.status);
  const turnByMessage = useAgentChangesStore((state) => state.turnByMessage);
  const changes = useAgentChangesStore((state) => state.changes);
  const reviewTurnId = useAgentChangesStore((state) => state.reviewTurnId);
  const reviewFileId = useAgentChangesStore((state) => state.reviewFileId);

  const turnId = turnByMessage[messageId];
  const turnChanges = turnId
    ? changes.filter((change) => change.turnId === turnId)
    : [];
  const boundMessages = turnId
    ? Object.entries(turnByMessage).filter(([, id]) => id === turnId)
    : [];
  const isLastMessageForTurn =
    boundMessages[boundMessages.length - 1]?.[0] === messageId;
  const isReviewable =
    status === undefined ||
    status.type === "complete" ||
    status.type === "incomplete";
  const files = summarizeTurnChanges(turnChanges);

  if (!isReviewable || !turnId || !isLastMessageForTurn || files.length === 0) {
    return null;
  }

  const undoAll = () => {
    const result = undoAgentTurn(turnId);
    if (!result.ok) {
      toast.error("Could not undo all changes", {
        description:
          result.reason === "conflict"
            ? "Some text changed after these edits were applied. Undo would overwrite it."
            : "One of the edited files no longer exists.",
      });
      return;
    }

    if (files.some((file) => file.filePath.toLowerCase().endsWith(".tex"))) {
      useDocumentStore.getState().requestCompile();
    }
    toast.success("Undid proposed changes", {
      description: `${turnChanges.length} change${turnChanges.length === 1 ? "" : "s"} reverted.`,
    });
  };

  const keepAll = () => {
    useAgentChangesStore.getState().clearTurn(turnId);
    toast.success("Kept proposed changes");
  };

  const review = (group: MergeFileSummary) => {
    const state = useDocumentStore.getState();
    state.setActiveFile(group.fileId);
    useAgentChangesStore.getState().startReview(turnId, group.fileId);

    const applied = group.changes[0]?.applied[0];
    if (applied) {
      state.requestJumpToPosition(applied.start);
    }
  };

  return (
    <MergeChangesCardView
      files={files}
      isReviewing={(file) =>
        reviewTurnId === turnId && reviewFileId === file.fileId
      }
      onUndoAll={undoAll}
      onKeepAll={keepAll}
      onReview={review}
    />
  );
}
