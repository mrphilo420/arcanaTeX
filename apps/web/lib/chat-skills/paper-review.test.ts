import { describe, expect, it } from "vitest";
import { getPeerReviewInvocation } from "@/lib/chat-skills/paper-review";

describe("getPeerReviewInvocation", () => {
  it("defaults to a full panel review", () => {
    expect(getPeerReviewInvocation("/peer-review")).toEqual({
      mode: "full",
      focus: "",
      explicit: true,
    });
  });

  it("parses a mode and focus", () => {
    expect(getPeerReviewInvocation("/peer-review quick novelty")).toEqual({
      mode: "quick",
      focus: "novelty",
      explicit: true,
    });
  });

  it("recognises a referee report request", () => {
    expect(
      getPeerReviewInvocation("Write a referee report for this paper"),
    ).toMatchObject({ explicit: false });
  });

  it("leaves the technical audit command to /paper-review", () => {
    expect(getPeerReviewInvocation("/paper-review")).toBeNull();
  });
});
