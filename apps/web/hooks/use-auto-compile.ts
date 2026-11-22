"use client";

import { useEffect } from "react";
import { isLatexRelatedFile } from "@/lib/file-kind";
import { useDocumentStore } from "@/stores/document-store";

const AUTO_COMPILE_DELAY_MS = 1200;

export function useAutoCompile() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = useDocumentStore.subscribe((state, previous) => {
      if (state.compileGeneration !== previous.compileGeneration) {
        if (timer) clearTimeout(timer);
        timer = undefined;
        return;
      }

      const activeFileChanged = state.activeFileId !== previous.activeFileId;
      if (state.files === previous.files && !activeFileChanged) return;

      const activeFile = state.files.find(
        (file) => file.id === state.activeFileId,
      );
      if (!activeFile || !isLatexRelatedFile(activeFile)) return;
      if (!state.autoCompile || !state.isHydrated || !state.initialized) {
        return;
      }

      const attempt = () => {
        const current = useDocumentStore.getState();
        if (
          !current.autoCompile ||
          !current.isHydrated ||
          !current.initialized
        ) {
          timer = undefined;
          return;
        }
        if (current.compile.phase === "compiling") {
          timer = setTimeout(attempt, 700);
          return;
        }
        timer = undefined;
        current.requestCompile();
      };

      if (timer) clearTimeout(timer);
      timer = setTimeout(attempt, AUTO_COMPILE_DELAY_MS);
    });

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);
}
