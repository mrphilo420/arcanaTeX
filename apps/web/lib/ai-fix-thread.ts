import type { AiFixPatch } from "./ai-fixes";

function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : (pluralForm ?? `${singular}s`);
}

export function formatPatchLocation(patch: AiFixPatch): string {
  const range =
    patch.startLine === patch.endLine
      ? `${patch.startLine}`
      : `${patch.startLine}-${patch.endLine}`;
  return `\`${patch.filePath}:${range}\``;
}

/**
 * Assistant-side record for a repair that ran outside the composer. The thread
 * shows this instead of leaving the action only in a toast.
 */
export function formatAiFixThread(input: {
  applied: AiFixPatch[];
  rejected?: { reason: string }[];
  notes?: string;
  failure?: string;
}): string {
  const lines = ["**Compile repair**", ""];

  if (input.failure) {
    lines.push(`The repair failed: ${input.failure}`);
    return lines.join("\n");
  }

  if (input.applied.length === 0) {
    lines.push("No safe patch was proposed.");
    if (input.rejected?.[0]?.reason) {
      lines.push("", input.rejected[0].reason);
    }
    if (input.notes) lines.push("", input.notes);
    return lines.join("\n");
  }

  lines.push(
    `Applied ${input.applied.length} ${plural(input.applied.length, "patch", "patches")}:`,
  );
  for (const patch of input.applied) {
    lines.push(`- ${formatPatchLocation(patch)}: ${patch.explanation}`);
  }

  if (input.rejected?.length) {
    lines.push(
      "",
      `${input.rejected.length} ${plural(input.rejected.length, "patch", "patches")} rejected: ${input.rejected[0].reason}`,
    );
  }
  if (input.notes) lines.push("", input.notes);

  lines.push("", "A version snapshot is available in **Versions**.");
  return lines.join("\n");
}

/** Assistant-side record for the multi-round Fix all run. */
export function formatFixAllThread(input: {
  appliedTotal: number;
  rounds: string[];
  remaining: number;
  details?: string[];
  warning?: string;
}): string {
  const lines = ["**Compile repair**", ""];

  if (input.appliedTotal === 0) {
    lines.push("No safe fix was found.");
    if (input.warning) lines.push("", input.warning);
    return lines.join("\n");
  }

  lines.push(
    `Applied ${input.appliedTotal} ${plural(input.appliedTotal, "fix", "fixes")} in ${input.rounds.length} ${plural(input.rounds.length, "round")}:`,
  );
  for (const round of input.rounds) lines.push(`- ${round}`);
  if (input.details?.length) {
    lines.push("", "Changes:");
    for (const detail of input.details) lines.push(`- ${detail}`);
  }
  lines.push("");
  lines.push(
    input.remaining === 0
      ? "No prioritized issues remain."
      : `${input.remaining} prioritized ${plural(input.remaining, "issue")} ${
          input.remaining === 1 ? "remains" : "remain"
        }.`,
  );
  lines.push("", "A version snapshot is available in **Versions**.");
  return lines.join("\n");
}
