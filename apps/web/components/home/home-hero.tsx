"use client";

import { useState } from "react";
import {
  ArrowUpRightIcon,
  BookMarkedIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  CodeXmlIcon,
  CpuIcon,
  FileTextIcon,
  FolderUpIcon,
  PlusIcon,
  ShieldCheckIcon,
  SigmaIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PUBLISHER_LIST, type PublisherId } from "@/lib/publishers";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: FileTextIcon,
    title: "Compile and preview",
    copy: "Runs TeX Live or Tectonic. Shows diagnostics and a PDF preview.",
    tone: "bg-primary/10 text-primary",
  },
  {
    icon: SigmaIcon,
    title: "Proof golf",
    copy: "Checks Lean 4 candidates by elaboration.",
    tone: "bg-teal/15 text-teal",
  },
  {
    icon: CpuIcon,
    title: "Model providers",
    copy: "Use OpenCode, Anthropic, Hugging Face, Groq, or a local endpoint.",
    tone: "bg-amber/15 text-amber",
  },
  {
    icon: ShieldCheckIcon,
    title: "Review changes",
    copy: "Review side-by-side patches. Keep or undo each change.",
    tone: "bg-foreground/[0.06] text-foreground",
  },
] as const;

const CODE_LINES = [
  { text: "\\section{Introduction}", tone: "text-amber" },
  { text: "Let Q be a quadratic form on V.", tone: "text-on-dark" },
  { text: "theorem null_limit : Q x = 0 := by", tone: "text-teal" },
  { text: "  simpa [Q] using hQ x", tone: "text-on-dark-soft" },
  { text: "\\begin{theorem}", tone: "text-amber" },
  { text: "  The limit exists and is unique.", tone: "text-on-dark" },
  { text: "\\end{theorem}", tone: "text-amber" },
];

export function HomeHero({
  projectCount,
  folderCount,
  sharedCount,
  onNewProject,
  onNewPublisherProject,
  onImport,
}: {
  projectCount: number;
  folderCount: number;
  sharedCount: number;
  onNewProject: () => void;
  onNewPublisherProject?: (publisherId: PublisherId) => void;
  onImport: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const showFullShowcase = projectCount === 0 || isExpanded;

  if (!showFullShowcase) {
    return (
      <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-card/25 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="size-1.5 shrink-0 rounded-full bg-[#5db8a6]" />
          <span className="truncate font-serif text-[0.95rem] text-foreground tracking-[-0.01em]">
            Write, compile, and verify
          </span>
          <span className="hidden text-muted-foreground/45 sm:inline">·</span>
          <span className="hidden truncate text-[0.75rem] text-muted-foreground sm:inline">
            {projectCount} project{projectCount === 1 ? "" : "s"}
            {folderCount > 0
              ? ` · ${folderCount} folder${folderCount === 1 ? "" : "s"}`
              : ""}
            {sharedCount > 0 ? ` · ${sharedCount} shared` : ""}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-full px-3.5 text-xs shadow-none"
            onClick={onNewProject}
          >
            <PlusIcon className="size-3.5" />
            New paper
          </Button>

          {onNewPublisherProject && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-full border-hairline bg-background/60 px-3 text-xs shadow-none hover:bg-background"
                >
                  <BookMarkedIcon className="size-3.5 text-primary" />
                  <span>Templates</span>
                  <ChevronDownIcon className="size-3 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
                  Peer-reviewed journal templates
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {PUBLISHER_LIST.map((publisher) => (
                  <DropdownMenuItem
                    key={publisher.id}
                    onClick={() => onNewPublisherProject(publisher.id)}
                    className="gap-2"
                  >
                    <BookMarkedIcon className="size-3.5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-xs">
                        {publisher.shortName}
                      </div>
                      <div className="truncate font-mono text-[0.625rem] text-muted-foreground">
                        {publisher.documentClass} ·{" "}
                        {publisher.recommendedBibStyle}
                      </div>
                    </div>
                    <span className="shrink-0 rounded border border-hairline bg-background/70 px-1.5 py-0.5 font-mono text-[0.6rem] text-muted-foreground">
                      {publisher.columnLabel}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-full border-hairline bg-background/60 px-3 text-xs shadow-none hover:bg-background"
            onClick={onImport}
          >
            <FolderUpIcon className="size-3.5" />
            Import
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 rounded-full px-2.5 text-muted-foreground text-xs hover:text-foreground"
            onClick={() => setIsExpanded(true)}
            aria-expanded={false}
          >
            <span>Overview</span>
            <ChevronDownIcon className="size-3.5 opacity-70" />
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="relative mb-6 overflow-hidden rounded-2xl border border-hairline bg-card/30 p-5 sm:p-7 xl:p-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 opacity-45 [background-image:radial-gradient(circle_at_1px_1px,rgba(20,20,19,0.07)_1px,transparent_0)] [background-size:24px_24px] dark:[background-image:radial-gradient(circle_at_1px_1px,rgba(250,249,245,0.05)_1px,transparent_0)]" />
      </div>

      {projectCount > 0 && (
        <div className="relative mb-4 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 rounded-full border border-hairline bg-background/60 px-2.5 text-muted-foreground text-xs hover:text-foreground"
            onClick={() => setIsExpanded(false)}
            aria-expanded={true}
          >
            <span>Overview</span>
            <ChevronUpIcon className="size-3.5 opacity-70" />
          </Button>
        </div>
      )}

      <div className="relative grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-background/60 px-3 py-1 text-[0.7rem] text-muted-foreground uppercase tracking-[0.14em] backdrop-blur">
            <span className="size-1.5 rounded-full bg-[#5db8a6]" />
            Local-first research workspace
          </div>

          <h2 className="mt-5 max-w-2xl text-balance font-serif text-[2.6rem] leading-[0.98] tracking-[-0.035em] sm:text-5xl xl:text-[3.7rem]">
            Write, compile, and verify.
          </h2>

          <p className="mt-5 max-w-xl text-[0.95rem] text-muted-foreground leading-7">
            Runs TeX Live or Tectonic and Lean 4 on your machine. Keep or undo
            each change. Files stay in this browser.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button
              size="lg"
              className="h-11 gap-2 rounded-full px-5 shadow-md"
              onClick={onNewProject}
            >
              <PlusIcon className="size-4" />
              New project
              <ArrowUpRightIcon className="size-3.5 opacity-70" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-11 gap-2 rounded-full border-hairline bg-background/60 px-5 backdrop-blur hover:bg-background"
              onClick={onImport}
            >
              <FolderUpIcon className="size-4" />
              Import
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 text-[0.72rem] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-background/50 px-2.5 py-1">
              <CheckCircle2Icon className="size-3 text-[#5db8a6]" />
              Compile on your machine
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-background/50 px-2.5 py-1">
              <CodeXmlIcon className="size-3 text-primary" />
              LaTeX + Lean in one project
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-background/50 px-2.5 py-1">
              <SparklesIcon className="size-3 text-[#e8a55a]" />
              Review each proposed edit
            </span>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.75rem] text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">
                {projectCount}
              </span>{" "}
              project{projectCount === 1 ? "" : "s"}
            </span>
            <span>
              <span className="font-medium text-foreground">{folderCount}</span>{" "}
              folder{folderCount === 1 ? "" : "s"}
            </span>
            <span>
              <span className="font-medium text-foreground">{sharedCount}</span>{" "}
              shared
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <span className="size-1.5 rounded-full bg-[#5db8a6]" />
              Stored in this browser
            </span>
          </div>
        </div>

        <div className="relative">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-surface-dark text-on-dark shadow-[0_30px_80px_rgba(20,20,19,0.28)]">
            <div className="flex items-center gap-2 border-white/10 border-b px-4 py-3">
              <span className="size-2 rounded-full bg-[#c64545]/80" />
              <span className="size-2 rounded-full bg-[#e8a55a]/80" />
              <span className="size-2 rounded-full bg-[#5db8a6]/80" />
              <span className="ml-2 font-mono text-[0.68rem] text-on-dark-soft">
                main.tex
              </span>
              <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-[#5db8a6]/25 bg-[#5db8a6]/10 px-2 py-0.5 font-mono text-[#8dd7c7] text-[0.6rem]">
                <span className="size-1.5 rounded-full bg-[#5db8a6]" />
                local
              </span>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="overflow-hidden font-mono text-[0.66rem] leading-5">
                  {CODE_LINES.map((line) => (
                    <div key={line.text} className={line.tone}>
                      {line.text}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2 sm:w-36">
                <div className="rounded-lg border border-[#5db8a6]/25 bg-[#5db8a6]/10 p-2.5">
                  <div className="flex items-center gap-1.5 font-medium text-[#8dd7c7] text-[0.65rem]">
                    <CheckCircle2Icon className="size-3" />
                    Lean build
                  </div>
                  <div className="mt-1 font-mono text-[#a09d96] text-[0.6rem]">
                    0 errors · 0 sorries
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                  <div className="flex items-center gap-1.5 font-medium text-[#e8a55a] text-[0.65rem]">
                    <SparklesIcon className="size-3" />
                    Patch ready
                  </div>
                  <div className="mt-1 text-[#a09d96] text-[0.6rem]">
                    Review before applying
                  </div>
                  <div className="mt-2 flex gap-1">
                    <span className="rounded bg-[#5db8a6]/20 px-1.5 py-0.5 font-mono text-[#8dd7c7] text-[0.55rem]">
                      Keep
                    </span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[#a09d96] text-[0.55rem]">
                      Undo
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-white/10 border-t px-4 py-2 font-mono text-[#a09d96] text-[0.6rem]">
              <span>Compile complete</span>
              <span>PDF ready</span>
              <span className="ml-auto">Lean 4 · mathlib</span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative mt-8 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.title}
              className={cn(
                "group rounded-xl border border-hairline bg-background/45 p-3.5 backdrop-blur transition-colors hover:border-primary/25 hover:bg-background/70",
              )}
            >
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-lg",
                  feature.tone,
                )}
              >
                <Icon className="size-3.5" />
              </span>
              <div className="mt-2.5 font-medium text-[0.8rem]">
                {feature.title}
              </div>
              <p className="mt-1 text-[0.7rem] text-muted-foreground leading-relaxed">
                {feature.copy}
              </p>
            </div>
          );
        })}
      </div>

      {onNewPublisherProject && (
        <div className="relative mt-5 rounded-xl border border-hairline bg-background/45 p-3.5 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BookMarkedIcon className="size-4 text-primary" />
              <span className="font-medium text-[0.8rem]">
                Peer-reviewed journal templates
              </span>
            </div>
            <span className="text-[0.7rem] text-muted-foreground">
              Ready-to-compile manuscripts with bibliography &amp; compliance
              metadata
            </span>
          </div>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {PUBLISHER_LIST.map((publisher) => (
              <button
                key={publisher.id}
                type="button"
                onClick={() => onNewPublisherProject(publisher.id)}
                className="group flex items-start justify-between gap-2 rounded-lg border border-hairline bg-card/55 px-3 py-2 text-left transition-colors hover:border-primary/45 hover:bg-card"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-[0.78rem] group-hover:text-primary">
                    {publisher.shortName}
                  </div>
                  <div className="truncate font-mono text-[0.65rem] text-muted-foreground">
                    {publisher.documentClass} · {publisher.recommendedBibStyle}
                  </div>
                </div>
                <span className="shrink-0 rounded border border-hairline bg-background/70 px-1.5 py-0.5 font-mono text-[0.6rem] text-muted-foreground">
                  {publisher.columnLabel}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
