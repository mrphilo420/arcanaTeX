"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { EditorDiagnosticMark } from "@/lib/editor-diagnostics";
import { type LatexLintIssue, lintLatexProject } from "@/lib/latex-linter";
import { isLatexDocumentFile } from "@/lib/project-files";
import { useDocumentStore } from "@/stores/document-store";

const EMPTY_ISSUES: LatexLintIssue[] = [];
const EMPTY_MARKS: EditorDiagnosticMark[] = [];

export interface ProjectLintState {
  fileId: string;
  filePath: string;
  contentSnapshot: string;
  issues: LatexLintIssue[];
  marks: EditorDiagnosticMark[];
  errors: number;
  warnings: number;
  infos: number;
}

const INITIAL_LINT_STATE: ProjectLintState = {
  fileId: "",
  filePath: "",
  contentSnapshot: "",
  issues: EMPTY_ISSUES,
  marks: EMPTY_MARKS,
  errors: 0,
  warnings: 0,
  infos: 0,
};

export const useProjectLintStore = create<ProjectLintState>(() => ({
  ...INITIAL_LINT_STATE,
}));

function computeAndCommitLint(): void {
  const { files, activeFileId } = useDocumentStore.getState();
  const activeFile = files.find((file) => file.id === activeFileId);
  if (!activeFile || !isLatexDocumentFile(activeFile)) {
    const current = useProjectLintStore.getState();
    if (current.fileId !== "") {
      useProjectLintStore.setState(INITIAL_LINT_STATE);
    }
    return;
  }

  const contentSnapshot = activeFile.content ?? "";
  const report = lintLatexProject(files, activeFile.path);
  const activeIssues = report.activeIssues;
  const marks: EditorDiagnosticMark[] =
    activeIssues.length > 0
      ? activeIssues.map((issue) => ({
          line: issue.line,
          severity: issue.severity,
          message: `[${issue.code}] ${issue.message}`,
        }))
      : EMPTY_MARKS;

  useProjectLintStore.setState({
    fileId: activeFile.id,
    filePath: activeFile.path,
    contentSnapshot,
    issues: activeIssues,
    marks,
    errors: report.activeCounts.error,
    warnings: report.activeCounts.warning,
    infos: report.activeCounts.info,
  });
}

let activeConsumers = 0;
let pendingTimer: number | null = null;
let storeUnsubscribe: (() => void) | null = null;
let lastObservedFileId = "";

function clearPendingTimer(): void {
  if (pendingTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

function scheduleLintPass(delayMs: number): void {
  if (typeof window === "undefined") return;
  clearPendingTimer();
  const { files, activeFileId } = useDocumentStore.getState();
  const activeFile = files.find((file) => file.id === activeFileId);
  if (!activeFile || !isLatexDocumentFile(activeFile)) {
    const current = useProjectLintStore.getState();
    if (current.fileId !== "") {
      useProjectLintStore.setState(INITIAL_LINT_STATE);
    }
    return;
  }
  pendingTimer = window.setTimeout(() => {
    pendingTimer = null;
    computeAndCommitLint();
  }, delayMs);
}

/**
 * Runs an immediate static lint pass and updates shared lint subscribers.
 * Useful right after applying quick fixes.
 */
export function recomputeProjectLintNow(): void {
  clearPendingTimer();
  computeAndCommitLint();
}

function attachSharedLintWatcher(): void {
  if (storeUnsubscribe) return;
  const initial = useDocumentStore.getState();
  lastObservedFileId = initial.activeFileId;
  scheduleLintPass(40);

  storeUnsubscribe = useDocumentStore.subscribe((state, prevState) => {
    if (
      state.files === prevState.files &&
      state.activeFileId === prevState.activeFileId
    ) {
      return;
    }
    const fileSwitched = state.activeFileId !== lastObservedFileId;
    lastObservedFileId = state.activeFileId;
    scheduleLintPass(fileSwitched ? 40 : 280);
  });
}

function detachSharedLintWatcher(): void {
  clearPendingTimer();
  if (storeUnsubscribe) {
    storeUnsubscribe();
    storeUnsubscribe = null;
  }
}

/**
 * Ensures the shared single-pass debounced LaTeX linter is active while at
 * least one consumer is mounted, and returns the current active-file lint state.
 */
export function useActiveFileLint(): ProjectLintState {
  useEffect(() => {
    activeConsumers += 1;
    if (activeConsumers === 1) {
      attachSharedLintWatcher();
    }
    return () => {
      activeConsumers = Math.max(0, activeConsumers - 1);
      if (activeConsumers === 0) {
        detachSharedLintWatcher();
      }
    };
  }, []);

  return useProjectLintStore();
}
