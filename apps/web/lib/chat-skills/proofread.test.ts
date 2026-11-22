import { describe, expect, it } from "vitest";
import { getProofreadInvocation } from "@/lib/chat-skills/proofread";

describe("getProofreadInvocation", () => {
  it("ignores unrelated messages", () => {
    expect(getProofreadInvocation("fix my table")).toBeNull();
    expect(getProofreadInvocation("/paper-review")).toBeNull();
  });

  it("matches the explicit command with defaults", () => {
    expect(getProofreadInvocation("/proofread")).toEqual({
      scope: "document",
      focus: "",
      explicit: true,
    });
  });

  it("reads a scope keyword and keeps the rest as focus", () => {
    expect(getProofreadInvocation("/proofread selection tone")).toEqual({
      scope: "selection",
      focus: "tone",
      explicit: true,
    });
    expect(getProofreadInvocation("/proofread citations")).toMatchObject({
      scope: "citations",
    });
  });

  it("only treats the first word as a scope", () => {
    expect(getProofreadInvocation("/proofread tone selection")).toEqual({
      scope: "document",
      focus: "tone selection",
      explicit: true,
    });
  });

  it("matches natural-language requests", () => {
    for (const text of [
      "Please proofread my paper",
      "can you proof-read this section?",
      "check the grammar of the introduction",
    ]) {
      expect(getProofreadInvocation(text)).toMatchObject({ explicit: false });
    }
  });
});
