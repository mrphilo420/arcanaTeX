import { describe, expect, it } from "vitest";
import {
  getHourglassInvocation,
  hourglassNeedsEdits,
} from "@/lib/chat-skills/hourglass";

describe("getHourglassInvocation", () => {
  it("defaults to diagnose for a bare command", () => {
    expect(getHourglassInvocation("/hourglass")).toEqual({
      mode: "diagnose",
      focus: "",
      explicit: true,
    });
  });

  it("parses a mode and focus", () => {
    expect(getHourglassInvocation("/hourglass draft introduction")).toEqual({
      mode: "draft",
      focus: "introduction",
      explicit: true,
    });
  });

  it("accepts the paper-write alias", () => {
    expect(
      getHourglassInvocation("/paper-write revise discussion"),
    ).toMatchObject({ mode: "revise", explicit: true });
  });

  it("recognises natural structure requests", () => {
    expect(
      getHourglassInvocation("Does this paper flow? Reverse outline it."),
    ).toMatchObject({ mode: "diagnose", explicit: false });
    expect(getHourglassInvocation("tighten my abstract")).toMatchObject({
      mode: "diagnose",
    });
  });

  it("does not trigger on an unrelated request", () => {
    expect(getHourglassInvocation("fix my table")).toBeNull();
    expect(getHourglassInvocation("/proofread")).toBeNull();
  });

  it("only draft and revise edit the manuscript", () => {
    expect(hourglassNeedsEdits("draft")).toBe(true);
    expect(hourglassNeedsEdits("revise")).toBe(true);
    expect(hourglassNeedsEdits("diagnose")).toBe(false);
    expect(hourglassNeedsEdits("review")).toBe(false);
    expect(hourglassNeedsEdits("outline")).toBe(false);
    expect(hourglassNeedsEdits("extract")).toBe(false);
  });
});
