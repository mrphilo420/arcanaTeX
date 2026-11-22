import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MergeChangesCardView,
  type MergeChangesCardViewProps,
} from "@/components/assistant-ui/merge-changes-card";
import type { MergeFileSummary } from "@/lib/ai/merge-summary";

const files: MergeFileSummary[] = [
  {
    fileId: "main",
    filePath: "main.tex",
    changes: [],
    kind: "modified",
    added: 12,
    removed: 3,
    firstLine: 2,
  },
  {
    fileId: "intro",
    filePath: "sections/intro.tex",
    changes: [],
    kind: "created",
    added: 40,
    removed: 0,
    firstLine: 1,
  },
];

function render(overrides: Partial<MergeChangesCardViewProps> = {}): string {
  return renderToString(
    createElement(MergeChangesCardView, {
      files,
      isReviewing: () => false,
      onUndoAll: () => {},
      onKeepAll: () => {},
      onReview: () => {},
      ...overrides,
    }),
  );
}

describe("MergeChangesCardView", () => {
  it("renders the summary and file rows", () => {
    const html = render().replace(/<!--.*?-->/g, "");

    expect(html).toContain("Merge Changes");
    expect(html).toContain("auto-applied");
    expect(html).toContain("Undo all");
    expect(html).toContain("Keep all");
    expect(html).toContain("main.tex:2");
    expect(html).toContain("sections/intro.tex:1");
    expect(html).toContain("modified");
    expect(html).toContain("created");
    expect(html).toContain("+12");
    expect(html).toContain("−3");
    expect(html).toContain("Review");
  });

  it("renders nothing without files", () => {
    expect(render({ files: [] })).toBe("");
  });
});
