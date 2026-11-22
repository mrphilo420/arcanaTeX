"use client";

import { AuiIf, useThreadRuntime } from "@assistant-ui/react";
import {
  BookOpenIcon,
  FileCodeIcon,
  FileSearchIcon,
  HourglassIcon,
  SigmaIcon,
  SpellCheckIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDevFeatureFlag } from "@/stores/dev-panel-store";

const HOURGLASS_PROMPT = "/hourglass draft";
const BIBTEX_PROMPT = "/bibtex";
const REVIEW_PROMPT = "/paper-review";
const PROOFREAD_PROMPT = "/proofread";
const PROVE_PROMPT = "/prove";
const LEAN_REVIEW_PROMPT =
  "Audit the Lean 4 sources in this project. Use inspect_lean_sources, summarize the declarations, map formal results to the paper's claims where possible, and flag sorry, admit, axioms, native_decide, unsafe or partial code. Do not edit any files.";

export function ChatQuickActions({ className }: { className?: string }) {
  const runtime = useThreadRuntime();
  const showHourglass = useDevFeatureFlag("hourglass");
  const showBibtex = useDevFeatureFlag("bibtex");
  const showReview = useDevFeatureFlag("paperReview");
  const showProofread = useDevFeatureFlag("proofread");
  const showProve = useDevFeatureFlag("prove");
  const showLeanAudit = useDevFeatureFlag("leanAudit");

  const send = (text: string) => {
    runtime.append({
      role: "user",
      content: [{ type: "text", text }],
    });
  };

  if (
    !showHourglass &&
    !showBibtex &&
    !showReview &&
    !showProofread &&
    !showProve &&
    !showLeanAudit
  ) {
    return null;
  }

  return (
    <AuiIf condition={({ thread }) => !thread.isRunning}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 text-[0.75rem]",
          className,
        )}
      >
        {showHourglass && (
          <button
            type="button"
            onClick={() => send(HOURGLASS_PROMPT)}
            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            title="Draft or restructure the paper with the hourglass skill"
          >
            <HourglassIcon className="size-3" />
            Paper writer
          </button>
        )}
        {showBibtex && (
          <button
            type="button"
            onClick={() => send(BIBTEX_PROMPT)}
            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            title="Correct or audit the .bib file"
          >
            <BookOpenIcon className="size-3" />
            BibTeX
          </button>
        )}
        {showReview && (
          <button
            type="button"
            onClick={() => send(REVIEW_PROMPT)}
            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            title="Run the /paper-review skill"
          >
            <FileSearchIcon className="size-3" />
            Review paper
          </button>
        )}
        {showProofread && (
          <button
            type="button"
            onClick={() => send(PROOFREAD_PROMPT)}
            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            title="Run the /proofread skill"
          >
            <SpellCheckIcon className="size-3" />
            Proofread
          </button>
        )}
        {showProve && (
          <button
            type="button"
            onClick={() => send(PROVE_PROMPT)}
            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            title="Run the /prove mathematical-prover skill"
          >
            <SigmaIcon className="size-3" />
            Prove
          </button>
        )}
        {showLeanAudit && (
          <button
            type="button"
            onClick={() => send(LEAN_REVIEW_PROMPT)}
            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            title="Audit Lean 4 sources"
          >
            <FileCodeIcon className="size-3" />
            Lean audit
          </button>
        )}
        <span className="hidden px-1 font-mono text-[0.75rem] text-muted-foreground/70 sm:inline">
          /hourglass · /bibtex · /prove · /paper-review · /proofread
        </span>
      </div>
    </AuiIf>
  );
}
