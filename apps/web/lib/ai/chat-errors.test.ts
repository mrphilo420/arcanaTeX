import { describe, expect, it } from "vitest";
import { chatErrorMessage, providerErrorDetail } from "@/lib/ai/chat-errors";

describe("providerErrorDetail", () => {
  it("reads an OpenAI-style JSON error body", () => {
    expect(
      providerErrorDetail({
        responseBody:
          '{"error":{"type":"server_error","message":"Insufficient account funds"}}',
      }),
    ).toBe("Insufficient account funds");
  });

  it("reads an object response body and collapses whitespace", () => {
    expect(
      providerErrorDetail({
        responseBody: { error: { message: "  Upstream   failed " } },
      }),
    ).toBe("Upstream failed");
  });

  it("falls back to the error message", () => {
    expect(providerErrorDetail(new Error("network down"))).toBe("network down");
  });
});

describe("chatErrorMessage", () => {
  it("explains insufficient funds with the provider detail", () => {
    const message = chatErrorMessage({
      statusCode: 402,
      responseBody:
        '{"error":{"type":"server_error","message":"Insufficient account funds"}}',
    });
    expect(message).toContain("insufficient account funds");
    expect(message).toContain("Insufficient account funds");
    expect(message).toContain("choose another model");
  });

  it("explains auth, access, and rate-limit failures", () => {
    expect(chatErrorMessage({ statusCode: 401 })).toContain("API key");
    expect(chatErrorMessage({ statusCode: 403 })).toContain(
      "Free OpenCode models",
    );
    expect(chatErrorMessage({ statusCode: 429 })).toContain("rate-limiting");
  });

  it("includes the provider detail for other HTTP errors", () => {
    expect(
      chatErrorMessage({
        statusCode: 500,
        responseBody: "upstream unavailable",
      }),
    ).toBe("Provider error (500): upstream unavailable");
  });

  it("falls back to the generic message without a status", () => {
    expect(chatErrorMessage(new Error("boom"))).toContain(
      "Chat failed while contacting the model",
    );
  });
});

describe("billing and quota presentation", () => {
  it("names a depleted provider balance instead of a generic failure", () => {
    const message = chatErrorMessage({
      statusCode: 429,
      responseBody: JSON.stringify({
        error: {
          message:
            "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.",
        },
      }),
    });

    expect(message).toContain("cannot pay for this request");
    expect(message).toContain("Add credits");
    expect(message).not.toContain("Chat failed while contacting the model");
  });

  it("names an exhausted quota", () => {
    const message = chatErrorMessage({
      statusCode: 429,
      responseBody: JSON.stringify({
        error: { message: "You exceeded your current quota" },
      }),
    });

    expect(message).toContain("cannot pay for this request");
  });

  it("names an exhausted daily token limit", () => {
    const message = chatErrorMessage({
      statusCode: 429,
      responseBody: JSON.stringify({
        error: {
          message:
            "Rate limit reached for model `openai/gpt-oss-20b` on tokens per day (TPD): Limit 200000, Used 199737, Requested 4431. Please try again in 30m0.576s.",
        },
      }),
    });

    expect(message).toContain("daily token limit");
    expect(message).toContain("TPD");
    expect(message).toContain("Try again in 30m");
    expect(message).not.toContain("rate-limiting");
  });

  it("names an output-token-per-minute ceiling", () => {
    const message = chatErrorMessage({
      statusCode: 400,
      responseBody: JSON.stringify({
        error: {
          message:
            "Request too large for model `qwen/qwen3.8-27b` on output tokens per minute (OTPM): Limit 1000, Requested 2048.",
        },
      }),
    });

    expect(message).toContain("fewer output tokens per minute");
    expect(message).toContain("lowers the output budget");
    expect(message).not.toContain("Chat failed");
  });

  it("points at the key when the key is rejected", () => {
    const message = chatErrorMessage({
      statusCode: 401,
      responseBody: JSON.stringify({
        error: { message: "Incorrect API key provided" },
      }),
    });

    expect(message.toLowerCase()).toContain("api key");
  });
});
