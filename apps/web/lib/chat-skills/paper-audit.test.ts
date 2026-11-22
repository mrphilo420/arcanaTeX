import { describe, expect, it } from "vitest";
import { getPaperAuditInvocation } from "@/lib/chat-skills/paper-audit";

describe("getPaperAuditInvocation", () => {
  it("triggers on /paper-review", () => {
    expect(getPaperAuditInvocation("/paper-review")).toEqual({
      focus: "",
      explicit: true,
    });
  });

  it("keeps the focus text", () => {
    expect(getPaperAuditInvocation("/paper-review equations appendix")).toEqual(
      {
        focus: "equations appendix",
        explicit: true,
      },
    );
  });

  it("recognises a natural technical review request", () => {
    expect(
      getPaperAuditInvocation("Please review my manuscript."),
    ).toMatchObject({ explicit: false });
    expect(
      getPaperAuditInvocation("Check the equations in the appendix"),
    ).toMatchObject({ explicit: false });
  });

  it("does not claim the peer-review command", () => {
    expect(getPaperAuditInvocation("/peer-review")).toBeNull();
    expect(getPaperAuditInvocation("fix my table")).toBeNull();
  });
});
