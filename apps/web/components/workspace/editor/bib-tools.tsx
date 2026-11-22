"use client";

import { useAssistantTool } from "@assistant-ui/react";
import { BookOpenIcon, CheckIcon, LoaderIcon } from "lucide-react";
import type { FC } from "react";
import { z } from "zod";

import { applyAgentEdit } from "@/lib/ai/agent-edits";
import {
  applyBibEntryChanges,
  formatBibtexProblems,
  normalizeBibtex,
  parseBibtex,
} from "@/lib/bibtex";
import { normalizeEol } from "@/lib/ai/file-edits";
import { currentAgentTurnId } from "@/stores/agent-changes-store";
import { useDocumentStore } from "@/stores/document-store";

const CONFLICT_ERROR =
  "The bibliography changed while the patch was being prepared. Re-read it and try again.";

function findBibFile(
  files: Array<{
    id: string;
    name: string;
    path: string;
    type: string;
    content?: string;
  }>,
  requested: string | undefined,
  activeFileId: string,
) {
  const bibliographies = files.filter(
    (file) => file.type === "tex" && /\.bib$/i.test(file.path),
  );
  if (requested) {
    const normalized = requested.replace(/^\/+/, "").trim();
    return bibliographies.find(
      (file) =>
        file.path === normalized ||
        file.name === normalized ||
        file.path.endsWith(`/${normalized}`),
    );
  }
  return (
    bibliographies.find((file) => file.id === activeFileId) ?? bibliographies[0]
  );
}

export const BibTools: FC = () => {
  useAssistantTool({
    toolName: "patch_bibtex",
    description:
      "Correct a .bib file with deterministic BibTeX normalization and report problems. mode='report' inspects without writing; mode='fix' normalizes braces, commas, duplicate/empty fields, pages, month, doi, and unescaped & and %. For a semantic change to one entry, pass entryKey plus set/remove using only values already present in the file or supplied by the user. Never invent authors, titles, years, venues, or DOIs.",
    parameters: z.object({
      path: z
        .string()
        .optional()
        .describe(
          "Relative .bib path. Defaults to the active .bib or the first bibliography in the project.",
        ),
      mode: z
        .enum(["fix", "report"])
        .optional()
        .describe(
          "fix applies safe mechanical corrections; report only inspects.",
        ),
      entryKey: z
        .string()
        .optional()
        .describe("Entry to modify when set/remove are provided."),
      set: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Field replacements for entryKey. Use only data present in the source or supplied by the user.",
        ),
      remove: z
        .array(z.string())
        .optional()
        .describe("Field names to remove from entryKey."),
    }),
    execute: async (
      input: {
        path?: string;
        mode?: "fix" | "report";
        entryKey?: string;
        set?: Record<string, string>;
        remove?: string[];
      },
      { toolCallId },
    ) => {
      const state = useDocumentStore.getState();
      const file = findBibFile(state.files, input.path, state.activeFileId);
      if (!file) {
        return {
          success: false,
          error:
            "No .bib file was found. Add one from the Literature panel or create references.bib first.",
        };
      }

      const before = file.content ?? "";
      const mode = input.mode ?? "fix";

      if (mode === "report") {
        const parsed = parseBibtex(before);
        return {
          success: true,
          path: file.path,
          changed: false,
          report: formatBibtexProblems(parsed.problems),
          problems: parsed.problems.slice(0, 60),
          entries: parsed.entries.map((entry) => ({
            key: entry.key,
            type: entry.type,
            fields: entry.fields.map((field) => field.name),
            line: entry.line,
          })),
        };
      }

      let working = before;
      if (input.entryKey && (input.set || input.remove)) {
        const changed = applyBibEntryChanges(
          working,
          input.entryKey,
          input.set,
          input.remove,
        );
        if (!changed.ok) {
          return { success: false, error: changed.reason };
        }
        working = changed.content;
      }

      const normalized = normalizeBibtex(working);
      if (!normalized.changed && working === before) {
        return {
          success: true,
          path: file.path,
          changed: false,
          report: formatBibtexProblems(normalized.problems),
          problems: normalized.problems.slice(0, 60),
        };
      }

      const after = normalized.content;
      const result = await applyAgentEdit({
        turnId: currentAgentTurnId(),
        toolCallId,
        fileId: file.id,
        before,
        after,
        applied: [
          {
            start: 0,
            end: normalizeEol(before).length,
            before: normalizeEol(before),
            after: normalizeEol(after),
          },
        ],
      });

      if (!result.ok) {
        return {
          success: false,
          error:
            result.reason === "conflict"
              ? CONFLICT_ERROR
              : "The bibliography file is no longer available.",
        };
      }

      return {
        success: true,
        path: file.path,
        changed: after !== before,
        report: formatBibtexProblems(normalized.problems),
        problems: normalized.problems.slice(0, 60),
        message: `BibTeX normalized in ${file.path}.`,
      };
    },
    render: function PatchBibtexRender({ result }) {
      const isComplete = result != null;
      const hasError = result?.success === false;
      const changed = result?.success === true && result.changed;
      const report =
        result && result.success === true && "report" in result
          ? result.report
          : null;
      const hasReport =
        typeof report === "string" &&
        report.length > 0 &&
        report !== "No BibTeX problems found.";

      return (
        <div className="my-2 overflow-hidden rounded-lg border border-border bg-muted/50 text-sm">
          <div className="flex items-center gap-2 px-3 py-2">
            {isComplete ? (
              hasError ? (
                <span className="size-4 text-amber-600">!</span>
              ) : (
                <CheckIcon className="size-4 text-green-600" />
              )
            ) : (
              <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
            )}
            <BookOpenIcon className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {hasError
                ? result.error
                : !isComplete
                  ? "Checking BibTeX..."
                  : changed
                    ? "Patched BibTeX"
                    : "BibTeX report ready"}
            </span>
            {hasReport && (
              <span className="ml-auto text-[0.6875rem] text-muted-foreground">
                {report.split("\n").length} item
                {report.split("\n").length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {hasReport && (
            <details className="border-hairline border-t px-3 py-2">
              <summary className="cursor-pointer text-[0.75rem] text-muted-foreground">
                Review BibTeX report
              </summary>
              <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap font-mono text-[0.6875rem] leading-relaxed">
                {report}
              </pre>
            </details>
          )}
        </div>
      );
    },
  });

  return null;
};
