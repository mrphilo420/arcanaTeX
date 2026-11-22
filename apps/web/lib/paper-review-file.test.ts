import { describe, expect, it } from "vitest";
import { reviewFilePath } from "./paper-review-file";

describe("reviewFilePath", () => {
  const now = new Date(2026, 10, 4, 9, 5, 7);

  it("uses the local timestamp under paper-reviews", () => {
    expect(reviewFilePath([], now)).toBe(
      "paper-reviews/review-2026-11-04-090507.tex",
    );
  });

  it("adds a suffix when the path already exists", () => {
    expect(
      reviewFilePath(["paper-reviews/review-2026-11-04-090507.tex"], now),
    ).toBe("paper-reviews/review-2026-11-04-090507-2.tex");
  });

  it("keeps incrementing past several collisions", () => {
    expect(
      reviewFilePath(
        [
          "paper-reviews/review-2026-11-04-090507.tex",
          "paper-reviews/review-2026-11-04-090507-2.tex",
        ],
        now,
      ),
    ).toBe("paper-reviews/review-2026-11-04-090507-3.tex");
  });
});
