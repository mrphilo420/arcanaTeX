"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  ArchiveIcon,
  CheckCircle2Icon,
  FolderUpIcon,
  GlobeIcon,
  Loader2Icon,
  PackageOpenIcon,
  RotateCcwIcon,
  SparklesIcon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LATEX_COMPILERS, type LatexCompiler } from "@/lib/latex-compiler";
import { applySafePackageFixes } from "@/lib/package-intelligence";
import {
  type ImportedProject,
  importArxivPackage,
  importResearchPackageFile,
} from "@/lib/project-import";
import { isLatexDocumentFile } from "@/lib/project-files";
import { cn } from "@/lib/utils";

type SourceTab = "archive" | "arxiv";
export type ImportCommitAction = "create" | "replace" | "merge";

export interface PackageImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "workspace";
  onImportProject: (
    project: ImportedProject,
    action: ImportCommitAction,
  ) => Promise<void> | void;
  onTriggerFolderPicker?: () => void;
}

const ACCEPTED_PACKAGES =
  ".zip,.tar,.gz,.tgz,.tar.gz,.bz2,.tbz2,.xz,.txz,.rar,.7z,.ipynb,.qmd,.rmd,.md,.pdf,.tex";

export function PackageImportDialog({
  open,
  onOpenChange,
  mode,
  onImportProject,
  onTriggerFolderPicker,
}: PackageImportDialogProps) {
  const [sourceTab, setSourceTab] = useState<SourceTab>("archive");
  const [arxivInput, setArxivInput] = useState("");
  const [isUnpacking, setIsUnpacking] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const [staged, setStaged] = useState<ImportedProject | null>(null);
  const [projectName, setProjectName] = useState("");
  const [compiler, setCompiler] = useState<LatexCompiler>("pdflatex");
  const [mainFilePath, setMainFilePath] = useState<string>("");
  const [applyLintFixes, setApplyLintFixes] = useState(true);
  const [workspaceAction, setWorkspaceAction] =
    useState<Exclude<ImportCommitAction, "create">>("merge");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStaged(null);
    setProjectName("");
    setCompiler("pdflatex");
    setMainFilePath("");
    setErrorMessage(null);
    setIsDraggingFile(false);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && !isUnpacking && !isCommitting) {
      resetState();
    }
    onOpenChange(nextOpen);
  };

  const stageUnpacked = (unpacked: ImportedProject) => {
    setStaged(unpacked);
    setProjectName(unpacked.projectName);
    setCompiler(unpacked.recommendedCompiler ?? "pdflatex");
    setMainFilePath(unpacked.mainFilePath ?? "");
    if (mode === "workspace") {
      setWorkspaceAction(
        unpacked.report?.isFullLatexProject ? "replace" : "merge",
      );
    }
    setErrorMessage(null);
  };

  const handleUnpackFile = async (file: File) => {
    setIsUnpacking(true);
    setErrorMessage(null);
    try {
      const result = await importResearchPackageFile(file);
      stageUnpacked(result);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Could not unpack archive.";
      setErrorMessage(msg);
      toast.error("Package unpack failed", { description: msg });
    } finally {
      setIsUnpacking(false);
    }
  };

  const handleFetchArxiv = async () => {
    if (!arxivInput.trim() || isUnpacking) return;
    setIsUnpacking(true);
    setErrorMessage(null);
    try {
      const result = await importArxivPackage(arxivInput.trim());
      stageUnpacked(result);
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Could not fetch arXiv source bundle.";
      setErrorMessage(msg);
      toast.error("arXiv import failed", { description: msg });
    } finally {
      setIsUnpacking(false);
    }
  };

  const texOptions = useMemo(() => {
    if (!staged) return [];
    return staged.files.filter((f) =>
      isLatexDocumentFile({ name: f.name, type: f.type }),
    );
  }, [staged]);

  const handleCommit = async () => {
    if (!staged || isCommitting) return;
    setIsCommitting(true);

    try {
      let finalFiles = staged.files;
      if (applyLintFixes) {
        const fixed = applySafePackageFixes(finalFiles);
        finalFiles = fixed.files;
      }

      const finalProject: ImportedProject = {
        ...staged,
        projectName: projectName.trim() || staged.projectName,
        files: finalFiles,
        recommendedCompiler: compiler,
        mainFilePath: mainFilePath || staged.mainFilePath || null,
      };

      const action: ImportCommitAction =
        mode === "create" ? "create" : workspaceAction;

      await onImportProject(finalProject, action);
      resetState();
      onOpenChange(false);
    } catch (error) {
      toast.error("Could not finalize import", {
        description:
          error instanceof Error ? error.message : "Import commit failed.",
      });
    } finally {
      setIsCommitting(false);
    }
  };

  const report = staged?.report;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageOpenIcon className="size-4 text-primary" />
            Import Research Package or Archive
          </DialogTitle>
          <DialogDescription>
            Unpacks <code>.zip</code>, <code>.tar.gz</code>, <code>.tgz</code>,{" "}
            <code>.tar.bz2</code>, <code>.rar</code>, <code>.7z</code>, Jupyter{" "}
            <code>.ipynb</code>, Quarto <code>.qmd</code>, <code>.pdf</code>, or
            live arXiv source bundles with automatic preflight detection.
          </DialogDescription>
        </DialogHeader>

        {!staged ? (
          <div className="space-y-4">
            <div className="flex items-center gap-1 rounded-lg border border-border/80 bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => setSourceTab("archive")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors",
                  sourceTab === "archive"
                    ? "bg-background font-medium text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ArchiveIcon className="size-3.5" />
                Archive / Research File
              </button>
              <button
                type="button"
                onClick={() => setSourceTab("arxiv")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors",
                  sourceTab === "arxiv"
                    ? "bg-background font-medium text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <GlobeIcon className="size-3.5" />
                arXiv e-Print ID / URL
              </button>
            </div>

            {sourceTab === "archive" ? (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_PACKAGES}
                  className="hidden"
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    event.target.value = "";
                    if (selected) void handleUnpackFile(selected);
                  }}
                />

                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDraggingFile(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setIsDraggingFile(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDraggingFile(false);
                    const file = event.dataTransfer.files?.[0];
                    if (file) void handleUnpackFile(file);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
                    isDraggingFile
                      ? "border-primary bg-primary/5"
                      : "border-border/80 bg-muted/20",
                  )}
                >
                  {isUnpacking ? (
                    <>
                      <Loader2Icon className="mb-2 size-6 animate-spin text-primary" />
                      <p className="font-medium text-sm">
                        Unpacking &amp; analyzing package…
                      </p>
                      <p className="mt-1 text-muted-foreground text-xs">
                        Inspecting TeX hierarchy, compiler directives, and
                        referenced assets
                      </p>
                    </>
                  ) : (
                    <>
                      <span className="mb-2.5 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <UploadIcon className="size-5" />
                      </span>
                      <p className="font-medium text-sm">
                        Drop your archive or research file here
                      </p>
                      <p className="mt-1 text-muted-foreground text-xs">
                        Supports .zip, .tar.gz, .tgz, .tar.bz2, .tar.xz, .rar,
                        .7z, .ipynb, .qmd, .pdf (max 40 MB)
                      </p>
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Choose Package File
                        </Button>
                        {onTriggerFolderPicker && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={onTriggerFolderPicker}
                          >
                            <FolderUpIcon className="mr-1.5 size-3.5" />
                            Pick Local Folder…
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="arxiv-import-id" className="text-xs">
                    arXiv Identifier or Paper URL
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="arxiv-import-id"
                      value={arxivInput}
                      onChange={(e) => setArxivInput(e.target.value)}
                      placeholder="2305.12345 or https://arxiv.org/abs/2305.12345"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleFetchArxiv();
                      }}
                    />
                    <Button
                      type="button"
                      onClick={() => void handleFetchArxiv()}
                      disabled={!arxivInput.trim() || isUnpacking}
                    >
                      {isUnpacking ? (
                        <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />
                      ) : (
                        <GlobeIcon className="mr-1.5 size-3.5" />
                      )}
                      Fetch
                    </Button>
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">
                  Downloads the official LaTeX e-print tarball directly from{" "}
                  <code>arxiv.org/e-print</code>, reads{" "}
                  <code>00README.json</code>/<code>00README.XXX</code> compiler
                  directives, and prepares all source &amp; figure files.
                </p>
              </div>
            )}

            {errorMessage && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/25 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                {staged.format && (
                  <span className="rounded bg-primary/10 px-2 py-0.5 font-medium font-mono text-primary">
                    {staged.format}
                  </span>
                )}
                {report?.detectedPublisher && (
                  <span className="rounded border border-border bg-background px-2 py-0.5 font-medium">
                    {report.detectedPublisher.shortName}
                  </span>
                )}
                <span className="text-muted-foreground">
                  {staged.files.length} files
                  {report
                    ? ` (${report.counts.tex} tex · ${report.counts.bib} bib/bbl · ${report.counts.figures} fig · ${report.counts.styles} cls/sty)`
                    : ""}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={resetState}
              >
                <RotateCcwIcon className="size-3" />
                Change Source
              </Button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="imported-project-name" className="text-xs">
                  Project Name
                </Label>
                <Input
                  id="imported-project-name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="imported-compiler" className="text-xs">
                    Recommended Compiler
                  </Label>
                  <Select
                    value={compiler}
                    onValueChange={(v) => setCompiler(v as LatexCompiler)}
                  >
                    <SelectTrigger
                      id="imported-compiler"
                      className="h-8 text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LATEX_COMPILERS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="imported-main" className="text-xs">
                    Main Document
                  </Label>
                  <Select
                    value={mainFilePath || "__none__"}
                    onValueChange={(v) =>
                      setMainFilePath(v === "__none__" ? "" : v)
                    }
                    disabled={texOptions.length === 0}
                  >
                    <SelectTrigger id="imported-main" className="h-8 text-xs">
                      <SelectValue placeholder="Auto-detect main .tex" />
                    </SelectTrigger>
                    <SelectContent>
                      {texOptions.length === 0 ? (
                        <SelectItem value="__none__">No .tex file</SelectItem>
                      ) : (
                        texOptions.map((f) => (
                          <SelectItem key={f.path} value={f.path}>
                            {f.path}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {report && (
              <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-medium">
                    {report.lintErrorCount === 0 ? (
                      <>
                        <CheckCircle2Icon className="size-3.5 text-emerald-600" />
                        <span>
                          Preflight Lint: 0 errors ({report.lintWarningCount}{" "}
                          warnings)
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertTriangleIcon className="size-3.5 text-amber-600" />
                        <span>
                          Preflight Lint: {report.lintErrorCount} error(s),{" "}
                          {report.lintWarningCount} warning(s)
                        </span>
                      </>
                    )}
                  </div>
                  {report.fixableLintCount > 0 && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={applyLintFixes}
                        onChange={(e) => setApplyLintFixes(e.target.checked)}
                        className="rounded border-border accent-primary"
                      />
                      <span>
                        Auto-fix {report.fixableLintCount} safe lint issue(s)
                      </span>
                    </label>
                  )}
                </div>

                {report.missingReferences.length > 0 && (
                  <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 text-amber-700 dark:text-amber-300">
                    Missing referenced assets:{" "}
                    <span className="font-mono">
                      {report.missingReferences.slice(0, 6).join(", ")}
                      {report.missingReferences.length > 6 ? "…" : ""}
                    </span>
                  </div>
                )}

                {report.notes.length > 0 && (
                  <ul className="space-y-0.5 text-muted-foreground">
                    {report.notes.slice(0, 4).map((note) => (
                      <li key={note} className="flex items-start gap-1.5">
                        <SparklesIcon className="mt-0.5 size-3 shrink-0 text-primary" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {mode === "workspace" && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setWorkspaceAction("merge")}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                    workspaceAction === "merge"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/80 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <div className="font-medium">Merge into Current Project</div>
                  <div className="mt-0.5 text-[11px] opacity-80">
                    Adds extracted figures, styles, or sections alongside
                    existing files.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceAction("replace")}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                    workspaceAction === "replace"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/80 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <div className="font-medium">Replace Workspace Project</div>
                  <div className="mt-0.5 text-[11px] opacity-80">
                    Loads this unpacked manuscript with its compiler &amp; main
                    file.
                  </div>
                </button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isUnpacking || isCommitting}
          >
            Cancel
          </Button>
          {staged && (
            <Button
              type="button"
              onClick={() => void handleCommit()}
              disabled={isCommitting}
            >
              {isCommitting && (
                <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />
              )}
              {mode === "create"
                ? "Create & Open Project"
                : workspaceAction === "merge"
                  ? `Merge ${staged.files.length} Files`
                  : "Replace Workspace Project"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
