"use client";

import { useAssistantToolUI } from "@assistant-ui/react";
import {
  AlertTriangleIcon,
  CheckIcon,
  CodeIcon,
  FilePlus2Icon,
  GitBranchIcon,
  ImagePlusIcon,
  LoaderIcon,
  TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  codeArtifactToDataUrl,
  isFigureArtifactPath,
} from "@/lib/code-artifacts";
import type { CodeArtifact } from "@/lib/code-runner";
import {
  buildLatexFigureSnippet,
  ensureGraphicxInLatex,
} from "@/lib/figure-engine";
import {
  detectMainFile,
  fileTypeForName,
  getBaseName,
  getExtension,
  isLatexDocumentFile,
  mimeTypeForName,
} from "@/lib/project-files";
import { useDocumentStore } from "@/stores/document-store";

interface CodeResult {
  success?: boolean;
  language?: string;
  exitCode?: number | null;
  timedOut?: boolean;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
  artifacts?: CodeArtifact[];
  sandboxed?: boolean;
  warning?: string;
  error?: string;
}

interface SubagentResult {
  role: string;
  task: string;
  text: string;
  error?: string;
}

interface SubagentResponse {
  model?: string;
  results?: SubagentResult[];
  succeeded?: number;
  failed?: number;
  success?: boolean;
  error?: string;
}

function CodeToolCard({
  language,
  result,
}: {
  language: "Python" | "R" | "Matplotlib";
  result: CodeResult | undefined;
}) {
  const isComplete = result != null;
  const success = result?.success === true;
  const failed = isComplete && !success;
  const artifacts = result?.artifacts ?? [];
  const visualArtifact = artifacts.find((artifact) => {
    const ext = getExtension(artifact.path);
    return ext === "png" || ext === "svg" || ext === "jpg" || ext === "jpeg";
  });
  const figureArtifacts = artifacts.filter((artifact) =>
    isFigureArtifactPath(artifact.path),
  );

  const saveFiguresToProject = (): string | null => {
    if (figureArtifacts.length === 0) return null;
    const store = useDocumentStore.getState();
    const prevActive = store.activeFileId;
    let preferredPath: string | null = null;

    for (const artifact of figureArtifacts) {
      const mimeType =
        artifact.mimeType ??
        mimeTypeForName(artifact.path) ??
        "application/octet-stream";
      const type = fileTypeForName(artifact.path, mimeType);
      store.addFile({
        name: getBaseName(artifact.path),
        path: artifact.path,
        type,
        mimeType,
        dataUrl: codeArtifactToDataUrl(artifact),
        content: artifact.encoding === "utf-8" ? artifact.content : undefined,
      });
      if (getExtension(artifact.path) === "pdf") {
        preferredPath = artifact.path;
      } else if (!preferredPath) {
        preferredPath = artifact.path;
      }
    }

    if (prevActive) store.setActiveFile(prevActive);
    return preferredPath;
  };

  const handleSaveFigures = () => {
    const saved = saveFiguresToProject();
    if (saved) {
      toast.success(
        `Saved ${figureArtifacts.map((a) => a.path).join(", ")} to project`,
      );
    }
  };

  const handleInsertIntoLatex = () => {
    const graphicPath = saveFiguresToProject();
    if (!graphicPath) return;

    const state = useDocumentStore.getState();
    const active = state.files.find((f) => f.id === state.activeFileId);
    const target =
      active && isLatexDocumentFile(active)
        ? active
        : (state.files.find((f) => f.id === state.mainFileId) ??
          detectMainFile(state.files));

    if (!target) {
      toast.info(
        `Saved ${graphicPath}. No .tex document active to insert into.`,
      );
      return;
    }

    const stem = getBaseName(graphicPath).replace(/\.[^.]+$/, "");
    const snippet = buildLatexFigureSnippet({
      imagePath: graphicPath,
      caption: `Matplotlib figure (${stem}).`,
      label: `fig:${stem.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`,
      doubleColumn: false,
    });
    const nextTex = ensureGraphicxInLatex(target.content ?? "", snippet);
    state.updateFileContent(target.id, nextTex);
    state.setActiveFile(target.id);
    state.requestCompile();
    toast.success(`Inserted ${graphicPath} into ${target.path}`);
  };

  return (
    <div className="my-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        {!isComplete ? (
          <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
        ) : success ? (
          <CheckIcon className="size-4 text-green-600" />
        ) : (
          <AlertTriangleIcon className="size-4 text-amber-600" />
        )}
        <TerminalIcon className="size-4 text-muted-foreground" />
        <span className="font-medium">
          {isComplete
            ? failed
              ? `${language} exited with an error`
              : `${language} completed`
            : `Running ${language}...`}
        </span>
        {isComplete && typeof result.durationMs === "number" && (
          <span className="ml-auto font-mono text-[0.7rem] text-muted-foreground">
            {(result.durationMs / 1000).toFixed(2)}s
          </span>
        )}
      </div>

      {isComplete && visualArtifact && (
        <div className="mt-2 overflow-hidden rounded-md border border-border/70 bg-white p-2">
          <img
            src={codeArtifactToDataUrl(visualArtifact)}
            alt={visualArtifact.path}
            className="mx-auto max-h-64 w-auto object-contain"
          />
        </div>
      )}

      {isComplete && figureArtifacts.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-[0.7rem]"
            onClick={handleSaveFigures}
          >
            <FilePlus2Icon className="size-3" />
            Save to project
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-6 gap-1 px-2 text-[0.7rem]"
            onClick={handleInsertIntoLatex}
          >
            <ImagePlusIcon className="size-3" />
            Insert into LaTeX
          </Button>
        </div>
      )}

      {isComplete && artifacts.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {artifacts.map((artifact) => (
            <span
              key={artifact.path}
              className="rounded border border-border/70 bg-background/70 px-1.5 py-0.5 font-mono text-[0.68rem] text-muted-foreground"
              title={artifact.truncated ? "Artifact truncated" : undefined}
            >
              {artifact.path}
            </span>
          ))}
        </div>
      )}

      {isComplete && success && result.stdout && (
        <pre className="mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap font-mono text-[0.7rem] text-muted-foreground">
          {result.stdout.slice(0, 1_000)}
        </pre>
      )}

      {isComplete && result.stderr && failed && (
        <pre className="mt-1.5 max-h-28 overflow-auto whitespace-pre-wrap font-mono text-[0.7rem] text-amber-700 dark:text-amber-400">
          {result.stderr.slice(0, 1_200)}
        </pre>
      )}

      {isComplete && result.warning && (
        <p className="mt-1 text-[0.7rem] text-muted-foreground">
          {result.warning}
        </p>
      )}
    </div>
  );
}

function SubagentsCard({ result }: { result: SubagentResponse | undefined }) {
  const isComplete = result != null;
  const failed = result?.failed ?? 0;

  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
      {isComplete ? (
        failed > 0 ? (
          <AlertTriangleIcon className="size-4 text-amber-600" />
        ) : (
          <CheckIcon className="size-4 text-green-600" />
        )
      ) : (
        <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
      )}
      <GitBranchIcon className="size-4 text-muted-foreground" />
      <span className="text-muted-foreground">
        {!isComplete
          ? "Running subagents..."
          : failed > 0
            ? `${result.succeeded ?? 0} subagents succeeded, ${failed} failed`
            : `${result.succeeded ?? result.results?.length ?? 0} subagents completed`}
      </span>
    </div>
  );
}

function useCodeToolUI(language: "python" | "r") {
  const label = language === "python" ? "Python" : "R";

  useAssistantToolUI({
    toolName: language === "python" ? "run_python" : "run_r",
    render: ({ result }) => (
      <CodeToolCard
        language={label}
        result={result as CodeResult | undefined}
      />
    ),
  });
}

export function CodeTools() {
  useCodeToolUI("python");
  useCodeToolUI("r");

  useAssistantToolUI({
    toolName: "plot_matplotlib",
    render: ({ result }) => (
      <CodeToolCard
        language="Matplotlib"
        result={result as CodeResult | undefined}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "spawn_subagents",
    render: ({ result }) => (
      <SubagentsCard result={result as SubagentResponse | undefined} />
    ),
  });

  return null;
}

export function CodeToolsBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground">
      <CodeIcon className="size-3" />
      Python · R · subagents
    </span>
  );
}
