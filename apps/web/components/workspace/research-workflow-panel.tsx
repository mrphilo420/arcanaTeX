"use client";

import { useMemo, useState } from "react";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  BookMarkedIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardCopyIcon,
  FileCheck2Icon,
  FilePlus2Icon,
  FileTextIcon,
  LayersIcon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  generateArxivReadmeJson,
  PREPRINT_SERVER_LIST,
  type PreprintServerId,
} from "@/lib/preprints";
import { detectMainFile, isLatexDocumentFile } from "@/lib/project-files";
import { extractManuscriptParts } from "@/lib/publishers";
import {
  analyzeResearchWorkflow,
  generateCoverLetterTex,
  generateDeclarationsSnippet,
  generateResponseToReviewersTex,
  insertDeclarationsIntoLatex,
  type ResearchStageActionTarget,
  type ResearchStageStatus,
} from "@/lib/research-workflow";
import { cn } from "@/lib/utils";
import { useDocumentStore, useIsPdfFresh } from "@/stores/document-store";

const STAGE_STATUS_STYLES: Record<
  ResearchStageStatus,
  { badge: string; label: string; icon: typeof CheckCircle2Icon }
> = {
  ready: {
    badge: "border-[#5db8a6]/30 bg-[#5db8a6]/10 text-[#2a8f83]",
    label: "Ready",
    icon: CheckCircle2Icon,
  },
  "in-progress": {
    badge: "border-[#b9822f]/30 bg-[#b9822f]/10 text-[#b9822f]",
    label: "Needs polish",
    icon: AlertTriangleIcon,
  },
  blocked: {
    badge: "border-destructive/30 bg-destructive/10 text-destructive",
    label: "Blocked",
    icon: AlertCircleIcon,
  },
};

export function ResearchWorkflowPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const files = useDocumentStore((s) => s.files);
  const mainFileId = useDocumentStore((s) => s.mainFileId);
  const compiler = useDocumentStore((s) => s.compiler);
  const diagnostics = useDocumentStore((s) => s.compileDiagnostics);
  const compile = useDocumentStore((s) => s.compile);
  const projectName = useDocumentStore((s) => s.projectName);
  const addFile = useDocumentStore((s) => s.addFile);
  const updateFileContent = useDocumentStore((s) => s.updateFileContent);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const requestCompile = useDocumentStore((s) => s.requestCompile);
  const setLiteratureOpen = useDocumentStore((s) => s.setLiteratureOpen);
  const setJournalOpen = useDocumentStore((s) => s.setJournalOpen);
  const setSubmissionOpen = useDocumentStore((s) => s.setSubmissionOpen);
  const isFreshPdf = useIsPdfFresh();

  const [preprintServer, setPreprintServer] =
    useState<PreprintServerId>("arxiv");
  const [expandedStageId, setExpandedStageId] =
    useState<string>("preprint-readiness");

  const compileError = compile.error?.message ?? null;

  const mainFile = useMemo(
    () =>
      files.find((file) => file.id === mainFileId) ??
      detectMainFile(files) ??
      files.find((file) => file.type === "tex" && isLatexDocumentFile(file)) ??
      null,
    [files, mainFileId],
  );

  const report = useMemo(
    () =>
      analyzeResearchWorkflow({
        files,
        mainFileId,
        compiler,
        diagnostics,
        compileError,
        hasFreshPdf: isFreshPdf,
        preprintServer,
      }),
    [
      compileError,
      compiler,
      diagnostics,
      files,
      isFreshPdf,
      mainFileId,
      preprintServer,
    ],
  );

  const coverLetterFile = files.find((file) =>
    /cover[-_]?letter\.tex$/i.test(file.path),
  );
  const responseLetterFile = files.find((file) =>
    /(?:response[-_]?to[-_]?reviewers|rebuttal)\.tex$/i.test(file.path),
  );
  const readmeFile = files.find(
    (file) => file.path.toLowerCase() === "00readme.json",
  );

  const buildDeclarations = () => {
    const mainContent = mainFile?.content ?? "";
    const parts = extractManuscriptParts(mainContent);
    const firstAuthor = parts.authors.split(",")[0]?.trim() || undefined;
    return generateDeclarationsSnippet(report.detectedPublisherId, {
      authorName: firstAuthor,
      preprintNote: true,
      serverLabel:
        preprintServer === "arxiv"
          ? "arXiv"
          : preprintServer === "biorxiv"
            ? "bioRxiv / medRxiv"
            : "HAL / OSF",
    });
  };

  const handleCreateOrOpenCoverLetter = () => {
    if (coverLetterFile) {
      setActiveFile(coverLetterFile.id);
      toast.success(`Opened ${coverLetterFile.path}`);
      return;
    }
    const content = generateCoverLetterTex({
      mainContent: mainFile?.content,
      projectName,
      publisherId: report.detectedPublisherId,
      preprintServer,
    });
    addFile({
      name: "cover-letter.tex",
      path: "cover-letter.tex",
      type: "tex",
      content,
    });
    toast.success("Created cover-letter.tex");
  };

  const handleCreateOrOpenResponseLetter = () => {
    if (responseLetterFile) {
      setActiveFile(responseLetterFile.id);
      toast.success(`Opened ${responseLetterFile.path}`);
      return;
    }
    const content = generateResponseToReviewersTex({
      mainContent: mainFile?.content,
      projectName,
    });
    addFile({
      name: "response-to-reviewers.tex",
      path: "response-to-reviewers.tex",
      type: "tex",
      content,
    });
    toast.success("Created response-to-reviewers.tex");
  };

  const handleCreateArxivReadme = () => {
    const content = generateArxivReadmeJson(
      mainFile?.path ?? "main.tex",
      compiler,
    );
    addFile({
      name: "00README.json",
      path: "00README.json",
      type: "tex",
      content,
    });
    toast.success(
      readmeFile ? "Updated 00README.json" : "Created 00README.json",
    );
  };

  const handleInsertDeclarations = () => {
    if (!mainFile || mainFile.type !== "tex") {
      toast.error("Select or create a main .tex file first");
      return;
    }
    const snippet = buildDeclarations();
    const updated = insertDeclarationsIntoLatex(
      mainFile.content ?? "",
      snippet,
    );
    updateFileContent(mainFile.id, updated);
    setActiveFile(mainFile.id);
    requestCompile();
    toast.success("Inserted journal declarations into main manuscript");
  };

  const handleCopyDeclarations = async () => {
    try {
      await navigator.clipboard.writeText(buildDeclarations());
      toast.success("Copied journal declarations block");
    } catch {
      toast.error("Could not access clipboard");
    }
  };

  const handleStageAction = (action: ResearchStageActionTarget) => {
    switch (action) {
      case "literature":
        onOpenChange(false);
        setLiteratureOpen(true);
        return;
      case "journal":
        onOpenChange(false);
        setJournalOpen(true);
        return;
      case "submission":
        onOpenChange(false);
        setSubmissionOpen(true);
        return;
      case "compile":
        requestCompile();
        toast.info("Triggered LaTeX compilation");
        return;
      case "create-cover-letter":
        handleCreateOrOpenCoverLetter();
        return;
      case "create-response-letter":
        handleCreateOrOpenResponseLetter();
        return;
      case "create-readme":
        handleCreateArxivReadme();
        return;
      case "insert-declarations":
        handleInsertDeclarations();
        return;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        overlay={false}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-hairline border-b px-4 py-3 pr-12">
          <SheetTitle className="flex items-center gap-2 text-base">
            <LayersIcon className="size-4 text-primary" />
            End-to-End Research Pipeline
          </SheetTitle>
          <SheetDescription className="text-xs">
            Literature → Manuscript → Verification → Preprint (Priority 1) →
            Journal → Submission Package
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="rounded-lg border border-hairline bg-card/45 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[0.6875rem] text-muted-foreground uppercase tracking-[0.14em]">
                  Pipeline Readiness
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="font-serif text-2xl leading-none">
                    {report.readinessPercent}%
                  </span>
                  {report.detectedPublisherName && (
                    <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[0.7rem] text-primary">
                      {report.detectedPublisherName}
                    </span>
                  )}
                  {report.hasLeanFiles && (
                    <span className="rounded-full border border-hairline bg-background px-2 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
                      Lean 4: {report.leanSummary.declarationCount} decls
                      {report.leanSummary.sorryCount > 0
                        ? ` · ${report.leanSummary.sorryCount} sorry`
                        : " · clean"}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right text-[0.72rem] text-muted-foreground">
                <div>
                  <span className="font-medium text-destructive">
                    {report.totalBlockers}
                  </span>{" "}
                  blocker{report.totalBlockers === 1 ? "" : "s"} ·{" "}
                  <span className="font-medium text-[#b9822f]">
                    {report.totalWarnings}
                  </span>{" "}
                  warning{report.totalWarnings === 1 ? "" : "s"}
                </div>
                <div className="font-mono text-[0.6875rem]">
                  {report.mainFilePath ?? "No main .tex"}
                </div>
              </div>
            </div>

            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  report.readinessPercent >= 85
                    ? "bg-[#5db8a6]"
                    : report.readinessPercent >= 50
                      ? "bg-[#e8a55a]"
                      : "bg-primary",
                )}
                style={{ width: `${report.readinessPercent}%` }}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-hairline border-t pt-2.5">
              <span className="text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
                Preprint Target (Priority 1)
              </span>
              <div className="flex flex-wrap gap-1">
                {PREPRINT_SERVER_LIST.map((server) => (
                  <button
                    key={server.id}
                    type="button"
                    onClick={() => setPreprintServer(server.id)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[0.72rem] transition-colors",
                      preprintServer === server.id
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-hairline bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {server.shortLabel}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => handleStageAction("literature")}
            >
              <BookOpenIcon className="size-3.5" />
              Literature Search
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => handleStageAction("journal")}
            >
              <BookMarkedIcon className="size-3.5" />
              Journal Studio
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => handleStageAction("submission")}
            >
              <FileCheck2Icon className="size-3.5" />
              Submission Readiness
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => handleStageAction("compile")}
            >
              <RefreshCwIcon className="size-3.5" />
              Compile
            </Button>
          </div>

          <div className="space-y-2">
            {report.stages.map((stage) => {
              const statusStyle = STAGE_STATUS_STYLES[stage.status];
              const StatusIcon = statusStyle.icon;
              const isExpanded = expandedStageId === stage.id;

              return (
                <div
                  key={stage.id}
                  className={cn(
                    "rounded-lg border transition-colors",
                    stage.status === "blocked"
                      ? "border-destructive/25 bg-destructive/[0.03]"
                      : stage.status === "ready"
                        ? "border-[#5db8a6]/25 bg-[#5db8a6]/[0.03]"
                        : "border-hairline bg-card/30",
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedStageId(isExpanded ? "" : stage.id)
                    }
                    className="flex w-full items-start justify-between gap-2 p-3 text-left"
                  >
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-hairline bg-background font-mono text-[0.6875rem] text-muted-foreground">
                        {stage.step}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-[0.875rem] leading-snug">
                            {stage.title}
                          </span>
                          {stage.priorityBadge && (
                            <span className="rounded bg-primary/15 px-1.5 py-0.5 font-medium text-[0.65rem] text-primary">
                              {stage.priorityBadge}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[0.74rem] text-muted-foreground leading-relaxed">
                          {stage.summary}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[0.6875rem]",
                          statusStyle.badge,
                        )}
                      >
                        <StatusIcon className="size-3" />
                        {stage.score}%
                      </span>
                      {isExpanded ? (
                        <ChevronDownIcon className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRightIcon className="size-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="space-y-2.5 border-hairline border-t px-3 pt-2.5 pb-3">
                      <div className="space-y-1.5">
                        {stage.items.map((item) => {
                          const ItemIcon = item.passed
                            ? CheckCircle2Icon
                            : item.severity === "blocker"
                              ? AlertCircleIcon
                              : AlertTriangleIcon;
                          return (
                            <div
                              key={item.id}
                              className="flex items-start gap-2 rounded-md border border-hairline bg-background/70 px-2.5 py-2"
                            >
                              <ItemIcon
                                className={cn(
                                  "mt-0.5 size-3.5 shrink-0",
                                  item.passed
                                    ? "text-[#2a8f83]"
                                    : item.severity === "blocker"
                                      ? "text-destructive"
                                      : "text-[#b9822f]",
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-[0.78rem]">
                                  {item.label}
                                </div>
                                <div className="text-[0.72rem] text-muted-foreground leading-relaxed">
                                  {item.detail}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {stage.recommendedActions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {stage.recommendedActions.map((act) => (
                            <Button
                              key={`${stage.id}-${act.action}`}
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-7 text-xs"
                              onClick={() => handleStageAction(act.action)}
                            >
                              {act.label}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="space-y-2.5 rounded-lg border border-hairline bg-card/35 p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[0.75rem] text-muted-foreground uppercase tracking-[0.14em]">
                1-Click Package &amp; Declarations
              </span>
              <span className="text-[0.7rem] text-muted-foreground">
                Workspace generators
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="justify-start text-xs"
                onClick={handleCreateOrOpenCoverLetter}
              >
                <FileTextIcon className="size-3.5 text-primary" />
                {coverLetterFile
                  ? "Open cover-letter.tex"
                  : "Create cover-letter.tex"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="justify-start text-xs"
                onClick={handleCreateOrOpenResponseLetter}
              >
                <FileTextIcon className="size-3.5 text-primary" />
                {responseLetterFile
                  ? "Open response-to-reviewers.tex"
                  : "Create response-to-reviewers.tex"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="justify-start text-xs"
                onClick={handleCreateArxivReadme}
                disabled={!mainFile}
              >
                <FilePlus2Icon className="size-3.5 text-primary" />
                {readmeFile ? "Update 00README.json" : "Create 00README.json"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="justify-start text-xs"
                onClick={handleInsertDeclarations}
                disabled={!mainFile}
              >
                <SparklesIcon className="size-3.5 text-primary" />
                Insert Journal Declarations
              </Button>
            </div>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-full text-xs"
              onClick={() => void handleCopyDeclarations()}
            >
              <ClipboardCopyIcon className="size-3.5" />
              Copy Declarations &amp; Preprint Disclosure Snippet
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
