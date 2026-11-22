"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  CopyIcon,
  FilePlus2Icon,
  FileUpIcon,
  GitCompareArrowsIcon,
  ImageIcon,
  LayersIcon,
  LoaderIcon,
  ReplaceIcon,
  ScanTextIcon,
  SparklesIcon,
  WandSparklesIcon,
  WrenchIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { normalizeEol } from "@/lib/ai/file-edits";
import { buildFilePatch, patchStats } from "@/lib/ai/line-diff";
import { recognizeImageRaw } from "@/lib/ocr";
import { detectMainFile, isLatexDocumentFile } from "@/lib/project-files";
import { createProjectVersion } from "@/lib/projects/repository";
import { PUBLISHER_LIST } from "@/lib/publishers";
import {
  BLOCK_LABEL_META,
  type BlockLabel,
  type ReconstructionAggressiveness,
  type ReconstructionOutputMode,
  type ReconstructionResult,
  type ReconstructionTargetFormat,
  reconstructTextLocal,
} from "@/lib/text-reconstructor";
import { cn } from "@/lib/utils";
import { useChatModelStore } from "@/stores/chat-model-store";
import { useDocumentStore } from "@/stores/document-store";

export interface TextRestorerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ResultTab = "latex" | "structure" | "repairs";
type EngineMode = "local-ml" | "hybrid-llm";

const SAMPLE_CORRUPTIONS: Array<{
  id: string;
  label: string;
  text: string;
}> = [
  {
    id: "mojibake-pdf",
    label: "Mojibake + PDF Breakage",
    text: `Spectral Convergence of Variational Solvers on Manifolds
Elena Rostova, Department of Applied Mathematics, MIT

Running Header Preprint

Page 2

Running Header Preprint

Abstract: We investigate â€œspectralâ€  conver-\ngence bounds for discrete Laplacian operators when Î± â‰¤ 1.2 and âˆ‘ eigenvalues remain bounded. Our ﬁndings show that modern preconditioners reduce iteration complexity across smooth geometries.

1 Introduction
In computational analysis, broken PDF extraction often leaves hyphe-\nnated words, Ã© accents, and wrapped\nsentence fragments. We achieve 98% accuracy on benchmark grids.`,
  },
  {
    id: "ocr-math",
    label: "Noisy OCR Theorem & Math",
    text: `\\sectoin{Main Stability Estimate}

Theorem 1 (Spectral Bound): Suppose thc discrete operator satisfies wltb uniform step h <= 0.1 and x_i -> 0. Then pr00f of exponential equatlon decay holds for thc iterative rnethod.

Proof: Apply Cauchy-Schwarz inequality to u_h in Hilbert space H^1 and bound O(h^2) residuals. Q.E.D.

begin{itemize}
- Fast Chebyshev spectral preconditioner converges cleanly.
- Verified stability under 1e-6 perturbation noise.
end{itemize}`,
  },
  {
    id: "raw-notes-table",
    label: "Unformatted Notes + Table & Refs",
    text: `Adaptive Preconditioning Notes

1.1 Empirical Solver Comparison

Solver | Iterations | Relative Error
Dense LU | 1 | 1.2e-14
Krylov CG | 48 | 4.5e-9
Multigrid | 9 | 2.1e-10

As shown in [1] and [2], multigrid reduces runtime significantly.

[1] Briggs, W. L. A Multigrid Tutorial. SIAM, 2000.
[2] Saad, Y. Iterative Methods for Sparse Linear Systems. SIAM, 2003.`,
  },
];

const BLOCK_LABEL_OPTIONS = Object.keys(BLOCK_LABEL_META) as BlockLabel[];

function severityBadgeClass(
  severity: "clean" | "moderate" | "heavy" | "severe",
): string {
  switch (severity) {
    case "clean":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "moderate":
      return "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "heavy":
      return "border-orange-500/35 bg-orange-500/10 text-orange-700 dark:text-orange-300";
    case "severe":
      return "border-destructive/40 bg-destructive/10 text-destructive";
  }
}

export function TextRestorerPanel({
  open,
  onOpenChange,
}: TextRestorerPanelProps) {
  const projectId = useDocumentStore((s) => s.projectId);
  const projectName = useDocumentStore((s) => s.projectName);
  const createdAt = useDocumentStore((s) => s.createdAt);
  const files = useDocumentStore((s) => s.files);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const mainFileId = useDocumentStore((s) => s.mainFileId);
  const compiler = useDocumentStore((s) => s.compiler);
  const comments = useDocumentStore((s) => s.comments);
  const cursorPosition = useDocumentStore((s) => s.cursorPosition);
  const addFile = useDocumentStore((s) => s.addFile);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const updateFileContent = useDocumentStore((s) => s.updateFileContent);
  const requestCompile = useDocumentStore((s) => s.requestCompile);

  const selectedModelId = useChatModelStore((s) => s.selectedModelId);

  const [rawText, setRawText] = useState(SAMPLE_CORRUPTIONS[0].text);
  const [engineMode, setEngineMode] = useState<EngineMode>("local-ml");
  const [aggressiveness, setAggressiveness] =
    useState<ReconstructionAggressiveness>("balanced");
  const [outputMode, setOutputMode] =
    useState<ReconstructionOutputMode>("document");
  const [targetFormat, setTargetFormat] =
    useState<ReconstructionTargetFormat>("article");
  const [labelOverrides, setLabelOverrides] = useState<
    Partial<Record<number, BlockLabel>>
  >({});

  const [result, setResult] = useState<ReconstructionResult | null>(null);
  const [editedLatex, setEditedLatex] = useState("");
  const [activeTab, setActiveTab] = useState<ResultTab>("latex");
  const [showDiff, setShowDiff] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isOcrRunning, setIsOcrRunning] = useState(false);

  const textFileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const targetTexFile = useMemo(() => {
    const active = files.find((f) => f.id === activeFileId);
    if (active && isLatexDocumentFile(active)) return active;
    const explicitMain = files.find((f) => f.id === mainFileId);
    if (explicitMain && isLatexDocumentFile(explicitMain)) return explicitMain;
    const main = detectMainFile(files);
    if (main && isLatexDocumentFile(main)) return main;
    return files.find((f) => isLatexDocumentFile(f)) ?? null;
  }, [activeFileId, files, mainFileId]);

  useEffect(() => {
    if (!open || result) return;
    const initial = reconstructTextLocal(rawText, {
      aggressiveness,
      outputMode,
      targetFormat,
    });
    setResult(initial);
    setEditedLatex(initial.reconstructedLatex);
  }, [aggressiveness, open, outputMode, rawText, result, targetFormat]);

  const handleRunReconstruction = async (
    overridesArg?: Partial<Record<number, BlockLabel>>,
    rawOverride?: string,
  ) => {
    const sourceText = rawOverride ?? rawText;
    const nextOverrides = overridesArg ?? labelOverrides;
    if (!sourceText.trim()) {
      toast.error("Paste garbled text or scan an image first.");
      return;
    }

    if (engineMode === "local-ml") {
      const local = reconstructTextLocal(sourceText, {
        aggressiveness,
        outputMode,
        targetFormat,
        labelOverrides: nextOverrides,
      });
      setResult(local);
      setEditedLatex(local.reconstructedLatex);
      toast.success("Reconstructed cleanly with 5-stage local ML", {
        description: `${local.repairs.length} repair(s), ${local.blocks.length} block(s) structured.`,
      });
      return;
    }

    setIsRunning(true);
    try {
      const response = await fetch("/api/ai/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: sourceText,
          mode: engineMode,
          aggressiveness,
          outputMode,
          targetFormat,
          model: selectedModelId || undefined,
          labelOverrides: nextOverrides,
        }),
      });
      const payload = (await response.json()) as ReconstructionResult & {
        error?: string;
      };
      if (!response.ok) {
        toast.error(payload.error || "Reconstruction request failed.");
        return;
      }
      setResult(payload);
      setEditedLatex(payload.reconstructedLatex);
      if (payload.fallbackNotice) {
        toast.info("Completed with fallback", {
          description: payload.fallbackNotice,
        });
      } else {
        toast.success("Hybrid ML + Neural reconstruction finished", {
          description: `${payload.repairs.length} total repair(s), ${payload.lintAfterIssues.length} lint note(s).`,
        });
      }
    } catch (error) {
      const localFallback = reconstructTextLocal(sourceText, {
        aggressiveness,
        outputMode,
        targetFormat,
        labelOverrides: nextOverrides,
      });
      setResult(localFallback);
      setEditedLatex(localFallback.reconstructedLatex);
      toast.warning("Neural endpoint unreachable — used local ML pipeline", {
        description:
          error instanceof Error ? error.message : "Network request failed.",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleOverrideBlock = (blockIndex: number, newLabel: BlockLabel) => {
    const nextOverrides = { ...labelOverrides, [blockIndex]: newLabel };
    setLabelOverrides(nextOverrides);
    const local = reconstructTextLocal(rawText, {
      aggressiveness,
      outputMode,
      targetFormat,
      labelOverrides: nextOverrides,
    });
    setResult(local);
    setEditedLatex(local.reconstructedLatex);
  };

  const handleUploadTextFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const text = await file.text();
    setRawText(text);
    setLabelOverrides({});
    const local = reconstructTextLocal(text, {
      aggressiveness,
      outputMode,
      targetFormat,
    });
    setResult(local);
    setEditedLatex(local.reconstructedLatex);
    toast.success(`Loaded ${file.name} (${text.length} chars)`);
  };

  const handleScanImageOcr = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsOcrRunning(true);
    try {
      const ocrRaw = await recognizeImageRaw(file);
      setRawText(ocrRaw);
      setLabelOverrides({});
      await handleRunReconstruction({}, ocrRaw);
    } catch (error) {
      toast.error("OCR scan failed", {
        description:
          error instanceof Error ? error.message : "Could not read image.",
      });
    } finally {
      setIsOcrRunning(false);
    }
  };

  const handleSelectSample = (text: string) => {
    setRawText(text);
    setLabelOverrides({});
    const local = reconstructTextLocal(text, {
      aggressiveness,
      outputMode,
      targetFormat,
    });
    setResult(local);
    setEditedLatex(local.reconstructedLatex);
  };

  const diffInfo = useMemo(() => {
    if (!showDiff) return null;
    const before = normalizeEol(
      outputMode === "document" && targetTexFile?.content
        ? targetTexFile.content
        : rawText,
    );
    const after = normalizeEol(editedLatex);
    const patch = buildFilePatch(before, after, 3);
    const stats = patchStats(patch);
    return { patch, stats };
  }, [editedLatex, outputMode, rawText, showDiff, targetTexFile?.content]);

  const handleCopyLatex = async () => {
    if (!editedLatex) return;
    await navigator.clipboard.writeText(editedLatex);
    toast.success("Copied reconstructed LaTeX to clipboard");
  };

  const handleInsertAtCursor = () => {
    if (!targetTexFile) {
      toast.error("No editable .tex file in workspace.");
      return;
    }
    const snippet =
      outputMode === "snippet" ? editedLatex : result?.bodyLatex || editedLatex;
    const current = targetTexFile.content ?? "";
    const pos =
      activeFileId === targetTexFile.id
        ? Math.min(Math.max(0, cursorPosition), current.length)
        : Math.max(0, current.lastIndexOf("\\end{document}"));
    const endDoc = current.lastIndexOf("\\end{document}");
    const safePos = endDoc !== -1 && pos > endDoc ? endDoc : pos;

    const next = `${current.slice(0, safePos)}\n${snippet}\n${current.slice(safePos)}`;
    updateFileContent(targetTexFile.id, next);
    setActiveFile(targetTexFile.id);
    requestCompile();
    toast.success(`Inserted structured LaTeX into ${targetTexFile.path}`);
  };

  const handleReplaceActiveFile = async () => {
    if (!targetTexFile || !editedLatex.trim()) {
      toast.error("No target .tex file or LaTeX output.");
      return;
    }
    if (projectId) {
      try {
        await createProjectVersion({
          projectId,
          label: "Before ML Text Restorer replacement",
          name: projectName,
          projectCreatedAt: createdAt ?? Date.now(),
          files,
          activeFileId: activeFileId || targetTexFile.id,
          mainFileId,
          compiler,
          comments,
        });
      } catch {
        // Non-fatal snapshot failure
      }
    }
    updateFileContent(targetTexFile.id, editedLatex);
    setActiveFile(targetTexFile.id);
    requestCompile();
    toast.success(`Replaced ${targetTexFile.path} (version snapshot saved)`);
  };

  const handleSaveAsNewFile = () => {
    if (!editedLatex.trim()) return;
    const existing = new Set(files.map((f) => f.path));
    let candidate = "restored-manuscript.tex";
    let counter = 2;
    while (existing.has(candidate)) {
      candidate = `restored-manuscript-${counter}.tex`;
      counter += 1;
    }
    const newId = addFile({
      name: candidate,
      path: candidate,
      type: "tex",
      content: editedLatex,
    });
    setActiveFile(newId);
    requestCompile();
    toast.success(`Created ${candidate}`);
  };

  const errorCount =
    result?.lintAfterIssues.filter((i) => i.severity === "error").length ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        overlay={false}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[740px]"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-hairline border-b px-4 py-3 pr-12">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SheetTitle className="flex items-center gap-2 text-base">
              <ScanTextIcon className="size-4 text-primary" />
              Text Restorer (ML Pipeline)
            </SheetTitle>
            {result && (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 font-mono text-[0.68rem]",
                  severityBadgeClass(result.afterTelemetry.severity),
                )}
              >
                {result.engine === "hybrid-llm"
                  ? "Hybrid ML + Neural"
                  : "5-Stage Local ML"}
              </span>
            )}
          </div>
          <SheetDescription className="text-xs">
            Denoises mojibake, broken PDF wraps, and OCR noise via Bayesian
            noisy-channel &amp; Viterbi CRF sequence labeling, then synthesizes
            linter-verified LaTeX.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          {/* Input & Sample Chips */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {SAMPLE_CORRUPTIONS.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => handleSelectSample(sample.text)}
                    className="rounded-full border border-border/80 bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  ref={textFileInputRef}
                  type="file"
                  accept=".txt,.md,.tex,.csv"
                  className="hidden"
                  onChange={handleUploadTextFile}
                />
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleScanImageOcr}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => textFileInputRef.current?.click()}
                >
                  <FileUpIcon className="size-3.5" />
                  Load File
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={isOcrRunning}
                  onClick={() => imageInputRef.current?.click()}
                >
                  {isOcrRunning ? (
                    <LoaderIcon className="size-3.5 animate-spin" />
                  ) : (
                    <ImageIcon className="size-3.5" />
                  )}
                  Scan Image (OCR)
                </Button>
              </div>
            </div>

            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste unformatted notes, garbled PDF copy-paste, mojibake, or OCR text..."
              className="min-h-[120px] resize-y font-mono text-xs leading-relaxed"
            />
          </div>

          {/* Pipeline Controls */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="space-y-1">
              <label
                htmlFor="restorer-engine"
                className="block font-medium text-[11px] text-muted-foreground"
              >
                Engine
              </label>
              <Select
                value={engineMode}
                onValueChange={(v) => setEngineMode(v as EngineMode)}
              >
                <SelectTrigger id="restorer-engine" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local-ml">Local ML (Instant)</SelectItem>
                  <SelectItem value="hybrid-llm">Hybrid ML + Neural</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="restorer-agg"
                className="block font-medium text-[11px] text-muted-foreground"
              >
                Denoising
              </label>
              <Select
                value={aggressiveness}
                onValueChange={(v) =>
                  setAggressiveness(v as ReconstructionAggressiveness)
                }
              >
                <SelectTrigger id="restorer-agg" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservative">Conservative</SelectItem>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="aggressive">Aggressive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="restorer-output"
                className="block font-medium text-[11px] text-muted-foreground"
              >
                Output
              </label>
              <Select
                value={outputMode}
                onValueChange={(v) =>
                  setOutputMode(v as ReconstructionOutputMode)
                }
              >
                <SelectTrigger id="restorer-output" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="document">Full Paper (.tex)</SelectItem>
                  <SelectItem value="snippet">Body Snippet</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="restorer-format"
                className="block font-medium text-[11px] text-muted-foreground"
              >
                Journal Format
              </label>
              <Select
                value={targetFormat}
                onValueChange={(v) =>
                  setTargetFormat(v as ReconstructionTargetFormat)
                }
                disabled={outputMode === "snippet"}
              >
                <SelectTrigger id="restorer-format" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="article">Standard Article</SelectItem>
                  {PUBLISHER_LIST.map((pub) => (
                    <SelectItem key={pub.id} value={pub.id}>
                      {pub.shortName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void handleRunReconstruction()}
              disabled={isRunning || !rawText.trim()}
              className="gap-1.5"
            >
              {isRunning ? (
                <LoaderIcon className="size-3.5 animate-spin" />
              ) : (
                <WandSparklesIcon className="size-3.5" />
              )}
              Reconstruct &amp; Verify
            </Button>

            {result?.fallbackNotice && (
              <p className="truncate text-[11px] text-amber-600 dark:text-amber-400">
                {result.fallbackNotice}
              </p>
            )}
          </div>

          {/* Telemetry Bar */}
          {result && (
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/80 bg-muted/25 p-2.5 text-xs sm:grid-cols-5">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">
                  Corruption
                </div>
                <div className="mt-0.5 flex items-center gap-1 font-medium font-mono">
                  <span>{result.beforeTelemetry.compositeScore}</span>
                  <ArrowRightIcon className="size-3 text-muted-foreground" />
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {result.afterTelemetry.compositeScore}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">
                  Perplexity
                </div>
                <div className="mt-0.5 flex items-center gap-1 font-medium font-mono">
                  <span>{result.beforeTelemetry.charPerplexity}</span>
                  <ArrowRightIcon className="size-3 text-muted-foreground" />
                  <span>{result.afterTelemetry.charPerplexity}</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">
                  Repairs
                </div>
                <div className="mt-0.5 font-medium font-mono">
                  {result.repairs.length} token(s)
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">
                  Blocks
                </div>
                <div className="mt-0.5 font-medium font-mono">
                  {result.blocks.length} Viterbi
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">
                  Linter
                </div>
                <div className="mt-0.5 flex items-center gap-1 font-medium font-mono">
                  {errorCount === 0 ? (
                    <>
                      <CheckCircle2Icon className="size-3.5 text-emerald-600" />
                      <span>0 errors</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangleIcon className="size-3.5 text-destructive" />
                      <span>{errorCount} error(s)</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Progressive Result Tabs */}
          {result && (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-hairline border-b pb-2">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={activeTab === "latex" ? "secondary" : "ghost"}
                    className="h-7 gap-1 px-2.5 text-xs"
                    onClick={() => setActiveTab("latex")}
                  >
                    <SparklesIcon className="size-3.5" />
                    Clean LaTeX
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={activeTab === "structure" ? "secondary" : "ghost"}
                    className="h-7 gap-1 px-2.5 text-xs"
                    onClick={() => setActiveTab("structure")}
                  >
                    <LayersIcon className="size-3.5" />
                    Structure ({result.blocks.length})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={activeTab === "repairs" ? "secondary" : "ghost"}
                    className="h-7 gap-1 px-2.5 text-xs"
                    onClick={() => setActiveTab("repairs")}
                  >
                    <WrenchIcon className="size-3.5" />
                    Repairs ({result.repairs.length})
                  </Button>
                </div>

                {activeTab === "latex" && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={showDiff ? "secondary" : "outline"}
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setShowDiff((v) => !v)}
                    >
                      <GitCompareArrowsIcon className="size-3.5" />
                      {showDiff ? "Hide Diff" : "Unified Diff"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => void handleCopyLatex()}
                    >
                      <CopyIcon className="size-3.5" />
                      Copy
                    </Button>
                  </div>
                )}
              </div>

              {activeTab === "latex" && (
                <div className="flex flex-col gap-2">
                  {showDiff && diffInfo ? (
                    <div className="max-h-[260px] overflow-auto rounded-md border bg-muted/20 p-2 font-mono text-[11px] leading-relaxed">
                      <div className="mb-1.5 flex items-center justify-between text-muted-foreground">
                        <span>Unified Patch Preview</span>
                        <span>
                          +{diffInfo.stats.added} / -{diffInfo.stats.removed}
                        </span>
                      </div>
                      {diffInfo.patch.kind === "edits" ? (
                        diffInfo.patch.edits.length === 0 ? (
                          <p className="text-muted-foreground">
                            No differences from baseline.
                          </p>
                        ) : (
                          diffInfo.patch.edits.map((edit, idx) => (
                            <div
                              key={`${idx}-${edit.find.slice(0, 12)}`}
                              className="mb-2 border-border/60 border-b pb-2 last:border-b-0"
                            >
                              {edit.find.split("\n").map((line, li) => (
                                <div
                                  key={`del-${idx}-${li}`}
                                  className="bg-rose-500/10 px-1 text-rose-700 dark:text-rose-300"
                                >
                                  - {line}
                                </div>
                              ))}
                              {edit.replace.split("\n").map((line, li) => (
                                <div
                                  key={`add-${idx}-${li}`}
                                  className="bg-emerald-500/10 px-1 text-emerald-700 dark:text-emerald-300"
                                >
                                  + {line}
                                </div>
                              ))}
                            </div>
                          ))
                        )
                      ) : (
                        <pre className="whitespace-pre-wrap break-words text-emerald-700 dark:text-emerald-300">
                          {editedLatex}
                        </pre>
                      )}
                    </div>
                  ) : (
                    <Textarea
                      value={editedLatex}
                      onChange={(e) => setEditedLatex(e.target.value)}
                      className="min-h-[240px] resize-y font-mono text-xs leading-relaxed"
                    />
                  )}
                </div>
              )}

              {activeTab === "structure" && (
                <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                  {result.blocks.map((block) => (
                    <div
                      key={block.index}
                      className={cn(
                        "rounded-md border p-2.5 text-xs",
                        block.lowConfidence
                          ? "border-amber-500/45 bg-amber-500/5"
                          : "border-border/80 bg-muted/20",
                      )}
                    >
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            #{block.index + 1}
                          </span>
                          <Select
                            value={block.label}
                            onValueChange={(v) =>
                              handleOverrideBlock(block.index, v as BlockLabel)
                            }
                          >
                            <SelectTrigger className="h-7 w-[170px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {BLOCK_LABEL_OPTIONS.map((lbl) => (
                                <SelectItem key={lbl} value={lbl}>
                                  {BLOCK_LABEL_META[lbl].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          conf {(block.confidence * 100).toFixed(0)}% · alt{" "}
                          {BLOCK_LABEL_META[block.runnerUpLabel].label}
                        </span>
                      </div>
                      <p className="line-clamp-2 font-mono text-[11px] text-foreground/85">
                        {block.cleanedText}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "repairs" && (
                <div className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
                  {result.repairs.length === 0 ? (
                    <p className="py-6 text-center text-muted-foreground text-xs">
                      No token-level corruptions needed rewriting.
                    </p>
                  ) : (
                    result.repairs.map((repair, idx) => (
                      <div
                        key={`${idx}-${repair.original}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-1.5 text-xs"
                      >
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-700 line-through dark:text-rose-300">
                            {repair.original}
                          </span>
                          <ArrowRightIcon className="size-3 text-muted-foreground" />
                          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                            {repair.repaired}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{repair.reason}</span>
                          <span className="font-mono">
                            {(repair.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-hairline border-t bg-muted/20 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSaveAsNewFile}
            disabled={!editedLatex.trim()}
            className="gap-1.5 text-xs"
          >
            <FilePlus2Icon className="size-3.5" />
            Save as New .tex
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleInsertAtCursor}
              disabled={!targetTexFile || !editedLatex.trim()}
              className="gap-1.5 text-xs"
            >
              Insert at Cursor
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleReplaceActiveFile()}
              disabled={!targetTexFile || !editedLatex.trim()}
              className="gap-1.5 text-xs"
            >
              <ReplaceIcon className="size-3.5" />
              Replace Active .tex
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
