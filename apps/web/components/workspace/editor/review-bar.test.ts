import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewBar, type ReviewBarProps } from "./review-bar";

function render(overrides: Partial<ReviewBarProps> = {}): string {
  return renderToString(
    createElement(ReviewBar, {
      current: 1,
      total: 2,
      onPrevious: () => {},
      onNext: () => {},
      onAccept: () => {},
      onReject: () => {},
      onClose: () => {},
      ...overrides,
    }),
  ).replace(/<!--.*?-->/g, "");
}

describe("ReviewBar", () => {
  it("shows the current chunk and the review actions", () => {
    const html = render();

    expect(html).toContain("Review");
    expect(html).toContain("1 / 2");
    expect(html).toContain("Reject");
    expect(html).toContain("Accept");
    expect(html).toContain("Exit");
  });

  it("disables chunk actions when there is no change", () => {
    const html = render({ current: 0, total: 0 });

    expect(html).toContain("—");
    expect(html).toContain('disabled=""');
  });
});
