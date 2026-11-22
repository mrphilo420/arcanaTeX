import type { AgentFileChange } from "@/stores/agent-changes-store";
import { lineDiffStats } from "./diff-stats";
import { offsetsToLineRange } from "./file-edits";

export interface MergeFileSummary {
  fileId: string;
  filePath: string;
  changes: AgentFileChange[];
  kind: "created" | "modified";
  added: number;
  removed: number;
  firstLine: number;
}

/**
 * Groups one turn's changes by file and computes the net line diff for each
 * file from the first `before` to the last `after`.
 */
export function summarizeTurnChanges(
  changes: AgentFileChange[],
): MergeFileSummary[] {
  const groups = new Map<string, AgentFileChange[]>();

  for (const change of changes) {
    const existing = groups.get(change.fileId);
    if (existing) existing.push(change);
    else groups.set(change.fileId, [change]);
  }

  return [...groups.entries()].map(([fileId, fileChanges]) => {
    const first = fileChanges[0];
    const last = fileChanges[fileChanges.length - 1];
    const stats = lineDiffStats(first.before, last.after);
    const applied = first.applied[0];
    const firstLine = applied
      ? offsetsToLineRange(first.before, applied.start, applied.start).startLine
      : 1;

    return {
      fileId,
      filePath: first.filePath,
      changes: fileChanges,
      kind: first.kind === "create" ? "created" : "modified",
      added: stats.added,
      removed: stats.removed,
      firstLine,
    };
  });
}
