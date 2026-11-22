"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  LoaderIcon,
  PlayIcon,
  SparklesIcon,
  UndoIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyEdits } from "@/lib/ai/file-edits";
import type { FilePatch } from "@/lib/ai/line-diff";
import { createProjectVersion } from "@/lib/projects/repository";
import { useDocumentStore } from "@/stores/document-store";

interface AgentChange {
  path: string;
  patch: FilePatch;
}

type RowStatus = "pending" | "kept" | "dismissed" | "conflict";

interface ChangeRow {
  id: string;
  path: string;
  find: string;
  replace: string;
  added: number;
  removed: number;
  status: RowStatus;
  message?: string;
}

interface AgentPanelProps {
  open: boolean;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  idle: "Ready",
  running: "Running",
  done: "Finished",
  error: "Failed",
};

/** Splits a hunk into the lines that actually changed, for the preview. */
function splitHunk(find: string, replace: string) {
  const before = find.split("\n");
  const after = replace.split("\n");

  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    removed: before.slice(prefix, before.length - suffix),
    added: after.slice(prefix, after.length - suffix),
  };
}

function rowsFromChanges(changes: AgentChange[]): ChangeRow[] {
  const rows: ChangeRow[] = [];

  for (const change of changes) {
    if (change.patch.kind === "replace") {
      const { removed, added } = splitHunk(
        change.patch.before,
        change.patch.content,
      );
      rows.push({
        id: `${change.path}:replace`,
        path: change.path,
        find: change.patch.before,
        replace: change.patch.content,
        added: added.length,
        removed: removed.length,
        status: "pending",
      });
      continue;
    }

    change.patch.edits.forEach((edit, index) => {
      const { removed, added } = splitHunk(edit.find, edit.replace);
      rows.push({
        id: `${change.path}:${index}`,
        path: change.path,
        find: edit.find,
        replace: edit.replace,
        added: added.length,
        removed: removed.length,
        status: "pending",
      });
    });
  }

  return rows;
}

export function AgentPanel({ open, onClose }: AgentPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const [output, setOutput] = useState("");
  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [meta, setMeta] = useState<{ cost?: number; ms?: number }>({});
  const snapshotted = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const updateRow = useCallback((id: string, patch: Partial<ChangeRow>) => {
    setRows((previous) =>
      previous.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }, []);

  const snapshotOnce = useCallback(async () => {
    if (snapshotted.current) return;
    snapshotted.current = true;
    const state = useDocumentStore.getState();
    if (!state.projectId) return;
    try {
      await createProjectVersion({
        projectId: state.projectId,
        label: "Before local agent edits",
        name: state.projectName,
        projectCreatedAt: state.createdAt ?? Date.now(),
        files: state.files,
        activeFileId: state.activeFileId || state.files[0]?.id || "",
        mainFileId: state.mainFileId,
        compiler: state.compiler,
        comments: state.comments,
      });
    } catch (error) {
      console.error("Could not snapshot before agent edits", error);
    }
  }, []);

  const keepRow = useCallback(
    async (row: ChangeRow) => {
      await snapshotOnce();
      const state = useDocumentStore.getState();
      const file = state.files.find(
        (candidate) =>
          candidate.path === row.path || candidate.name === row.path,
      );

      if (!file) {
        // A file the agent created.
        state.addFile({
          path: row.path,
          name: row.path.split("/").pop() ?? row.path,
          type: "tex",
          content: row.replace,
        });
        updateRow(row.id, { status: "kept" });
        state.requestCompile();
        return;
      }

      const result = applyEdits(file.content ?? "", [
        { find: row.find, replace: row.replace },
      ]);

      if (!result.ok) {
        updateRow(row.id, {
          status: "conflict",
          message:
            result.reason === "ambiguous"
              ? `This change matches ${result.count ?? "several"} places in the file. Edit it by hand.`
              : result.reason === "not_found"
                ? "This text changed since the agent ran. The change was not applied."
                : `Could not apply: ${result.reason}.`,
        });
        return;
      }

      state.updateFileContent(file.id, result.content);
      updateRow(row.id, { status: "kept" });
      state.requestCompile();
    },
    [snapshotOnce, updateRow],
  );

  const run = useCallback(async () => {
    const instruction = prompt.trim();
    if (!instruction || status === "running") return;

    const state = useDocumentStore.getState();
    const files = state.files
      .filter((file) => file.type === "tex" && typeof file.content === "string")
      .map((file) => ({ path: file.path, content: file.content ?? "" }));

    const context = [
      `Project: ${state.projectName}`,
      `Main document: ${state.files.find((f) => f.id === state.mainFileId)?.path ?? "unknown"}`,
      `Files: ${state.files.map((f) => f.path).join(", ")}`,
    ].join("\n");

    snapshotted.current = false;
    setStatus("running");
    setOutput("");
    setRows([]);
    setMeta({});

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: instruction, context, files }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setOutput(body.error ?? "The agent request failed.");
        setStatus("error");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let split = buffer.indexOf("\n\n");
        while (split !== -1) {
          const chunk = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (line) {
            const payload = line.slice(6);
            if (payload !== "[DONE]") {
              try {
                const event = JSON.parse(payload) as {
                  type?: string;
                  text?: string;
                  message?: string;
                  costUsd?: number;
                  durationMs?: number;
                  files?: AgentChange[];
                };
                if (event.type === "text" && event.text) {
                  setOutput((previous) => previous + event.text);
                } else if (event.type === "result") {
                  setOutput(event.text ?? "");
                  setMeta({ cost: event.costUsd, ms: event.durationMs });
                } else if (event.type === "changes" && event.files) {
                  setRows(rowsFromChanges(event.files));
                } else if (event.type === "error") {
                  setOutput(event.message ?? "The agent failed.");
                  setStatus("error");
                }
              } catch {
                // Ignore malformed frames.
              }
            }
          }
          split = buffer.indexOf("\n\n");
        }
      }

      setStatus((current) => (current === "error" ? current : "done"));
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setOutput((error as Error).message);
        setStatus("error");
      }
    } finally {
      abortRef.current = null;
      setStatus((current) => (current === "running" ? "done" : current));
    }
  }, [prompt, status]);

  const pendingCount = useMemo(
    () => rows.filter((row) => row.status === "pending").length,
    [rows],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/30 p-6 backdrop-blur-[2px] sm:items-center">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-hairline bg-popover text-foreground shadow-[0_30px_90px_-30px_rgba(20,20,19,0.5)]">
        <header className="flex items-center gap-2 border-hairline border-b px-4 py-3">
          <SparklesIcon className="size-4 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[13.5px]">Local agent</div>
            <div className="text-[11px] text-muted-foreground">
              Runs on this machine. Every change is applied only when you keep
              it.
            </div>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {STATUS_LABEL[status]}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"
            aria-label="Close"
          >
            <XIcon className="size-3.5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask the agent to change the project, for example: add a related-work section and cite the two papers already in references.bib."
            className="min-h-[76px] w-full resize-y rounded-lg border border-hairline bg-background px-3 py-2 text-[13px] outline-none focus-visible:border-primary/50"
            disabled={status === "running"}
          />

          {output && (
            <div className="whitespace-pre-wrap rounded-lg border border-hairline bg-background px-3 py-2 text-[13px] leading-relaxed">
              {output}
            </div>
          )}

          {rows.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-hairline">
              <div className="flex items-center justify-between border-hairline border-b bg-card px-3 py-2">
                <span className="font-medium text-[12px]">
                  {rows.length} proposed change{rows.length === 1 ? "" : "s"}
                  {pendingCount > 0 ? ` · ${pendingCount} pending` : ""}
                </span>
                {pendingCount > 0 && (
                  <Button
                    size="sm"
                    className="h-7 px-2 text-[12px]"
                    onClick={() => {
                      void (async () => {
                        for (const row of rows.filter(
                          (candidate) => candidate.status === "pending",
                        )) {
                          await keepRow(row);
                        }
                      })();
                    }}
                  >
                    Keep all
                  </Button>
                )}
              </div>

              <ul className="divide-y divide-hairline">
                {rows.map((row, index) => {
                  const previous = rows[index - 1];
                  const showPath = !previous || previous.path !== row.path;
                  const { removed, added } = splitHunk(row.find, row.replace);
                  return (
                    <li key={row.id} className="px-3 py-2">
                      {showPath && (
                        <div className="mb-1.5 font-mono text-[11.5px] text-muted-foreground">
                          {row.path}
                        </div>
                      )}
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1 overflow-x-auto rounded border border-hairline bg-background">
                          <pre className="m-0 p-2 font-mono text-[11.5px] leading-[1.55]">
                            {removed.map((line, i) => (
                              <div
                                key={`r${i}`}
                                className="bg-[#c64545]/8 text-[#a33a3a]"
                              >
                                {`- ${line}`}
                              </div>
                            ))}
                            {added.map((line, i) => (
                              <div
                                key={`a${i}`}
                                className="bg-[#4f7f6a]/10 text-[#3f6a58]"
                              >
                                {`+ ${line}`}
                              </div>
                            ))}
                          </pre>
                        </div>

                        <div className="flex shrink-0 flex-col gap-1">
                          {row.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 px-2 text-[11.5px]"
                                onClick={() => void keepRow(row)}
                              >
                                <CheckIcon className="size-3" />
                                Keep
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 gap-1 px-2 text-[11.5px] text-muted-foreground"
                                onClick={() =>
                                  updateRow(row.id, { status: "dismissed" })
                                }
                              >
                                <UndoIcon className="size-3" />
                                Undo
                              </Button>
                            </>
                          )}
                          {row.status === "kept" && (
                            <span className="flex items-center gap-1 text-[#3f6a58] text-[11.5px]">
                              <CheckIcon className="size-3.5" />
                              Kept
                            </span>
                          )}
                          {row.status === "dismissed" && (
                            <span className="text-[11.5px] text-muted-foreground">
                              Undone
                            </span>
                          )}
                          {row.status === "conflict" && (
                            <span className="flex items-center gap-1 text-[11px] text-destructive">
                              <AlertCircleIcon className="size-3.5" />
                              Conflict
                            </span>
                          )}
                        </div>
                      </div>
                      {row.status === "conflict" && row.message && (
                        <p className="mt-1.5 text-[11px] text-destructive">
                          {row.message}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {status === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
              {output || "The agent could not complete this request."}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-hairline border-t px-4 py-3">
          <div className="text-[11px] text-muted-foreground">
            {meta.cost !== undefined
              ? `$${meta.cost.toFixed(3)} · ${Math.round((meta.ms ?? 0) / 1000)}s`
              : "Claude Code runs headless in a temporary copy of the project."}
          </div>
          <div className="flex items-center gap-2">
            {status === "running" ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => abortRef.current?.abort()}
              >
                <LoaderIcon className="size-3.5 animate-spin" />
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-8"
                disabled={!prompt.trim()}
                onClick={() => void run()}
              >
                <PlayIcon className="size-3.5" />
                Run agent
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
