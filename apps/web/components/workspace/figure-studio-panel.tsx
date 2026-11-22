"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  Code2Icon,
  DownloadIcon,
  FilePlus2Icon,
  FileSpreadsheetIcon,
  LoaderIcon,
  PlayIcon,
  SparklesIcon,
  TerminalIcon,
  WandSparklesIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  codeArtifactToDataUrl,
  downloadCodeArtifact,
  isFigureArtifactPath,
} from "@/lib/code-artifacts";
import type {
  CodeLanguage,
  CodeRunResult,
  CodeRuntimesProbe,
} from "@/lib/code-runner";
import {
  buildLatexFigureSnippet,
  compileFigureCode,
  deduceFigureSpec,
  ensureGraphicxInLatex,
  FIGURE_PALETTE_LIST,
  type FigureInstructionPlan,
  type FigurePaletteId,
  JOURNAL_FIGURE_PRESET_LIST,
  type JournalFigurePresetId,
} from "@/lib/figure-engine";
import {
  detectMainFile,
  fileTypeForName,
  getExtension,
  isLatexDocumentFile,
  mimeTypeForName,
} from "@/lib/project-files";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";

export interface FigureStudioPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const QUICK_RESEARCH_EXAMPLES: Array<{
  id: string;
  label: string;
  badge: string;
  prompt: string;
  presetId: JournalFigurePresetId;
  paletteId: FigurePaletteId;
  engine: CodeLanguage | "auto";
}> = [
    {
      id: "spectral-convergence",
      label: "Spectral Convergence",
      badge: "Log–Log Decay",
      prompt:
        "Log-log spectral convergence error decay vs mesh DOF N comparing Chebyshev spectral, Preconditioned CG, and Finite Difference solvers",
      presetId: "nature-single",
      paletteId: "okabe-ito",
      engine: "python",
    },
    {
      id: "causal-dag",
      label: "Architecture DAG",
      badge: "Sugiyama Layout",
      prompt:
        "Causal architecture flowchart: Raw Telemetry -> Spectral Encoder -> Koopman Latent -> Lyapunov Verifier -> Control Policy",
      presetId: "ieee-double",
      paletteId: "okabe-ito",
      engine: "python",
    },
    {
      id: "solver-benchmark",
      label: "Grouped Benchmark",
      badge: "95% CI Bars",
      prompt:
        "Grouped benchmark bar chart comparing Dense Direct, Sparse Krylov, and Proposed Multigrid throughput with 95% CI error bars",
      presetId: "elsevier-single",
      paletteId: "tol-muted",
      engine: "python",
    },
    {
      id: "posterior-violin",
      label: "Posterior Violin (R)",
      badge: "ggplot2 Violin",
      prompt:
        "Violin and quantile boxplot distribution of posterior log-likelihood across HMC-NUTS, Langevin, SVGD, and Variational samplers in R",
      presetId: "ams-siam",
      paletteId: "okabe-ito",
      engine: "r",
    },
  ];

export function FigureStudioPanel({
  open,
  onOpenChange,
}: FigureStudioPanelProps) {
  const files = useDocumentStore((s) => s.files);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const mainFileId = useDocumentStore((s) => s.mainFileId);
  const cursorPosition = useDocumentStore((s) => s.cursorPosition);
  const addFile = useDocumentStore((s) => s.addFile);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const updateFileContent = useDocumentStore((s) => s.updateFileContent);
  const requestCompile = useDocumentStore((s) => s.requestCompile);

  const [prompt, setPrompt] = useState<string>(
    QUICK_RESEARCH_EXAMPLES[0].prompt,
  );
  const [presetId, setPresetId] =
    useState<JournalFigurePresetId>("nature-single");
  const [paletteId, setPaletteId] = useState<FigurePaletteId>("okabe-ito");
  const [engineChoice, setEngineChoice] = useState<CodeLanguage | "auto">(
    "auto",
  );
  const [selectedCsvPath, setSelectedCsvPath] = useState<string>("__none__");

  const [plan, setPlan] = useState<FigureInstructionPlan>(() =>
    deduceFigureSpec(QUICK_RESEARCH_EXAMPLES[0].prompt, {
      presetId: "nature-single",
      paletteId: "okabe-ito",
      language: "auto",
    }),
  );
  const [codeLanguage, setCodeLanguage] = useState<CodeLanguage>(plan.language);
  const [code, setCode] = useState<string>(() =>
    compileFigureCode(plan, plan.language),
  );
  const [caption, setCaption] = useState<string>(plan.caption);
  const [label, setLabel] = useState<string>(plan.label);

  const [runtimes, setRuntimes] = useState<CodeRuntimesProbe | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<CodeRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);

  const csvFiles = useMemo(
    () =>
      files.filter((file) => {
        const ext = getExtension(file.path || file.name);
        return (
          file.type === "tex" &&
          (ext === "csv" || ext === "tsv" || ext === "dat")
        );
      }),
    [files],
  );

  const targetTexFile = useMemo(() => {
    const active = files.find((f) => f.id === activeFileId);
    if (active && isLatexDocumentFile(active)) return active;
    const main =
      files.find((f) => f.id === mainFileId) ?? detectMainFile(files) ?? null;
    return main && isLatexDocumentFile(main) ? main : null;
  }, [activeFileId, files, mainFileId]);

  useEffect(() => {
    const handleOpen = () => onOpenChange(true);
    window.addEventListener("arcanatex:open-figure-studio", handleOpen);
    return () =>
      window.removeEventListener("arcanatex:open-figure-studio", handleOpen);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/code/run")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CodeRuntimesProbe | null) => {
        if (!cancelled && data) setRuntimes(data);
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleDeduce = useCallback(
    (overrides?: {
      prompt?: string;
      presetId?: JournalFigurePresetId;
      paletteId?: FigurePaletteId;
      engineChoice?: CodeLanguage | "auto";
      csvPath?: string;
    }) => {
      const nextPrompt = overrides?.prompt ?? prompt;
      const nextPreset = overrides?.presetId ?? presetId;
      const nextPalette = overrides?.paletteId ?? paletteId;
      const nextEngine = overrides?.engineChoice ?? engineChoice;
      const nextCsvPath = overrides?.csvPath ?? selectedCsvPath;

      const csvFile =
        nextCsvPath !== "__none__"
          ? csvFiles.find((f) => f.path === nextCsvPath)
          : undefined;

      const deduced = deduceFigureSpec(nextPrompt, {
        presetId: nextPreset,
        paletteId: nextPalette,
        language: nextEngine,
        csvPath: csvFile?.path,
        csvContent: csvFile?.content,
      });

      const generatedCode = compileFigureCode(deduced, deduced.language);
      setPlan(deduced);
      setCodeLanguage(deduced.language);
      setCode(generatedCode);
      setCaption(deduced.caption);
      setLabel(deduced.label);
    },
    [csvFiles, engineChoice, paletteId, presetId, prompt, selectedCsvPath],
  );

  const handleSelectExample = (
    example: (typeof QUICK_RESEARCH_EXAMPLES)[0],
  ) => {
    setPrompt(example.prompt);
    setPresetId(example.presetId);
    setPaletteId(example.paletteId);
    setEngineChoice(example.engine);
    handleDeduce({
      prompt: example.prompt,
      presetId: example.presetId,
      paletteId: example.paletteId,
      engineChoice: example.engine,
    });
  };

  const handleSwitchCodeLanguage = (lang: CodeLanguage) => {
    setCodeLanguage(lang);
    setCode(compileFigureCode(plan, lang));
  };

  const handleCompileAndRender = async () => {
    if (!code.trim() || isRunning) return;
    setIsRunning(true);
    setRunError(null);

    try {
      const attachedFiles = csvFiles
        .filter((f) => typeof f.content === "string" && f.content.length > 0)
        .slice(0, 16)
        .map((f) => ({
          path: f.path,
          content: (f.content ?? "").slice(0, 200_000),
        }));

      const response = await fetch("/api/code/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: codeLanguage,
          code,
          files: attachedFiles,
        }),
      });

      const payload = (await response.json()) as CodeRunResult & {
        error?: string;
      };
      if (!response.ok) {
        setRunError(payload.error || "Code execution request failed.");
        setConsoleOpen(true);
        return;
      }

      setRunResult(payload);
      if (!payload.success) {
        setConsoleOpen(true);
        toast.error("Figure script exited with an error", {
          description:
            payload.stderr.split("\n")[0] ||
            `Exit code ${payload.exitCode ?? "unknown"}`,
        });
      } else {
        toast.success("Journal figure rendered", {
          description: `${payload.artifacts.length} artifact(s) synthesized in ${payload.durationMs} ms.`,
        });
      }
    } catch (error) {
      setRunError(
        error instanceof Error ? error.message : "Failed to execute code.",
      );
      setConsoleOpen(true);
    } finally {
      setIsRunning(false);
    }
  };

  const visualArtifact = useMemo(() => {
    if (!runResult) return null;
    return (
      runResult.artifacts.find((a) => getExtension(a.path) === "png") ??
      runResult.artifacts.find((a) => getExtension(a.path) === "svg") ??
      runResult.artifacts.find((a) => {
        const ext = getExtension(a.path);
        return ext === "jpg" || ext === "jpeg";
      }) ??
      null
    );
  }, [runResult]);

  const pdfArtifact = useMemo(() => {
    if (!runResult) return null;
    return (
      runResult.artifacts.find((a) => getExtension(a.path) === "pdf") ?? null
    );
  }, [runResult]);

  const saveArtifactsToProject = useCallback(
    (includeScript: boolean): string | null => {
      if (!runResult || runResult.artifacts.length === 0) return null;
      const previousActiveId = useDocumentStore.getState().activeFileId;
      let preferredLatexGraphicPath: string | null = null;

      for (const artifact of runResult.artifacts) {
        const ext = getExtension(artifact.path);
        if (!isFigureArtifactPath(artifact.path)) continue;

        const mimeType =
          artifact.mimeType ?? mimeTypeForName(artifact.path) ?? "image/png";
        const type = fileTypeForName(artifact.path, mimeType);
        const dataUrl = codeArtifactToDataUrl(artifact);

        addFile({
          name: artifact.path.split("/").pop() || artifact.path,
          path: artifact.path,
          type,
          mimeType,
          dataUrl,
          content: artifact.encoding === "utf-8" ? artifact.content : undefined,
        });

        if (ext === "pdf") {
          preferredLatexGraphicPath = artifact.path;
        } else if (ext === "png" && !preferredLatexGraphicPath) {
          preferredLatexGraphicPath = artifact.path;
        }
      }

      if (includeScript) {
        const scriptExt = codeLanguage === "python" ? "py" : "R";
        const scriptPath = `scripts/${plan.slug}.${scriptExt}`;
        addFile({
          name: `${plan.slug}.${scriptExt}`,
          path: scriptPath,
          type: "tex",
          content: code,
        });
      }

      if (previousActiveId) {
        setActiveFile(previousActiveId);
      }

      return (
        preferredLatexGraphicPath ??
        pdfArtifact?.path ??
        visualArtifact?.path ??
        null
      );
    },
    [
      addFile,
      code,
      codeLanguage,
      pdfArtifact?.path,
      plan.slug,
      runResult,
      setActiveFile,
      visualArtifact?.path,
    ],
  );

  const handleSaveFigureAndScript = () => {
    const savedPath = saveArtifactsToProject(true);
    if (!savedPath) {
      toast.error("Render a figure first before saving.");
      return;
    }
    const scriptExt = codeLanguage === "python" ? "py" : "R";
    toast.success("Saved figure artifacts & script to project", {
      description: `${savedPath} and scripts/${plan.slug}.${scriptExt}`,
    });
  };

  const handleInsertIntoLatex = () => {
    if (!targetTexFile) {
      toast.error("No LaTeX (.tex) document found in project.");
      return;
    }
    const graphicPath = saveArtifactsToProject(true);
    if (!graphicPath) {
      toast.error("Render a figure first before inserting into LaTeX.");
      return;
    }

    const snippet = buildLatexFigureSnippet({
      imagePath: graphicPath,
      caption,
      label,
      doubleColumn: plan.preset.columns === 2,
      width: plan.preset.latexWidth,
    });

    const latestTex =
      useDocumentStore.getState().files.find((f) => f.id === targetTexFile.id)
        ?.content ??
      targetTexFile.content ??
      "";
    const insertOffset =
      activeFileId === targetTexFile.id ? cursorPosition : undefined;
    const nextTex = ensureGraphicxInLatex(latestTex, snippet, insertOffset);

    updateFileContent(targetTexFile.id, nextTex);
    setActiveFile(targetTexFile.id);
    requestCompile();

    toast.success(`Inserted figure into ${targetTexFile.path}`, {
      description:
        "Added \\usepackage{graphicx}, \\begin{figure}, and triggered LaTeX compile.",
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        overlay={false}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[680px]"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-hairline border-b px-4 py-3 pr-12">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SheetTitle className="flex items-center gap-2 text-base">
              <WandSparklesIcon className="size-4 text-primary" />
              Scientific Figure Synthesis Studio
            </SheetTitle>
            {runtimes && (
              <div className="flex items-center gap-1.5 text-[0.68rem]">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-mono",
                    runtimes.python.available
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  Python {runtimes.python.version ?? ""}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-mono",
                    runtimes.r.available
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  R {runtimes.r.version ?? ""}
                </span>
              </div>
            )}
          </div>
          <SheetDescription className="text-xs">
            3-stage algorithmic pipeline:{" "}
            <span className="font-medium text-foreground">
              1. Deduce Specification
            </span>{" "}
            →{" "}
            <span className="font-medium text-foreground">
              2. Visual Instructions & Code
            </span>{" "}
            →{" "}
            <span className="font-medium text-foreground">
              3. Journal-Ready Render
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {/* STAGE 1: DEDUCE */}
          <section className="rounded-lg border border-hairline bg-background p-3.5 shadow-2xs">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 font-mono font-semibold text-[0.7rem] text-primary">
                  1
                </span>
                <h3 className="font-semibold text-xs uppercase tracking-wider">
                  Stage 1 · Deduce Figure Architecture
                </h3>
              </div>
              <span className="font-mono text-[0.68rem] text-muted-foreground">
                {plan.preset.widthInches}&quot; × {plan.preset.heightInches}
                &quot; · {plan.preset.dpi} DPI · Type 42 PDF
              </span>
            </div>

            {/* 4 Quick Research Examples */}
            <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
              {QUICK_RESEARCH_EXAMPLES.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  onClick={() => handleSelectExample(example)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[0.7rem] transition-colors",
                    prompt === example.prompt
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-hairline bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <span className="font-medium">{example.label}</span>
                  <span className="rounded bg-background/80 px-1 py-0.2 font-mono text-[0.62rem] text-muted-foreground">
                    {example.badge}
                  </span>
                </button>
              ))}
            </div>

            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder="Describe the mathematical plot, benchmark comparison, statistical distribution, or causal DAG (e.g., A -> B -> C)..."
              className="mb-3 resize-y text-xs"
            />

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <div className="mb-1 font-medium text-[0.68rem] text-muted-foreground">
                  Journal Size & Typography Preset
                </div>
                <Select
                  value={presetId}
                  onValueChange={(val) => {
                    const next = val as JournalFigurePresetId;
                    setPresetId(next);
                    handleDeduce({ presetId: next });
                  }}
                >
                  <SelectTrigger size="sm" className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JOURNAL_FIGURE_PRESET_LIST.map((spec) => (
                      <SelectItem key={spec.id} value={spec.id}>
                        {spec.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="mb-1 font-medium text-[0.68rem] text-muted-foreground">
                  CVD-Safe Color Palette
                </div>
                <Select
                  value={paletteId}
                  onValueChange={(val) => {
                    const next = val as FigurePaletteId;
                    setPaletteId(next);
                    handleDeduce({ paletteId: next });
                  }}
                >
                  <SelectTrigger size="sm" className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIGURE_PALETTE_LIST.map((pal) => (
                      <SelectItem key={pal.id} value={pal.id}>
                        <span className="flex items-center gap-2">
                          <span>{pal.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="mb-1 font-medium text-[0.68rem] text-muted-foreground">
                  Compiler Engine
                </div>
                <div className="flex items-center gap-1 rounded-md border border-hairline bg-muted/30 p-0.5">
                  {(["auto", "python", "r"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setEngineChoice(opt);
                        handleDeduce({ engineChoice: opt });
                      }}
                      className={cn(
                        "flex-1 rounded px-2 py-1 font-medium text-xs transition-colors",
                        engineChoice === opt
                          ? "bg-background text-foreground shadow-2xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {opt === "auto"
                        ? "Auto"
                        : opt === "python"
                          ? "Python"
                          : "R"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center gap-1 font-medium text-[0.68rem] text-muted-foreground">
                  <FileSpreadsheetIcon className="size-3" />
                  Project CSV / Data Binding
                </div>
                <Select
                  value={selectedCsvPath}
                  onValueChange={(val) => {
                    setSelectedCsvPath(val);
                    handleDeduce({ csvPath: val });
                  }}
                >
                  <SelectTrigger size="sm" className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      Synthetic / Inline Mathematical Data
                    </SelectItem>
                    {csvFiles.map((file) => (
                      <SelectItem key={file.id} value={file.path}>
                        {file.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-hairline border-t pt-2.5">
              <div className="flex items-center gap-1.5">
                {plan.palette.colors.slice(0, 6).map((hex) => (
                  <span
                    key={hex}
                    className="size-3.5 rounded-full border border-black/15"
                    style={{ backgroundColor: hex }}
                    title={hex}
                  />
                ))}
                <span className="ml-1 text-[0.68rem] text-muted-foreground">
                  {plan.preset.guidelines}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="default"
                className="h-7 gap-1.5 text-xs"
                onClick={() => handleDeduce()}
              >
                <SparklesIcon className="size-3.5" />
                Deduce Plan
              </Button>
            </div>
          </section>

          {/* STAGE 2: INSTRUCTIONS & CODE */}
          <section className="rounded-lg border border-hairline bg-background p-3.5 shadow-2xs">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 font-mono font-semibold text-[0.7rem] text-primary">
                  2
                </span>
                <h3 className="font-semibold text-xs uppercase tracking-wider">
                  Stage 2 · Deduced Visual Instructions & Script
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[0.68rem]">
                <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
                  {plan.familyLabel}
                </span>
                <span className="rounded-md border border-hairline bg-muted/40 px-2 py-0.5 font-mono text-muted-foreground">
                  {plan.algorithm}
                </span>
              </div>
            </div>

            {plan.graphLayout && (
              <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-muted/20 px-2.5 py-1.5 font-mono text-[0.68rem] text-muted-foreground">
                <span>
                  Graph Layout: {plan.graphLayout.nodes.length} nodes ·{" "}
                  {plan.graphLayout.edges.length} edges ·{" "}
                  {plan.graphLayout.layerCount} layer(s) ·{" "}
                  {plan.graphLayout.crossings} crossing(s)
                </span>
              </div>
            )}

            <div className="mb-3 rounded-md border border-hairline bg-muted/15 p-2.5">
              <div className="mb-1.5 font-semibold text-[0.68rem] text-muted-foreground uppercase tracking-wider">
                Algorithmic Synthesis Instructions
              </div>
              <ol className="flex flex-col gap-1 text-xs leading-relaxed">
                {plan.instructions.map((step) => (
                  <li key={step} className="text-foreground/90">
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Code2Icon className="size-3.5 text-muted-foreground" />
                <span className="font-medium text-xs">
                  Executable Figure Script ({codeLanguage.toUpperCase()})
                </span>
                <span className="text-[0.68rem] text-muted-foreground">
                  · recommended: {plan.recommendedLanguage.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={codeLanguage === "python" ? "secondary" : "ghost"}
                  className="h-6 px-2 text-[0.7rem]"
                  onClick={() => handleSwitchCodeLanguage("python")}
                >
                  Python (matplotlib)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={codeLanguage === "r" ? "secondary" : "ghost"}
                  className="h-6 px-2 text-[0.7rem]"
                  onClick={() => handleSwitchCodeLanguage("r")}
                >
                  R (ggplot2)
                </Button>
              </div>
            </div>

            <Textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              rows={10}
              className="font-mono text-[0.72rem] leading-relaxed"
              spellCheck={false}
            />
          </section>

          {/* STAGE 3: JOURNAL RENDER */}
          <section className="rounded-lg border border-hairline bg-background p-3.5 shadow-2xs">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 font-mono font-semibold text-[0.7rem] text-primary">
                  3
                </span>
                <h3 className="font-semibold text-xs uppercase tracking-wider">
                  Stage 3 · Sandboxed Compile & Journal Render
                </h3>
              </div>

              <Button
                type="button"
                size="sm"
                variant="default"
                className="h-8 gap-1.5 text-xs"
                onClick={() => void handleCompileAndRender()}
                disabled={isRunning || !code.trim()}
              >
                {isRunning ? (
                  <>
                    <LoaderIcon className="size-3.5 animate-spin" />
                    Compiling {codeLanguage === "python" ? "Python" : "R"}…
                  </>
                ) : (
                  <>
                    <PlayIcon className="size-3.5" />
                    Compile & Render
                  </>
                )}
              </Button>
            </div>

            {runError && (
              <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-destructive text-xs">
                {runError}
              </div>
            )}

            {visualArtifact ? (
              <div className="mb-3 flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-md border border-hairline bg-muted/30 px-3 py-1.5 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CheckCircle2Icon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-medium font-mono">
                      {visualArtifact.path}
                    </span>
                    {runResult?.artifacts.map((art) => (
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
                  <div className="flex items-center gap-1">
                    {pdfArtifact && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 gap-1 px-2 text-[0.7rem]"
                        onClick={() => downloadCodeArtifact(pdfArtifact)}
                      >
                        <DownloadIcon className="size-3" />
                        Vector PDF
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-2 text-[0.7rem]"
                      onClick={() => downloadCodeArtifact(visualArtifact)}
                    >
                      <DownloadIcon className="size-3" />
                      PNG
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-center rounded-b-md border border-hairline border-t-0 bg-white p-4">
                  <img
                    src={codeArtifactToDataUrl(visualArtifact)}
                    alt={plan.title}
                    className="max-h-[340px] w-auto object-contain"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 font-medium text-[0.68rem] text-muted-foreground">
                      LaTeX Caption
                    </div>
                    <Input
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <div className="mb-1 font-medium text-[0.68rem] text-muted-foreground">
                      LaTeX Label
                    </div>
                    <Input
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    onClick={handleSaveFigureAndScript}
                  >
                    <FilePlus2Icon className="size-3.5" />
                    Save Figure & Script
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    className="h-8 gap-1.5 text-xs"
                    onClick={handleInsertIntoLatex}
                    disabled={!targetTexFile}
                  >
                    <SparklesIcon className="size-3.5" />
                    Insert into LaTeX
                    {targetTexFile ? ` (${targetTexFile.name})` : ""}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mb-3 flex flex-col items-center justify-center rounded-md border border-hairline border-dashed bg-muted/15 px-4 py-6 text-center text-muted-foreground text-xs">
                <p>
                  Click <strong>Compile & Render</strong> to execute the{" "}
                  {codeLanguage === "python" ? "Python" : "R"} script inside the
                  isolated sandbox and preview the 300 DPI journal figure.
                </p>
              </div>
            )}

            {/* Collapsible stdout/stderr console */}
            {runResult && (
              <div className="rounded-md border border-hairline bg-muted/20">
                <button
                  type="button"
                  onClick={() => setConsoleOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs"
                >
                  <span className="flex items-center gap-1.5 font-mono text-[0.7rem]">
                    <TerminalIcon className="size-3.5 text-muted-foreground" />
                    Compiler Console ({runResult.language.toUpperCase()} ·{" "}
                    {runResult.durationMs} ms · exit {runResult.exitCode ?? 0}
                    {runResult.sandboxed ? " · sandboxed" : ""})
                  </span>
                  {consoleOpen ? (
                    <ChevronDownIcon className="size-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRightIcon className="size-3.5 text-muted-foreground" />
                  )}
                </button>
                {consoleOpen && (
                  <div className="border-hairline border-t bg-background p-2.5 font-mono text-[0.7rem]">
                    {runResult.stdout && (
                      <pre className="whitespace-pre-wrap text-foreground/90">
                        {runResult.stdout}
                      </pre>
                    )}
                    {runResult.stderr && (
                      <pre className="mt-1 whitespace-pre-wrap text-destructive">
                        {runResult.stderr}
                      </pre>
                    )}
                    {!runResult.stdout && !runResult.stderr && (
                      <span className="text-muted-foreground">
                        (No console output)
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
