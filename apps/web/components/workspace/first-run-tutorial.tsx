"use client";

import { useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookMarkedIcon,
  CheckIcon,
  CompassIcon,
  LayersIcon,
  ScanTextIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";

export const TUTORIAL_STORAGE_KEY = "arcanatex.tutorial.completed.v1";

export function hasCompletedTutorial(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTutorialCompleted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TUTORIAL_STORAGE_KEY, "1");
  } catch {
    // Ignore storage quota / private-browsing failures.
  }
}

interface TutorialStep {
  id: string;
  badge: string;
  title: string;
  summary: string;
  highlights: string[];
  icon: typeof CompassIcon;
  actionLabel?: string;
  onAction?: () => void;
}

export interface FirstRunTutorialProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FirstRunTutorial({
  open,
  onOpenChange,
}: FirstRunTutorialProps) {
  const [stepIndex, setStepIndex] = useState(0);

  const setJournalOpen = useDocumentStore((s) => s.setJournalOpen);
  const setFigureStudioOpen = useDocumentStore((s) => s.setFigureStudioOpen);
  const setTextRestorerOpen = useDocumentStore((s) => s.setTextRestorerOpen);
  const setLeanOpen = useDocumentStore((s) => s.setLeanOpen);
  const setThreadOpen = useDocumentStore((s) => s.setThreadOpen);

  const completeAndClose = () => {
    markTutorialCompleted();
    onOpenChange(false);
  };

  const steps: TutorialStep[] = [
    {
      id: "workspace",
      badge: "Step 1 of 5 · Workspace",
      title: "Welcome to arcanaTeX",
      summary:
        "A local-first research workspace combining multi-file LaTeX, live PDF preview, Lean 4 proof tooling, and Python/R figure synthesis.",
      highlights: [
        "Left sidebar: file tree, outline, and drag-and-drop import for folders, .zip, .tar.gz, and .rar packages.",
        "Center pane: CodeMirror editor with incremental static lint and Keep/Undo diff reviews.",
        "Press ⌘⇧Z (or Ctrl+Shift+Z) anytime for Ma Focus zen mode.",
      ],
      icon: CompassIcon,
    },
    {
      id: "publishers",
      badge: "Step 2 of 5 · Formats & Preprints",
      title: "Adaptive Journal Templates",
      summary:
        "Switch seamlessly between arXiv preprints and peer-reviewed formats including Elsevier, IEEE, Springer Nature, AMS, ACM, and SIAM.",
      highlights: [
        "Studio → Journal & Publisher Formats adapts your preamble and class options.",
        "Studio → Research Pipeline guides you from preprint checks to journal submission.",
        "Submit builds a clean source .zip right in your browser.",
      ],
      icon: BookMarkedIcon,
      actionLabel: "Open Journal Formats",
      onAction: () => {
        completeAndClose();
        setJournalOpen(true);
      },
    },
    {
      id: "figures",
      badge: "Step 3 of 5 · Scientific Figures",
      title: "Generate Python & R Figures",
      summary:
        "Describe a diagram or pass CSV data, inspect numbered layout instructions, and compile publication-grade matplotlib or ggplot2 plots locally.",
      highlights: [
        "Supports PNG, SVG, and vector PDF artifacts saved directly to your project.",
        "Includes 28 statistical/research TikZ templates in TikZ Vector Studio.",
        "Edit .py and .R scripts side by side with live rendered previews.",
      ],
      icon: WandSparklesIcon,
      actionLabel: "Try Figure Studio",
      onAction: () => {
        completeAndClose();
        setFigureStudioOpen(true);
      },
    },
    {
      id: "ml-restore",
      badge: "Step 4 of 5 · Cleanup & Long Papers",
      title: "Restore Garbled Text & Refactor Large Papers",
      summary:
        "Paste noisy OCR scans or unformatted notes into Text Restorer (ML) to decode and structure them into verified LaTeX.",
      highlights: [
        "5-stage local ML pipeline (OCR confusion channel + Viterbi/CRF labeling).",
        "Long-Paper Chunk Studio compresses and stages multi-section edits safely.",
        "Precision Lint catches unbalanced braces, math, refs, and citations.",
      ],
      icon: ScanTextIcon,
      actionLabel: "Open Text Restorer",
      onAction: () => {
        completeAndClose();
        setTextRestorerOpen(true);
      },
    },
    {
      id: "ai-lean",
      badge: "Step 5 of 5 · AI Co-Author & Lean Comparator",
      title: "Draft, Review & Formally Verify",
      summary:
        "Ask the AI assistant to edit sections (/hourglass), audit equations (/paper-review), normalize BibTeX (/bibtex), or prove and verify Lean 4 theorems.",
      highlights: [
        "All assistant edits open a side-by-side Keep/Undo diff preview with auto-snapshots.",
        "Connect a local Lake project in Studio → Lean Lake Project…",
        "Run lake build and Lean Comparator verification (POST /lean/compare) to check theorem alignment and permitted axioms.",
      ],
      icon: ShieldCheckIcon,
      actionLabel: "Open Assistant",
      onAction: () => {
        completeAndClose();
        setThreadOpen(true);
      },
    },
  ];

  const step = steps[stepIndex] ?? steps[0];
  const StepIcon = step.icon;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) markTutorialCompleted();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/50 px-2.5 py-0.5 font-medium text-[0.72rem] text-muted-foreground">
              <LayersIcon className="size-3 text-primary" />
              {step.badge}
            </span>
          </div>
          <div className="flex items-start gap-3 pt-1">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <StepIcon className="size-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base">{step.title}</DialogTitle>
              <DialogDescription className="mt-1 text-[0.84rem] leading-relaxed">
                {step.summary}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ul className="space-y-2 rounded-lg border border-border/70 bg-muted/25 p-3.5 text-[0.82rem] text-foreground/90">
          {step.highlights.map((item) => (
            <li key={item} className="flex items-start gap-2 leading-relaxed">
              <SparklesIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-2 pt-1">
          <nav
            className="flex items-center gap-1.5"
            aria-label="Tutorial steps"
          >
            {steps.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Go to ${item.title}`}
                onClick={() => setStepIndex(idx)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  idx === stepIndex
                    ? "w-5 bg-primary"
                    : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50",
                )}
              />
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {step.actionLabel && step.onAction && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={step.onAction}
              >
                {step.actionLabel}
              </Button>
            )}
            {step.id === "ai-lean" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  completeAndClose();
                  setLeanOpen(true);
                }}
              >
                Lean Panel
              </Button>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={completeAndClose}
          >
            Skip tutorial
          </Button>
          <div className="flex items-center gap-1.5">
            {!isFirst && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              >
                <ArrowLeftIcon className="size-3.5" />
                Back
              </Button>
            )}
            {isLast ? (
              <Button type="button" size="sm" onClick={completeAndClose}>
                <CheckIcon className="size-3.5" />
                Start writing
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  setStepIndex((i) => Math.min(steps.length - 1, i + 1))
                }
              >
                Next
                <ArrowRightIcon className="size-3.5" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
