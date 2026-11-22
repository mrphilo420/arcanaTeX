"use client";

import { useEffect, useState } from "react";
import { type ProjectFile, useDocumentStore } from "@/stores/document-store";

function haveSameFileStructure(a: ProjectFile[], b: ProjectFile[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].id !== b[i].id ||
      a[i].name !== b[i].name ||
      a[i].path !== b[i].path ||
      a[i].type !== b[i].type
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Returns the project's `files` array while ignoring pure `content` / `dataUrl`
 * edits so structural UI (like the file tree and file counts) skips keystroke
 * re-renders.
 */
export function useStructuralProjectFiles(): ProjectFile[] {
  const [files, setFiles] = useState<ProjectFile[]>(
    () => useDocumentStore.getState().files,
  );

  useEffect(() => {
    setFiles((prev) => {
      const current = useDocumentStore.getState().files;
      return haveSameFileStructure(prev, current) ? prev : current;
    });

    return useDocumentStore.subscribe((state, prevState) => {
      if (state.files === prevState.files) return;
      setFiles((prev) =>
        haveSameFileStructure(prev, state.files) ? prev : state.files,
      );
    });
  }, []);

  return files;
}
