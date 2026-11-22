import { describe, expect, it } from "vitest";
import {
  compactionTargetFor,
  describeCompactionEvent,
  parseChatErrorPayload,
} from "./client-compaction";

describe("parseChatErrorPayload", () => {
  it("reads the structured 413 body", () => {
    const error = new Error(
      JSON.stringify({
        error: "This message needs about 16050 tokens.",
        code: "context_budget_exceeded",
        limit: 5950,
        estimated: 16050,
        messageEstimated: 15000,
        messageId: "msg-1",
      }),
    );

    expect(parseChatErrorPayload(error)).toEqual({
      text: "This message needs about 16050 tokens.",
      code: "context_budget_exceeded",
      limit: 5950,
      estimated: 16050,
      messageEstimated: 15000,
      messageId: "msg-1",
    });
  });

  it("handles an Error: prefix", () => {
    const error = new Error(
      'Error: {"error":"Nope","code":"context_budget_exceeded"}',
    );
    expect(parseChatErrorPayload(error).text).toBe("Nope");
    expect(parseChatErrorPayload(error).code).toBe("context_budget_exceeded");
  });

  it("falls back to the raw message for plain text", () => {
    expect(parseChatErrorPayload(new Error("network down")).text).toBe(
      "network down",
    );
  });

  it("does not throw on a non-Error", () => {
    expect(parseChatErrorPayload("boom").text).toContain(
      "Check the model configuration",
    );
  });
});

describe("compactionTargetFor", () => {
  it("leaves room for the system prompt and tools", () => {
    // 16050 total, 15000 of it the message: 1050 is overhead.
    const target = compactionTargetFor(
      {
        text: "",
        limit: 5950,
        estimated: 16_050,
        messageEstimated: 15_000,
      },
      "x",
    );
    // 5950 - 1050 - 300 = 4600, and 80% of that is 3680.
    expect(target).toBe(3680);
  });

  it("caps the target so compaction stays bounded", () => {
    const target = compactionTargetFor(
      {
        text: "",
        limit: 100_000,
        estimated: 10_000,
        messageEstimated: 9_000,
      },
      "x",
    );
    expect(target).toBe(4000);
  });

  it("shrinks the target when overhead is large", () => {
    const target = compactionTargetFor(
      {
        text: "",
        limit: 5950,
        estimated: 9000,
        messageEstimated: 1000,
      },
      "x",
    );
    // 5950 - 8000 - 300 is negative, so there is no viable target.
    expect(target).toBeNull();
  });

  it("returns null without a limit", () => {
    expect(compactionTargetFor({ text: "", estimated: 100 }, "x")).toBeNull();
  });

  it("never returns less than 500", () => {
    const target = compactionTargetFor(
      {
        text: "",
        limit: 3000,
        estimated: 4500,
        messageEstimated: 2300,
      },
      "x",
    );
    // Overhead is 2200, leaving 500 after the 300-token margin.
    expect(target).toBe(500);
  });
});

describe("describeCompactionEvent", () => {
  it("names the part being compressed", () => {
    expect(
      describeCompactionEvent({
        type: "progress",
        stage: "compacting",
        index: 2,
        total: 3,
        pass: 1,
      }),
    ).toContain("part 2 of 3");
  });

  it("explains a rate-limit wait", () => {
    expect(
      describeCompactionEvent({
        type: "progress",
        stage: "waiting",
        seconds: 8,
        reason: "rate-limit",
      }),
    ).toContain("Waiting 8s");
  });
});
