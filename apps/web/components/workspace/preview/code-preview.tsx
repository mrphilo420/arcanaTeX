"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CopyIcon,
  DownloadIcon,
  FileCode2Icon,
  FilePlus2Icon,
  ImageIcon,
  LoaderIcon,
  PlayIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  codeArtifactToDataUrl,
  downloadCodeArtifact,
} from "@/lib/code-artifacts";
import type {
  CodeArtifact,
  CodeLanguage,
  CodeRunResult,
  CodeRuntimesProbe,
} from "@/lib/code-runner";
import {
  buildLatexFigureSnippet,
  ensureGraphicxInLatex,
} from "@/lib/figure-engine";
import { fileKindForFile } from "@/lib/file-kind";
import {
  detectMainFile,
  fileTypeForName,
  getBaseName,
  getExtension,
  isLatexDocumentFile,
  mimeTypeForName,
} from "@/lib/project-files";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";

function isVisualFigureArtifact(artifact: CodeArtifact): boolean {
  const ext = getExtension(artifact.path);
  return (
    ext === "png" ||
    ext === "svg" ||
    ext === "jpg" ||
    ext === "jpeg" ||
    ext === "pdf" ||
    ext === "eps"
  );
}

function isPreviewableImageArtifact(artifact: CodeArtifact): boolean {
  const ext = getExtension(artifact.path);
  return ext === "png" || ext === "svg" || ext === "jpg" || ext === "jpeg";
}

function stemOfPath(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx === -1 ? path : path.slice(0, idx);
}

export function CodePreview() {
  const files = useDocumentStore((s) => s.files);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const mainFileId = useDocumentStore((s) => s.mainFileId);
  const addFile = useDocumentStore((s) => s.addFile);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const updateFileContent = useDocumentStore((s) => s.updateFileContent);
  const requestCompile = useDocumentStore((s) => s.requestCompile);

  const activeFile = useMemo(
    () => files.find((f) => f.id === activeFileId) ?? null,
    [files, activeFileId],
  );
  const activeKind = activeFile ? fileKindForFile(activeFile) : "other";
  const language: CodeLanguage = activeKind === "r" ? "r" : "python";
  const code = activeFile?.content ?? "";

  const targetTexFile = useMemo(() => {
    const main =
      files.find((f) => f.id === mainFileId) ?? detectMainFile(files) ?? null;
    return main && isLatexDocumentFile(main) ? main : null;
  }, [files, mainFileId]);

  const dataFiles = useMemo(
    () =>
      files.filter((file) => {
        if (file.type !== "tex" || !file.content) return false;
        const ext = getExtension(file.path || file.name);
        return (
          ext === "csv" || ext === "tsv" || ext === "json" || ext === "dat"
        );
      }),
    [files],
  );

  const [runtimes, setRuntimes] = useState<CodeRuntimesProbe | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<CodeRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/code/run")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CodeRuntimesProbe | null) => {
        if (!cancelled && data) setRuntimes(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRunCode = useCallback(async () => {
    const state = useDocumentStore.getState();
    const currentFile = state.files.find((f) => f.id === state.activeFileId);
    if (!currentFile) return;

    const currentKind = fileKindForFile(currentFile);
    if (currentKind !== "python" && currentKind !== "r") return;
    const runLanguage: CodeLanguage = currentKind === "r" ? "r" : "python";
    const sourceCode = (currentFile.content ?? "").trim();

    if (!sourceCode) {
      toast.error("File is empty. Write some Python or R code to run.");
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      const attachedFiles = state.files
        .filter((file) => {
          if (file.type !== "tex" || !file.content) return false;
          const ext = getExtension(file.path || file.name);
          return (
            ext === "csv" || ext === "tsv" || ext === "json" || ext === "dat"
          );
        })
        .slice(0, 16)
        .map((file) => ({
          path: file.path,
          content: (file.content ?? "").slice(0, 200_000),
        }));

      const response = await fetch("/api/code/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: runLanguage,
          code: sourceCode,
          files: attachedFiles,
        }),
      });

      const payload = (await response.json()) as CodeRunResult & {
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error || "Code execution failed.");
        return;
      }

      setResult(payload);
      if (payload.success) {
        toast.success(
          `${runLanguage === "python" ? "Python" : "R"} execution succeeded (${payload.durationMs} ms)`,
        );
      } else {
        toast.error(
          `${runLanguage === "python" ? "Python" : "R"} exited with code ${payload.exitCode ?? 1}`,
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reach code runner.",
      );
    } finally {
      setIsRunning(false);
    }
  }, []);

  useEffect(() => {
    const onRunEvent = () => {
      void handleRunCode();
    };
    window.addEventListener("arcanatex:run-code", onRunEvent);
    return () => window.removeEventListener("arcanatex:run-code", onRunEvent);
  }, [handleRunCode]);

  const figureCards = useMemo(() => {
    if (!result) return [];
    const figureArtifacts = result.artifacts.filter(isVisualFigureArtifact);
    const byStem = new Map<
      string,
      {
        stem: string;
        preview?: CodeArtifact;
        pdf?: CodeArtifact;
        all: CodeArtifact[];
      }
    >();

    for (const art of figureArtifacts) {
      const stem = stemOfPath(art.path);
      const group = byStem.get(stem) ?? { stem, all: [] };
      group.all.push(art);
      const ext = getExtension(art.path);
      if (ext === "pdf") {
        group.pdf = art;
      } else if (
        isPreviewableImageArtifact(art) &&
        (!group.preview || ext === "png")
      ) {
        group.preview = art;
      }
      byStem.set(stem, group);
    }

    return Array.from(byStem.values());
  }, [result]);

  const textArtifacts = useMemo(() => {
    if (!result) return [];
    return result.artifacts.filter((art) => !isVisualFigureArtifact(art));
  }, [result]);

  const saveArtifactGroupToProject = (
    artifacts: CodeArtifact[],
  ): string | null => {
    const currentActiveId = useDocumentStore.getState().activeFileId;
    let preferredGraphicPath: string | null = null;

    for (const artifact of artifacts) {
      const ext = getExtension(artifact.path);
      const mimeType =
        artifact.mimeType ?? mimeTypeForName(artifact.path) ?? "text/plain";
      const type = fileTypeForName(artifact.path, mimeType);
      const isBinaryOrImage =
        artifact.encoding === "base64" || type === "image" || type === "binary";

      addFile({
        name: getBaseName(artifact.path),
        path: artifact.path,
        type,
        mimeType,
        dataUrl: isBinaryOrImage ? codeArtifactToDataUrl(artifact) : undefined,
        content: artifact.encoding === "utf-8" ? artifact.content : undefined,
      });

      if (ext === "pdf") {
        preferredGraphicPath = artifact.path;
      } else if (!preferredGraphicPath) {
        preferredGraphicPath = artifact.path;
      }
    }

    if (currentActiveId) {
      setActiveFile(currentActiveId);
    }
    return preferredGraphicPath;
  };

  const handleSaveGroup = (artifacts: CodeArtifact[]) => {
    const saved = saveArtifactGroupToProject(artifacts);
    if (saved) {
      toast.success(
        `Saved ${artifacts.map((a) => a.path).join(", ")} to project`,
      );
    }
  };

  const handleInsertFigureGroupIntoLatex = (artifacts: CodeArtifact[]) => {
    if (!targetTexFile) {
      toast.error("No main LaTeX (.tex) document found in project.");
      return;
    }
    const graphicPath = saveArtifactGroupToProject(artifacts);
    if (!graphicPath) return;

    const stemName = getBaseName(stemOfPath(graphicPath));
    const snippet = buildLatexFigureSnippet({
      imagePath: graphicPath,
      caption: `Figure generated by ${activeFile?.path ?? (language === "python" ? "Python" : "R")}.`,
      label: `fig:${stemName.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`,
      doubleColumn: false,
    });

    const latestTex =
      useDocumentStore.getState().files.find((f) => f.id === targetTexFile.id)
        ?.content ??
      targetTexFile.content ??
      "";
    const nextTex = ensureGraphicxInLatex(latestTex, snippet);

    updateFileContent(targetTexFile.id, nextTex);
    setActiveFile(targetTexFile.id);
    requestCompile();
    toast.success(`Inserted ${graphicPath} into ${targetTexFile.path}`);
  };

  const handleInsertTexArtifactIntoLatex = (artifact: CodeArtifact) => {
    if (!targetTexFile) {
      toast.error("No main LaTeX (.tex) document found in project.");
      return;
    }
    const latestTex =
      useDocumentStore.getState().files.find((f) => f.id === targetTexFile.id)
        ?.content ??
      targetTexFile.content ??
      "";
    const endDoc = latestTex.match(/\\end\{document\}/);
    const block = `\n\n% Generated from ${activeFile?.path ?? artifact.path}\n${artifact.content.trim()}\n\n`;
    const nextTex =
      endDoc && endDoc.index !== undefined
        ? latestTex.slice(0, endDoc.index).trimEnd() +
          block +
          latestTex.slice(endDoc.index)
        : `${latestTex.trimEnd()}${block}`;

    updateFileContent(targetTexFile.id, nextTex);
    setActiveFile(targetTexFile.id);
    requestCompile();
    toast.success(`Inserted ${artifact.path} into ${targetTexFile.path}`);
  };

  const handleDownloadArtifact = downloadCodeArtifact;

  const runtimeInfo = language === "python" ? runtimes?.python : runtimes?.r;

  return (
    <div className="flex h-full flex-col bg-pdf-canvas">
      {/* Top Preview Toolbar */}
      <div className="no-scrollbar flex h-9 items-center justify-between gap-2 overflow-x-auto border-border border-b bg-background px-2.5">
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-medium text-[0.7rem] text-primary">
            <FileCode2Icon className="size-3.5" />
            {language === "python" ? "Python 3" : "Rscript"}
          </span>
          <span className="truncate font-mono text-[0.72rem] text-muted-foreground">
            {activeFile?.path ?? ""}
          </span>
          {runtimeInfo && (
            <span
              className={cn(
                "hidden items-center gap-1 rounded-full border px-2 py-0.2 font-mono text-[0.65rem] sm:inline-flex",
                runtimeInfo.available
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-destructive/30 bg-destructive/10 text-destructive",
              )}
            >
              {runtimeInfo.available
                ? `${runtimeInfo.version ?? "ready"} · ${runtimeInfo.packages.slice(0, 3).join(", ")}`
                : "runtime unavailable"}
            </span>
          )}
          {dataFiles.length > 0 && (
            <span className="hidden text-[0.68rem] text-muted-foreground md:inline">
              · {dataFiles.length} data file{dataFiles.length === 1 ? "" : "s"}{" "}
              mounted
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {result && (
            <span
              className="flex items-center gap-1 font-mono text-[0.68rem] text-muted-foreground"
              title={
                result.sandboxed
                  ? "Executed in isolated Seatbelt sandbox"
                  : undefined
              }
            >
              {result.sandboxed && (
                <ShieldCheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              )}
              {result.durationMs} ms
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-6 gap-1 px-2.5 text-xs"
            onClick={() => void handleRunCode()}
            disabled={isRunning || !code.trim()}
          >
            {isRunning ? (
              <>
                <LoaderIcon className="size-3 animate-spin" />
                Running…
              </>
            ) : (
              <>
                <PlayIcon className="size-3" />
                Run {language === "python" ? "Python" : "R"}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive text-xs">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            <div className="whitespace-pre-wrap">{error}</div>
          </div>
        )}

        {!result && !error && !isRunning && (
          <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-hairline bg-background/70 p-8 text-center">
            <TerminalIcon className="mb-3 size-10 text-muted-foreground/45" />
            <h2 className="mb-1 font-medium text-base text-foreground">
              {language === "python" ? "Python" : "R"} Scientific Runtime &
              Figure Compiler
            </h2>
            <p className="mb-4 max-w-md text-muted-foreground text-xs leading-relaxed">
              Execute{" "}
              <span className="font-mono text-foreground">
                {activeFile?.path}
              </span>{" "}
              in an isolated local sandbox. Plots saved to{" "}
              <code className="rounded bg-muted px-1 py-0.5">.pdf</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5">.png</code>, or{" "}
              <code className="rounded bg-muted px-1 py-0.5">.svg</code> are
              automatically rendered below and ready for 1-click LaTeX
              insertion.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleRunCode()}
              disabled={!code.trim()}
              className="gap-1.5"
            >
              <PlayIcon className="size-3.5" />
              Run {language === "python" ? "Python" : "R"} Script
            </Button>
          </div>
        )}

        {/* Rendered Figures Cards */}
        {figureCards.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wider">
              <ImageIcon className="size-3.5 text-primary" />
              Rendered Figures ({figureCards.length})
            </div>

            {figureCards.map((card) => (
              <div
                key={card.stem}
                className="overflow-hidden rounded-lg border border-hairline bg-background shadow-2xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-hairline border-b bg-muted/30 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CheckCircle2Icon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-medium font-mono text-xs">
                      {card.preview?.path ?? card.pdf?.path ?? card.stem}
                    </span>
                    {card.all.map((art) => (
                      <span
                        key={art.path}
                        className="rounded border border-hairline bg-background px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground"
                      >
                        .{getExtension(art.path).toUpperCase()}
                        {art.bytes
                          ? ` · ${Math.max(1, Math.round(art.bytes / 1024))} KB`
                          : ""}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 gap-1 px-2 text-[0.7rem]"
                      onClick={() => handleSaveGroup(card.all)}
                    >
                      <FilePlus2Icon className="size-3" />
                      Save to project
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-6 gap-1 px-2 text-[0.7rem]"
                      onClick={() => handleInsertFigureGroupIntoLatex(card.all)}
                      disabled={!targetTexFile}
                    >
                      <SparklesIcon className="size-3" />
                      Insert into LaTeX
                    </Button>
                    {(card.pdf ?? card.preview) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 gap-1 px-2 text-[0.7rem]"
                        onClick={() =>
                          handleDownloadArtifact(
                            (card.pdf ?? card.preview) as CodeArtifact,
                          )
                        }
                      >
                        <DownloadIcon className="size-3" />
                        Download
                      </Button>
                    )}
                  </div>
                </div>

                {card.preview ? (
                  <div className="flex items-center justify-center bg-white p-4">
                    <img
                      src={codeArtifactToDataUrl(card.preview)}
                      alt={card.preview.path}
                      className="max-h-[360px] w-auto object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-muted/15 px-4 py-3 text-muted-foreground text-xs">
                    <span>
                      Vector PDF artifact synthesized ({card.pdf?.path}). Save
                      or insert into LaTeX to render in the manuscript PDF.
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Generated Text / TeX Artifacts */}
        {textArtifacts.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <div className="font-semibold text-xs uppercase tracking-wider">
              Generated Artifacts ({textArtifacts.length})
            </div>
            {textArtifacts.map((art) => {
              const ext = getExtension(art.path);
              const isTexLike =
                ext === "tex" || ext === "tikz" || ext === "pgf";
              return (
                <div
                  key={art.path}
                  className="overflow-hidden rounded-lg border border-hairline bg-background"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-hairline border-b bg-muted/30 px-3 py-1.5">
                    <span className="font-medium font-mono text-xs">
                      {art.path}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 gap-1 px-2 text-[0.7rem]"
                        onClick={() => handleSaveGroup([art])}
                      >
                        <FilePlus2Icon className="size-3" />
                        Save to project
                      </Button>
                      {isTexLike && (
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          className="h-6 gap-1 px-2 text-[0.7rem]"
                          onClick={() => handleInsertTexArtifactIntoLatex(art)}
                          disabled={!targetTexFile}
                        >
                          <SparklesIcon className="size-3" />
                          Insert into LaTeX
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 gap-1 px-2 text-[0.7rem]"
                        onClick={() => {
                          void navigator.clipboard.writeText(art.content);
                          toast.success(`Copied ${art.path}`);
                        }}
                      >
                        <CopyIcon className="size-3" />
                        Copy
                      </Button>
                    </div>
                  </div>
                  <pre className="max-h-48 overflow-auto p-3 font-mono text-[0.72rem] leading-relaxed">
                    {art.content}
                  </pre>
                </div>
              );
            })}
          </div>
        )}

        {/* Console Output */}
        {result && (
          <div className="overflow-hidden rounded-lg border border-hairline bg-background">
            <div className="flex items-center justify-between border-hairline border-b bg-muted/30 px-3 py-1.5 text-xs">
              <span className="flex items-center gap-1.5 font-medium">
                <TerminalIcon className="size-3.5 text-muted-foreground" />
                Console Output
              </span>
              <span
                className={cn(
                  "font-mono text-[0.7rem]",
                  result.success
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive",
                )}
              >
                {result.timedOut
                  ? "Timed out"
                  : `Exit code ${result.exitCode ?? 0}`}
              </span>
            </div>
            <div className="p-3 font-mono text-xs">
              {result.stdout ? (
                <pre className="whitespace-pre-wrap text-foreground/90">
                  {result.stdout}
                </pre>
              ) : null}
              {result.stderr ? (
                <pre className="mt-1 whitespace-pre-wrap text-destructive">
                  {result.stderr}
                </pre>
              ) : null}
              {!result.stdout && !result.stderr && (
                <span className="text-muted-foreground">
                  (Script completed with no stdout/stderr output)
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
