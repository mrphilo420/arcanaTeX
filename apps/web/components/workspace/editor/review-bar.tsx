"use client";

import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  GitMergeIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ReviewBarProps {
  current: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
}

export function ReviewBar({
  current,
  total,
  onPrevious,
  onNext,
  onAccept,
  onReject,
  onClose,
}: ReviewBarProps) {
  const hasChunks = total > 0;

  return (
    <div
      role="toolbar"
      aria-label="Review proposed changes"
      className="flex h-9 shrink-0 items-center gap-2 border-border border-b bg-muted/40 px-2"
    >
      <GitMergeIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="font-medium text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
        Review
      </span>

      <div className="ml-1 flex items-center rounded-md border border-border/60 bg-background/70">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 rounded-none"
          onClick={onPrevious}
          disabled={!hasChunks}
          aria-label="Previous change"
          title="Previous change"
        >
          <ChevronUpIcon className="size-3.5" />
        </Button>
        <span className="min-w-10 text-center font-mono text-[0.7rem] text-muted-foreground">
          {hasChunks ? `${current} / ${total}` : "—"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 rounded-none"
          onClick={onNext}
          disabled={!hasChunks}
          aria-label="Next change"
          title="Next change"
        >
          <ChevronDownIcon className="size-3.5" />
        </Button>
      </div>

      <span className="text-[0.72rem] text-muted-foreground">
        Proposed changes in this file
      </span>

      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-[0.72rem] text-destructive hover:text-destructive"
          onClick={onReject}
          disabled={!hasChunks}
          title="Reject this change"
        >
          <XIcon className="size-3.5" />
          Reject
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 gap-1 text-[0.72rem]"
          onClick={onAccept}
          disabled={!hasChunks}
          title="Accept this change"
        >
          <CheckIcon className="size-3.5" />
          Accept
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-[0.72rem] text-muted-foreground"
          onClick={onClose}
          title="Exit review"
        >
          Exit
        </Button>
      </div>
    </div>
  );
}
