import type { ProjectFile } from "@/lib/project-files";
import type { LatexCompiler } from "@/lib/latex-compiler";
import type { CompileErrorKind } from "@/lib/compile-errors";

export type { CompileErrorKind };

export type CompilePhase =
  | "idle"
  | "compiling"
  | "success"
  | "error"
  | "cancelled";

export interface CompileInputs {
  files: ProjectFile[];
  mainFileId: string | null;
  compiler: LatexCompiler;
}

export interface CompileRun {
  projectId: string | null;
  runId: number;
}

export interface CompileState {
  phase: CompilePhase;
  run: CompileRun | null;
  pdf: Uint8Array | null;
  /**
   * Inputs of the last *successful* compile. Freshness is derived from these,
   * never from the inputs captured at the start of a run — otherwise a failed
   * compile would leave the previous PDF marked as current.
   */
  pdfInputs: CompileInputs | null;
  error: { kind: CompileErrorKind; message: string } | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export type CompileEvent =
  | { type: "start"; projectId: string | null; runId: number; at: number }
  | {
      type: "success";
      projectId: string | null;
      runId: number;
      pdf: Uint8Array;
      inputs: CompileInputs;
      at: number;
    }
  | {
      type: "failure";
      projectId: string | null;
      runId: number;
      kind: CompileErrorKind;
      message: string;
      at: number;
    }
  | { type: "cancel"; projectId: string | null; runId: number; at: number }
  | { type: "reset" };

export function initialCompileState(): CompileState {
  return {
    phase: "idle",
    run: null,
    pdf: null,
    pdfInputs: null,
    error: null,
    startedAt: null,
    finishedAt: null,
  };
}

function isCurrentRun(
  state: CompileState,
  projectId: string | null,
  runId: number,
): boolean {
  return state.run?.projectId === projectId && state.run?.runId === runId;
}

export function compileReducer(
  state: CompileState,
  event: CompileEvent,
): CompileState {
  switch (event.type) {
    case "reset":
      return initialCompileState();

    case "start":
      return {
        // Keep the previous PDF and its inputs on screen while the new run is
        // in flight. The pane can then show a stale result instead of a blank.
        ...state,
        phase: "compiling",
        run: { projectId: event.projectId, runId: event.runId },
        error: null,
        startedAt: event.at,
        finishedAt: null,
      };

    case "success":
      if (!isCurrentRun(state, event.projectId, event.runId)) return state;
      return {
        ...state,
        phase: "success",
        pdf: event.pdf,
        pdfInputs: event.inputs,
        error: null,
        finishedAt: event.at,
      };

    case "failure":
      if (!isCurrentRun(state, event.projectId, event.runId)) return state;
      return {
        // The PDF is intentionally retained: it is the last build the user had.
        ...state,
        phase: "error",
        error: { kind: event.kind, message: event.message },
        finishedAt: event.at,
      };

    case "cancel":
      if (!isCurrentRun(state, event.projectId, event.runId)) return state;
      return {
        ...state,
        phase: "cancelled",
        finishedAt: event.at,
      };
  }
}

/**
 * True when the displayed PDF was produced from exactly the current inputs.
 * Reference equality on `files` is intentional: the store replaces the array on
 * every edit and on hydration.
 */
export function isFresh(state: CompileState, current: CompileInputs): boolean {
  if (state.phase !== "success" || !state.pdfInputs) return false;
  return (
    state.pdfInputs.files === current.files &&
    state.pdfInputs.mainFileId === current.mainFileId &&
    state.pdfInputs.compiler === current.compiler
  );
}
