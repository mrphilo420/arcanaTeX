import { isLatexRelatedFile } from "@/lib/file-kind";
import { useDocumentStore } from "@/stores/document-store";
import { createCoalescedRunner } from "./coalesce";
import {
  LatexCompileError,
  compileLatexWithLog,
  gatherResources,
} from "./latex-compiler";
import { parseLatexLog, resolveDiagnosticFiles } from "./compile-diagnostics";
import type { CompileInputs } from "./compile-machine";

let runCounter = 0;
let activeController: AbortController | null = null;

function isCurrentRun(projectId: string | null, runId: number): boolean {
  return (
    runId === runCounter && useDocumentStore.getState().projectId === projectId
  );
}

async function runCompile(): Promise<void> {
  const state = useDocumentStore.getState();
  const activeFile = state.files.find((file) => file.id === state.activeFileId);

  // The compiler belongs to the LaTeX workspace. Lean, Python, R, Markdown,
  // data, and other files must not trigger it through a shortcut or command.
  if (activeFile && !isLatexRelatedFile(activeFile)) return;

  const projectId = state.projectId;
  const runId = ++runCounter;
  const startedAt = performance.now();
  const fileCount = state.files.length;
  const inputs: CompileInputs = {
    files: state.files,
    mainFileId: state.mainFileId,
    compiler: state.compiler,
  };
  const mainFile =
    state.files.find((file) => file.id === state.mainFileId) ?? null;
  const mainFilePath = mainFile?.path ?? "main.tex";

  const controller = new AbortController();
  activeController = controller;

  state.dispatchCompile({ type: "start", projectId, runId, at: Date.now() });

  try {
    const resources = gatherResources(state.files, state.mainFileId);
    const result = await compileLatexWithLog(
      resources,
      state.compiler,
      controller.signal,
    );

    if (!isCurrentRun(projectId, runId)) return;

    const diagnostics = resolveDiagnosticFiles(
      parseLatexLog(result.log, { mainFilePath }),
      state.files,
      state.mainFileId,
    );

    const current = useDocumentStore.getState();
    current.dispatchCompile({
      type: "success",
      projectId,
      runId,
      pdf: result.pdf,
      inputs,
      at: Date.now(),
    });
    current.setCompileDiagnostics(diagnostics);
    current.setLastCompileLog(result.log || null);
    current.appendCompileLog({
      status: "success",
      compiler: state.compiler,
      durationMs: Math.round(performance.now() - startedAt),
      fileCount,
      message:
        diagnostics.length > 0
          ? `Compiled ${mainFilePath} · ${diagnostics.length} issue${diagnostics.length === 1 ? "" : "s"}`
          : `Compiled ${mainFilePath}`,
    });
  } catch (error) {
    if (!isCurrentRun(projectId, runId)) return;

    const kind = error instanceof LatexCompileError ? error.kind : "unknown";
    const message =
      error instanceof Error ? error.message : "Compilation failed";
    const log = error instanceof LatexCompileError ? error.log : "";

    const current = useDocumentStore.getState();
    if (kind === "aborted") {
      current.dispatchCompile({
        type: "cancel",
        projectId,
        runId,
        at: Date.now(),
      });
    } else {
      current.dispatchCompile({
        type: "failure",
        projectId,
        runId,
        kind,
        message,
        at: Date.now(),
      });
    }

    // A compile that failed at the transport layer has no TeX log. Keep the
    // diagnostics from the last successful build rather than replacing them
    // with an empty list.
    if (log) {
      current.setCompileDiagnostics(
        resolveDiagnosticFiles(
          parseLatexLog(log, { mainFilePath }),
          state.files,
          state.mainFileId,
        ),
      );
      current.setLastCompileLog(log);
    }

    current.appendCompileLog({
      status: "error",
      compiler: state.compiler,
      durationMs: Math.round(performance.now() - startedAt),
      fileCount,
      message: `Failed while compiling ${mainFilePath}`,
      details: message,
    });
  } finally {
    if (activeController === controller) activeController = null;
  }
}

/**
 * Compiles the current project. Only one request is in flight at a time; edits
 * made meanwhile trigger a single follow-up compile instead of stacking
 * requests that would exhaust the compile service's slots.
 */
export const compileProject = createCoalescedRunner(runCompile);

/** Cancels the in-flight compile, if any. */
export function abortCompile(): void {
  activeController?.abort();
}

/**
 * The single subscriber that turns a compile request into a run. Every trigger
 * (toolbar, keymap, auto-compile, panels, hydration) bumps `compileGeneration`;
 * nothing calls `compileProject` directly.
 */
export function startCompileScheduler(): () => void {
  let lastGeneration = useDocumentStore.getState().compileGeneration;
  let lastProjectId: string | null = null;
  let lastInitialized = false;
  let scheduled = false;

  // Defer the bump so a subscription callback never re-enters the store.
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      useDocumentStore.getState().requestCompile();
    });
  };

  return useDocumentStore.subscribe((state) => {
    const previousProjectId = lastProjectId;
    const projectChanged = state.projectId !== previousProjectId;
    const justInitialized = state.initialized && !lastInitialized;
    lastProjectId = state.projectId;
    lastInitialized = state.initialized;

    if (projectChanged && previousProjectId !== null) {
      abortCompile();
    }

    if (state.compileGeneration !== lastGeneration) {
      const bumped = state.compileGeneration > lastGeneration;
      lastGeneration = state.compileGeneration;
      if (bumped) {
        void compileProject();
        return;
      }
    }

    if (
      state.projectId &&
      state.isHydrated &&
      state.initialized &&
      (projectChanged || justInitialized)
    ) {
      schedule();
    }
  });
}
