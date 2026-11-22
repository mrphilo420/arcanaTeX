"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  BookMarkedIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileCheck2Icon,
  FilePlus2Icon,
  InfoIcon,
  ListChecksIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  generateArxivReadmeJson,
  PREPRINT_SERVERS,
  type PreprintServerId,
} from "@/lib/preprints";
import {
  analyzeSubmission,
  createSourceZip,
  type CheckStatus,
  type SubmissionTarget,
} from "@/lib/submission";
import { detectMainFile } from "@/lib/project-files";
import { isLatexRelatedFile } from "@/lib/file-kind";
import { useDocumentStore, useIsPdfFresh } from "@/stores/document-store";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const TARGET_LABELS: Record<SubmissionTarget, string> = {
  arxiv: "arXiv (preprint · LaTeX source)",
  biorxiv: "bioRxiv / medRxiv (preprint · PDF-first)",
  "hal-osf": "HAL / OSF / ChemRxiv (preprint)",
  journal: "Peer-reviewed journal (Elsevier / IEEE / Springer / ...)",
  conference: "Conference (double-blind)",
};

const PREPRINT_TARGETS = new Set<SubmissionTarget>([
  "arxiv",
  "biorxiv",
  "hal-osf",
]);

function isPreprintTarget(
  target: SubmissionTarget,
): target is PreprintServerId {
  return PREPRINT_TARGETS.has(target);
}

const STATUS_ICONS = {
  pass: CheckCircle2Icon,
  warning: AlertTriangleIcon,
  blocker: AlertCircleIcon,
} satisfies Record<CheckStatus, typeof CheckCircle2Icon>;

export function SubmissionPanel() {
  const open = useDocumentStore((s) => s.isSubmissionOpen);
  const setOpen = useDocumentStore((s) => s.setSubmissionOpen);
  const setJournalOpen = useDocumentStore((s) => s.setJournalOpen);
  const setWorkflowOpen = useDocumentStore((s) => s.setWorkflowOpen);
  const files = useDocumentStore((s) => s.files);
  const mainFileId = useDocumentStore((s) => s.mainFileId);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const compiler = useDocumentStore((s) => s.compiler);
  const diagnostics = useDocumentStore((s) => s.compileDiagnostics);
  const compile = useDocumentStore((s) => s.compile);
  const isFreshPdf = useIsPdfFresh();
  const compileError = compile.error?.message ?? null;
  const pdfData = compile.pdf;
  const projectName = useDocumentStore((s) => s.projectName);
  const addFile = useDocumentStore((s) => s.addFile);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const requestJump = useDocumentStore((s) => s.requestJumpToPosition);
  const requestCompile = useDocumentStore((s) => s.requestCompile);
  const activeFile = files.find((file) => file.id === activeFileId);
  const isLatexActive = activeFile ? isLatexRelatedFile(activeFile) : false;

  const [target, setTarget] = useState<SubmissionTarget>(() => {
    if (typeof window === "undefined") return "arxiv";
    const saved = window.localStorage.getItem("open-prism:submission-target");
    return saved === "arxiv" ||
      saved === "biorxiv" ||
      saved === "hal-osf" ||
      saved === "journal" ||
      saved === "conference"
      ? saved
      : "arxiv";
  });
  const [anonymous, setAnonymous] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.localStorage.getItem("open-prism:submission-anonymous") === "1"
    );
  });
  const [includePdf, setIncludePdf] = useState(true);
  const [includeArxivReadme, setIncludeArxivReadme] = useState(true);
  const [isZipping, setIsZipping] = useState(false);

  useEffect(() => {
    window.localStorage.setItem("open-prism:submission-target", target);
  }, [target]);

  useEffect(() => {
    window.localStorage.setItem(
      "open-prism:submission-anonymous",
      anonymous ? "1" : "0",
    );
  }, [anonymous]);

  const report = useMemo(
    () =>
      analyzeSubmission({
        files,
        mainFileId,
        compiler,
        diagnostics,
        compileError,
        target,
        anonymous,
        hasFreshPdf: isFreshPdf,
      }),
    [
      anonymous,
      compiler,
      compileError,
      diagnostics,
      files,
      isFreshPdf,
      mainFileId,
      target,
    ],
  );

  const journalChecks = useMemo(
    () => report.checks.filter((check) => check.id.startsWith("journal-")),
    [report.checks],
  );
  const journalPassedCount = journalChecks.filter(
    (check) => check.status === "pass",
  ).length;

  const mainFile =
    files.find((file) => file.id === mainFileId) ??
    detectMainFile(files) ??
    null;

  const hasArxivReadmeInProject = files.some(
    (file) => file.path.toLowerCase() === "00readme.json",
  );
  const preprintMeta = isPreprintTarget(target)
    ? PREPRINT_SERVERS[target]
    : null;

  const handleAddArxivReadme = () => {
    const readmeContent = generateArxivReadmeJson(
      mainFile?.path ?? "main.tex",
      compiler,
    );
    addFile({
      name: "00README.json",
      path: "00README.json",
      type: "tex",
      content: readmeContent,
    });
    toast.success(
      hasArxivReadmeInProject
        ? "Updated 00README.json in project"
        : "Added 00README.json to project",
    );
  };

  const jumpToCheck = (filePath?: string, line?: number) => {
    if (!filePath || !line) return;
    const file = files.find((candidate) => candidate.path === filePath);
    if (!file || file.type !== "tex") return;

    const lines = (file.content ?? "").split("\n");
    let position = 0;
    for (let index = 0; index < line - 1; index++) {
      position += (lines[index]?.length ?? 0) + 1;
    }

    setActiveFile(file.id);
    requestJump(position);
  };

  const handleDownload = async () => {
    if (isZipping) return;
    setIsZipping(true);

    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const baseName = (mainFile?.name ?? projectName)
        .replace(/\.(tex|ltx)$/i, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "-");
      const extraFiles =
        target === "arxiv" && includeArxivReadme && mainFile
          ? [
              {
                path: "00README.json",
                content: generateArxivReadmeJson(mainFile.path, compiler),
              },
            ]
          : undefined;
      const zip = createSourceZip(
        files,
        includePdf && isFreshPdf && pdfData
          ? {
              path: `${baseName || "document"}.pdf`,
              data: pdfData,
            }
          : null,
        extraFiles,
      );
      const blob = new Blob([new Uint8Array(zip)], {
        type: "application/zip",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${baseName || "project"}-${target}-${new Date()
        .toISOString()
        .slice(0, 10)}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Source bundle downloaded");
    } catch (error) {
      console.error("Failed to build source bundle", error);
      toast.error("Could not build the source bundle");
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen} modal={false}>
      <SheetContent
        overlay={false}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[500px]"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-hairline border-b px-4 py-3 pr-12">
          <SheetTitle className="flex items-center gap-2 text-base">
            <FileCheck2Icon className="size-4 text-primary" />
            Submission readiness
          </SheetTitle>
          <SheetDescription className="text-xs">
            Local heuristic checks and a clean source bundle. Nothing is
            uploaded.
          </SheetDescription>
          <div className="pt-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => {
                setOpen(false);
                setWorkflowOpen(true);
              }}
            >
              <ListChecksIcon className="size-3.5 text-primary" />
              Open 6-stage Research Pipeline
            </Button>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.75rem] text-muted-foreground uppercase tracking-[0.14em]">
                Target
              </span>
              <Select
                value={target}
                onValueChange={(value) => setTarget(value as SubmissionTarget)}
              >
                <SelectTrigger
                  size="sm"
                  className="h-8 w-[260px] max-w-full text-[0.75rem]"
                  aria-label="Submission target"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TARGET_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[0.875rem]">
              <input
                type="checkbox"
                checked={anonymous || target === "conference"}
                disabled={target === "conference"}
                onChange={(event) => setAnonymous(event.target.checked)}
                className="accent-primary"
              />
              Check for identity markers (double-blind review)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[0.875rem]">
              <input
                type="checkbox"
                checked={includePdf}
                onChange={(event) => setIncludePdf(event.target.checked)}
                className="accent-primary"
              />
              Include the compiled PDF in the bundle
            </label>
            {target === "arxiv" && (
              <div className="space-y-2 pt-0.5">
                <label className="flex cursor-pointer items-center gap-2 text-[0.875rem]">
                  <input
                    type="checkbox"
                    checked={includeArxivReadme}
                    onChange={(event) =>
                      setIncludeArxivReadme(event.target.checked)
                    }
                    className="accent-primary"
                  />
                  Include arXiv 00README.json in ZIP
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={handleAddArxivReadme}
                  disabled={!mainFile}
                >
                  <FilePlus2Icon className="size-3.5" />
                  {hasArxivReadmeInProject
                    ? "Update 00README.json in project"
                    : "Add 00README.json to project"}
                </Button>
              </div>
            )}
          </div>

          {preprintMeta && (
            <div className="rounded-lg border border-hairline bg-card/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <InfoIcon className="size-3.5 text-primary" />
                  <span className="font-medium text-[0.8125rem]">
                    {preprintMeta.label} Guidance
                  </span>
                </div>
                <span className="rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-mono text-[0.6875rem] text-primary">
                  {preprintMeta.primarySubmissionMode === "tex-source"
                    ? "LaTeX source"
                    : "PDF-first"}
                </span>
              </div>
              <p className="mt-1 text-[0.75rem] text-muted-foreground leading-relaxed">
                {preprintMeta.screeningSummary}
              </p>
              <ul className="mt-2 space-y-1 text-[0.72rem] text-muted-foreground">
                {preprintMeta.keyRules.map((rule) => (
                  <li key={rule} className="flex items-start gap-1.5">
                    <span className="mt-1 size-1 shrink-0 rounded-full bg-primary/70" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 border-hairline border-t pt-1.5 text-[0.7rem] text-muted-foreground">
                <strong className="font-medium text-foreground/80">
                  Licensing:
                </strong>{" "}
                {preprintMeta.licenseSummary}
              </p>
            </div>
          )}

          {(report.detectedPublisher || target === "journal") && (
            <div className="rounded-lg border border-hairline bg-card/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[0.6875rem] text-muted-foreground uppercase tracking-[0.14em]">
                    Publisher
                  </span>
                  {report.detectedPublisher ? (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 font-medium text-[0.75rem] text-primary">
                        <BookMarkedIcon className="size-3" />
                        {report.detectedPublisher.name}
                      </span>
                      <span className="rounded border border-hairline bg-background px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
                        {report.detectedPublisher.columns}
                      </span>
                    </>
                  ) : (
                    <span className="rounded border border-hairline bg-background px-2 py-0.5 text-[0.75rem] text-muted-foreground">
                      Generic LaTeX article
                    </span>
                  )}
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    setOpen(false);
                    setJournalOpen(true);
                  }}
                >
                  <BookMarkedIcon className="size-3" />
                  Journal Studio
                </Button>
              </div>

              {journalChecks.length > 0 && (
                <div className="mt-2 flex items-center justify-between text-[0.75rem]">
                  <span
                    className={cn(
                      "font-medium",
                      journalPassedCount === journalChecks.length
                        ? "text-[#2a8f83]"
                        : "text-[#b9822f]",
                    )}
                  >
                    Publisher compliance: {journalPassedCount}/
                    {journalChecks.length} checks passed
                  </span>
                  {report.detectedPublisher && (
                    <span className="font-mono text-[0.6875rem] text-muted-foreground">
                      bib: {report.detectedPublisher.recommendedBibStyle}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-1.5">
            {(["blocker", "warning", "pass"] as CheckStatus[]).map((status) => {
              const Icon = STATUS_ICONS[status];
              return (
                <div
                  key={status}
                  className={cn(
                    "rounded-lg border p-2.5 text-center",
                    status === "blocker"
                      ? "border-destructive/25 bg-destructive/5"
                      : status === "warning"
                        ? "border-[#b9822f]/25 bg-[#b9822f]/5"
                        : "border-[#5db8a6]/25 bg-[#5db8a6]/5",
                  )}
                >
                  <Icon
                    className={cn(
                      "mx-auto mb-1 size-3.5",
                      status === "blocker"
                        ? "text-destructive"
                        : status === "warning"
                          ? "text-[#b9822f]"
                          : "text-[#2a8f83]",
                    )}
                  />
                  <div className="font-serif text-[1.25rem] leading-none">
                    {report.counts[status]}
                  </div>
                  <div className="mt-1 text-[0.75rem] text-muted-foreground uppercase tracking-[0.1em]">
                    {status}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            {report.checks.map((check) => {
              const Icon = STATUS_ICONS[check.status];
              return (
                <button
                  key={check.id}
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg border p-3 text-left transition-colors",
                    check.filePath
                      ? "hover:border-primary/35 hover:bg-card/60"
                      : "cursor-default",
                    check.status === "blocker"
                      ? "border-destructive/20"
                      : check.status === "warning"
                        ? "border-[#b9822f]/20"
                        : "border-[#5db8a6]/20",
                  )}
                  onClick={() => jumpToCheck(check.filePath, check.line)}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      check.status === "blocker"
                        ? "text-destructive"
                        : check.status === "warning"
                          ? "text-[#b9822f]"
                          : "text-[#2a8f83]",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-[0.875rem] leading-snug">
                        {check.title}
                      </span>
                      <span className="shrink-0 font-mono text-[0.75rem] text-muted-foreground uppercase">
                        {check.category}
                      </span>
                    </div>
                    <p className="mt-1 text-[0.75rem] text-muted-foreground leading-relaxed">
                      {check.detail}
                    </p>
                    {check.filePath && (
                      <p className="mt-1 font-mono text-[0.75rem] text-primary/80">
                        {check.filePath}
                        {check.line ? `:${check.line}` : ""} · click to jump
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border border-hairline bg-card/30 p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[0.75rem] text-muted-foreground uppercase tracking-[0.14em]">
                Source bundle
              </span>
              <span className="font-mono text-[0.75rem] text-muted-foreground">
                {report.bundle.length} files ·{" "}
                {report.bundleBytes > 1024 * 1024
                  ? `${(report.bundleBytes / 1024 / 1024).toFixed(1)} MB`
                  : `${Math.max(1, Math.round(report.bundleBytes / 1024))} KB`}
              </span>
            </div>
            <p className="mt-1 text-[0.75rem] text-muted-foreground leading-relaxed">
              Build artifacts are excluded. Sources, bibliography, figures, and
              class/style files are included.
            </p>
            <Button
              className="mt-3 w-full"
              onClick={() => void handleDownload()}
              disabled={isZipping || !mainFile}
            >
              {isZipping ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <DownloadIcon className="size-3.5" />
              )}
              Download source bundle (.zip)
            </Button>
          </div>

          {compileError && isLatexActive && (
            <div className="flex items-center justify-between rounded-lg border border-destructive/25 bg-destructive/5 p-3">
              <div className="text-[0.75rem] text-destructive">
                The project has a compile error.
              </div>
              <Button variant="outline" size="sm" onClick={requestCompile}>
                <RefreshCwIcon className="size-3.5" />
                Compile
              </Button>
            </div>
          )}

          <p className="text-[0.75rem] text-muted-foreground leading-relaxed">
            These checks are local heuristics. They do not guarantee acceptance.
            Check the current portal requirements and build the bundle in a
            clean TeX environment.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
