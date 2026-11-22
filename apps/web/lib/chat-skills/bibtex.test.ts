import { describe, expect, it } from "vitest";
import { getBibtexInvocation } from "@/lib/chat-skills/bibtex";

describe("getBibtexInvocation", () => {
  it("fixes by default", () => {
    expect(getBibtexInvocation("/bibtex")).toEqual({
      mode: "fix",
      focus: "",
      explicit: true,
    });
  });

  it("supports report mode and a focus", () => {
    expect(getBibtexInvocation("/bibtex report equations")).toEqual({
      mode: "report",
      focus: "equations",
      explicit: true,
    });
  });

  it("recognises natural bibliography requests", () => {
    expect(getBibtexInvocation("Fix my bibliography")).toMatchObject({
      mode: "fix",
      explicit: false,
    });
    expect(getBibtexInvocation("Clean up the .bib file")).toMatchObject({
      mode: "fix",
    });
  });

  it("does not trigger on unrelated edits", () => {
    expect(getBibtexInvocation("fix my table")).toBeNull();
    expect(getBibtexInvocation("/peer-review")).toBeNull();
  });
});
