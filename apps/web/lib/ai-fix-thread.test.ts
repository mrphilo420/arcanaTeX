import { describe, expect, it } from "vitest";
import type { AiFixPatch } from "./ai-fixes";
import { formatAiFixThread, formatFixAllThread } from "./ai-fix-thread";

function patch(overrides: Partial<AiFixPatch> = {}): AiFixPatch {
  return {
    diagnosticId: "d1",
    fileId: "f1",
    filePath: "document.tex",
    startLine: 3,
    endLine: 3,
    replacement: "% fixed",
    explanation: "Commented out the undefined command.",
    confidence: "high",
    ...overrides,
  };
}

describe("formatAiFixThread", () => {
  it("lists applied patches and the snapshot", () => {
    const message = formatAiFixThread({
      applied: [
        patch(),
        patch({
          diagnosticId: "d2",
          filePath: "main.tex",
          startLine: 10,
          endLine: 12,
          explanation: "Added emergency stretch.",
        }),
      ],
      rejected: [{ reason: "Patch overlaps another proposed patch." }],
      notes: "One warning was intentional.",
    });

    expect(message).toContain("**Compile repair**");
    expect(message).toContain("Applied 2 patches:");
    expect(message).toContain("`document.tex:3`");
    expect(message).toContain("`main.tex:10-12`");
    expect(message).toContain("1 patch rejected");
    expect(message).toContain("One warning was intentional.");
    expect(message).toContain("**Versions**");
  });

  it("uses the singular for one patch", () => {
    expect(formatAiFixThread({ applied: [patch()] })).toContain(
      "Applied 1 patch:",
    );
  });

  it("explains why no patch was proposed", () => {
    const message = formatAiFixThread({
      applied: [],
      rejected: [{ reason: "The citation data is missing." }],
      notes: "Add the bibliography entry first.",
    });

    expect(message).toContain("No safe patch was proposed.");
    expect(message).toContain("The citation data is missing.");
    expect(message).toContain("Add the bibliography entry first.");
    expect(message).not.toContain("**Versions**");
  });

  it("records a request failure", () => {
    expect(
      formatAiFixThread({
        applied: [],
        failure: "Daily token limit exhausted",
      }),
    ).toContain("The repair failed: Daily token limit exhausted");
  });
});

describe("formatFixAllThread", () => {
  it("summarizes rounds and a clean result", () => {
    const message = formatFixAllThread({
      appliedTotal: 3,
      rounds: [
        "Round 1: 2 fixes applied, 1 issue left",
        "Round 2: 1 fix applied, 0 issues left",
      ],
      remaining: 0,
    });

    expect(message).toContain("**Compile repair**");
    expect(message).toContain("Applied 3 fixes in 2 rounds:");
    expect(message).toContain("- Round 1: 2 fixes applied, 1 issue left");
    expect(message).toContain("No prioritized issues remain.");
    expect(message).toContain("**Versions**");
  });

  it("lists the applied changes", () => {
    const message = formatFixAllThread({
      appliedTotal: 1,
      rounds: ["Round 1: 1 fix applied, 0 issues left"],
      remaining: 0,
      details: [
        "Added emergency stretch for overfull lines",
        "`document.tex:4` — Commented out the undefined command.",
      ],
    });

    expect(message).toContain("Changes:");
    expect(message).toContain("- Added emergency stretch for overfull lines");
    expect(message).toContain(
      "- `document.tex:4` — Commented out the undefined command.",
    );
  });

  it("names the remaining prioritized issues", () => {
    const message = formatFixAllThread({
      appliedTotal: 1,
      rounds: ["Round 1: 1 fix applied, 1 issue left"],
      remaining: 1,
    });

    expect(message).toContain("1 prioritized issue remains.");
  });

  it("reports no safe fix and the warning", () => {
    const message = formatFixAllThread({
      appliedTotal: 0,
      rounds: ["Round 1: no safe fix for the remaining issues"],
      remaining: 2,
      warning: "The model declined the citation warning.",
    });

    expect(message).toContain("No safe fix was found.");
    expect(message).toContain("The model declined the citation warning.");
    expect(message).not.toContain("**Versions**");
  });
});
