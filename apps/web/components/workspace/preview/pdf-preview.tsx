"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  DownloadIcon,
  FileTextIcon,
  LoaderIcon,
  MinusIcon,
  PlusIcon,
  RefreshCwIcon,
  ZapIcon,
} from "lucide-react";
import { useDocumentStore, useIsPdfFresh } from "@/stores/document-store";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LATEX_COMPILERS, type LatexCompiler } from "@/lib/latex-compiler";
import { fileKindForFile, isLatexRelatedFile } from "@/lib/file-kind";
import { cn } from "@/lib/utils";

const CodePreview = dynamic(
  () => import("./code-preview").then((mod) => mod.CodePreview),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

const ZOOM_OPTIONS = [
  { value: "0.5", label: "50%" },
  { value: "0.75", label: "75%" },
  { value: "1", label: "100%" },
  { value: "1.25", label: "125%" },
  { value: "1.5", label: "150%" },
  { value: "2", label: "200%" },
  { value: "3", label: "300%" },
  { value: "4", label: "400%" },
];

const PdfViewer = dynamic(
  () => import("./pdf-viewer").then((mod) => mod.PdfViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export function PdfPreview() {
  const compile = useDocumentStore((s) => s.compile);
  const isFreshPdf = useIsPdfFresh();
  const isSaving = useDocumentStore((s) => s.isSaving);
  const compiler = useDocumentStore((s) => s.compiler);
  const setCompiler = useDocumentStore((s) => s.setCompiler);
  const requestCompile = useDocumentStore((s) => s.requestCompile);
  const requestJumpToPosition = useDocumentStore(
    (s) => s.requestJumpToPosition,
  );
  const autoCompile = useDocumentStore((s) => s.autoCompile);
  const setAutoCompile = useDocumentStore((s) => s.setAutoCompile);
  const canCompile = useDocumentStore((s) => {
    const file = s.files.find((candidate) => candidate.id === s.activeFileId);
    return file ? isLatexRelatedFile(file) : false;
  });
  const fileKind = useDocumentStore((s) => {
    const file = s.files.find((candidate) => candidate.id === s.activeFileId);
    return file ? fileKindForFile(file) : "other";
  });
  const compileDiagnostics = useDocumentStore((s) => s.compileDiagnostics);
  const setInspectorTab = useDocumentStore((s) => s.setInspectorTab);

  const [pdfError, setPdfError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);
  const pdf = compile.pdf;
  const compileError = compile.error?.message ?? null;
  const isCompiling = compile.phase === "compiling";
  const compilerLabel =
    LATEX_COMPILERS.find((option) => option.value === compiler)?.label ??
    compiler;
  const errorCount = compileDiagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  ).length;
  const warningCount = compileDiagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning",
  ).length;

  const handleTextClick = useCallback(
    (text: string) => {
      const state = useDocumentStore.getState();
      const activeContent =
        state.files.find((file) => file.id === state.activeFileId)?.content ??
        "";
      let index = activeContent.indexOf(text);

      if (index === -1) {
        const cleanText = text.replace(/[{}\\$]/g, "");
        if (cleanText.length > 2) {
          index = activeContent.indexOf(cleanText);
        }
      }

      if (index === -1 && text.length > 5) {
        const words = text.split(/\s+/).filter((w) => w.length > 3);
        for (const word of words) {
          index = activeContent.indexOf(word);
          if (index !== -1) break;
        }
      }

      if (index !== -1) {
        requestJumpToPosition(index);
      }
    },
    [requestJumpToPosition],
  );

  const handleCompile = useCallback(() => {
    if (!canCompile) return;
    setPdfError(null);
    requestCompile();
  }, [canCompile, requestCompile]);

  const zoomIn = () => setScale((s) => Math.min(4, s + 0.1));
  const zoomOut = () => setScale((s) => Math.max(0.25, s - 0.1));

  const handleDownload = () => {
    if (!pdf) return;
    const state = useDocumentStore.getState();
    const mainFile = state.files.find((f) => f.id === state.mainFileId);
    const baseName = (mainFile?.name ?? "document").replace(/\.tex$/i, "");
    const blob = new Blob([new Uint8Array(pdf)], {
      type: "application/pdf",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName || "document"}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleLoadSuccess = (pages: number) => {
    setNumPages(pages);
  };

  const handleScaleChange = (newScale: number) => {
    setScale(newScale);
  };

  const renderContent = () => {
    if (!canCompile) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center bg-transparent p-8">
          <FileTextIcon className="mb-4 size-12 text-muted-foreground/50" />
          <h2 className="mb-2 font-medium text-lg text-muted-foreground">
            Compiler disabled for this file
          </h2>
          <p className="max-w-md text-center text-muted-foreground text-sm">
            The LaTeX compiler is enabled only while editing LaTeX files. Open a
            .tex, .ltx, .bib, .sty, .cls, .tikz, or .pgf file to compile.
          </p>
        </div>
      );
    }

    if (pdf) {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          {!isFreshPdf && (
            <div className="flex items-center gap-2 border-border border-b bg-muted/60 px-3 py-1.5 text-[0.75rem] text-muted-foreground">
              <AlertCircleIcon className="size-3.5 shrink-0 text-[#b9822f]" />
              <span className="min-w-0 flex-1 truncate">
                {isCompiling
                  ? "Recompiling…"
                  : compileError
                    ? "This PDF is out of date. The last compile failed."
                    : "This PDF is out of date."}
              </span>
              {compileError && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => setInspectorTab("logs")}
                >
                  View log
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2"
                onClick={handleCompile}
                disabled={!canCompile}
              >
                Compile now
              </Button>
            </div>
          )}
          <PdfViewer
            data={pdf}
            scale={scale}
            onError={setPdfError}
            onLoadSuccess={handleLoadSuccess}
            onScaleChange={handleScaleChange}
            onTextClick={handleTextClick}
          />
        </div>
      );
    }

    if (compileError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center bg-transparent p-8">
          <AlertCircleIcon className="mb-4 size-12 text-destructive" />
          <h2 className="mb-2 font-medium text-destructive text-lg">
            Compilation Error
          </h2>
          <p className="max-w-md whitespace-pre-wrap text-center text-muted-foreground text-sm">
            {compileError}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setInspectorTab("logs")}
          >
            <AlertTriangleIcon className="size-3.5" />
            View warnings and errors
          </Button>
        </div>
      );
    }

    if (pdfError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center bg-transparent p-8">
          <AlertCircleIcon className="mb-4 size-12 text-destructive" />
          <h2 className="mb-2 font-medium text-destructive text-lg">
            PDF Load Error
          </h2>
          <p className="max-w-md text-center text-muted-foreground text-sm">
            {pdfError}
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-transparent p-8">
        <FileTextIcon className="mb-4 size-16 text-muted-foreground/50" />
        <h2 className="mb-2 font-medium text-lg text-muted-foreground">
          PDF Preview
        </h2>
        <p className="text-center text-muted-foreground text-sm">
          Click &quot;Compile&quot; to preview your document
        </p>
      </div>
    );
  };

  if (!canCompile) {
    if (fileKind === "python" || fileKind === "r") {
      return <CodePreview />;
    }

    return (
      <div className="flex h-full flex-col bg-pdf-canvas">
        <div className="flex h-9 items-center gap-1.5 border-border border-b bg-background px-2 text-[0.75rem] text-muted-foreground">
          <FileTextIcon className="size-3.5" />
          LaTeX compiler inactive for this file
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-8">
          <FileTextIcon className="mb-4 size-12 text-muted-foreground/50" />
          <h2 className="mb-2 font-medium text-lg text-muted-foreground">
            No LaTeX compile
          </h2>
          <p className="max-w-md text-center text-muted-foreground text-sm">
            LaTeX compilation is available only for LaTeX-family files. Python,
            R, Lean, Markdown, data, and other files are handled by their own
            runtimes and are not sent to TeX.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-pdf-canvas">
      <div className="no-scrollbar flex h-9 items-center justify-between gap-2 overflow-x-auto border-border border-b bg-background px-2">
        <div className="flex items-center gap-1.5">
          <Select
            value={compiler}
            onValueChange={(value) => setCompiler(value as LatexCompiler)}
          >
            <SelectTrigger
              size="sm"
              className="h-6! w-auto text-xs"
              title={
                canCompile
                  ? "LaTeX compiler"
                  : "Compiler is available for LaTeX files only"
              }
              disabled={!canCompile}
            >
              <SelectValue>{compilerLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {LATEX_COMPILERS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mx-0.5 h-4 w-px bg-border" />
          <Button
            variant={autoCompile ? "secondary" : "ghost"}
            size="sm"
            className="h-6 gap-1 px-1.5 text-[0.75rem]"
            onClick={() => setAutoCompile(!autoCompile)}
            disabled={!canCompile}
            title={
              !canCompile
                ? "Auto-compile is available for LaTeX files only"
                : autoCompile
                  ? "Auto-compile is on · click to pause"
                  : "Auto-compile is paused · click to enable"
            }
            aria-pressed={autoCompile && canCompile}
          >
            <ZapIcon
              className={cn(
                "size-3",
                autoCompile ? "text-primary" : "text-muted-foreground",
              )}
            />
            Auto
          </Button>
          {(errorCount > 0 || warningCount > 0) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[0.75rem]"
              onClick={() => setInspectorTab("logs")}
              title="Open compile diagnostics"
            >
              <AlertTriangleIcon
                className={cn(
                  "size-3",
                  errorCount > 0 ? "text-destructive" : "text-[#b9822f]",
                )}
              />
              {errorCount > 0
                ? `${errorCount} error${errorCount === 1 ? "" : "s"}`
                : `${warningCount} warning${warningCount === 1 ? "" : "s"}`}
            </Button>
          )}
          <div className="mx-0.5 h-4 w-px bg-border" />
          {isSaving && (
            <>
              <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground text-xs">Saving...</span>
            </>
          )}
          {!isSaving && isCompiling && (
            <>
              <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground text-xs">
                Compiling...
              </span>
            </>
          )}
          {!isSaving && !isCompiling && compileError && (
            <>
              <span className="text-destructive text-xs">Error</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={handleCompile}
                disabled={!canCompile}
              >
                <RefreshCwIcon className="size-3.5" />
              </Button>
            </>
          )}
          {!isSaving && !isCompiling && !compileError && pdf && (
            <>
              <span className="text-muted-foreground text-xs">
                {isFreshPdf ? "Ready" : "Out of date"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={handleCompile}
                disabled={!canCompile}
              >
                <RefreshCwIcon className="size-3.5" />
              </Button>
            </>
          )}
        </div>

        {pdf && (
          <div className="flex items-center gap-0.5">
            <span className="mr-2 text-muted-foreground text-xs">
              {numPages} {numPages === 1 ? "page" : "pages"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={zoomOut}
              disabled={scale <= 0.25}
            >
              <MinusIcon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={zoomIn}
              disabled={scale >= 4}
            >
              <PlusIcon className="size-3.5" />
            </Button>
            <Select
              value={scale.toString()}
              onValueChange={(v) => setScale(Number(v))}
            >
              <SelectTrigger size="sm" className="h-6! w-auto text-xs">
                <SelectValue>{Math.round(scale * 100)}%</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ZOOM_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mx-0.5 h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={handleDownload}
              disabled={!isFreshPdf}
              title={
                isFreshPdf
                  ? "Download PDF"
                  : "Compile to download the current source"
              }
            >
              <DownloadIcon className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      {renderContent()}
    </div>
  );
}
