"use client";

import { useCallback, useState } from "react";
import type { SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import { CheckIcon, CopyIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";

/**
 * Code block rendered inside assistant messages. Copy is always available;
 * LaTeX blocks can also be inserted at the caret of the open document.
 */
export function ChatCodeBlock({ language, code }: SyntaxHighlighterProps) {
  const insertAtCursor = useDocumentStore((s) => s.insertAtCursor);
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);

  const normalizedLanguage = (language ?? "").toLowerCase();
  const isLatex = ["latex", "tex", "bibtex", "bib", "tikz"].includes(
    normalizedLanguage,
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [code]);

  const insert = useCallback(() => {
    insertAtCursor(code);
    setInserted(true);
    window.setTimeout(() => setInserted(false), 1600);
  }, [code, insertAtCursor]);

  return (
    <div className="group my-2 overflow-hidden rounded-lg border border-hairline bg-muted/40">
      <div className="flex items-center gap-2 border-hairline border-b px-3 py-1.5">
        <span className="font-mono text-[0.68rem] text-muted-foreground uppercase tracking-[0.1em]">
          {language || "text"}
        </span>
        <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={() => void copy()}
            className={cn(
              "flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            )}
            aria-label="Copy code"
          >
            {copied ? (
              <CheckIcon className="size-3 text-[#4f7f6a]" />
            ) : (
              <CopyIcon className="size-3" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
          {isLatex && (
            <button
              type="button"
              onClick={insert}
              className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Insert code at the cursor"
            >
              {inserted ? (
                <CheckIcon className="size-3 text-[#4f7f6a]" />
              ) : (
                <PlusIcon className="size-3" />
              )}
              {inserted ? "Inserted" : "Insert"}
            </button>
          )}
        </div>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
