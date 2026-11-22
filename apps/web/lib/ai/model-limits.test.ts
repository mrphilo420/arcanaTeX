import { beforeEach, describe, expect, it } from "vitest";
import {
  getKnownLimit,
  getKnownOutputLimit,
  recordLimitFromError,
  recordLimitFromHeaders,
  resetKnownLimits,
  setKnownLimit,
} from "./model-limits";

beforeEach(() => {
  resetKnownLimits();
});

describe("recordLimitFromError", () => {
  it("learns Groq's ITPM ceiling", () => {
    const message =
      "Request too large for model `qwen/qwen3.8-27b` in organization `org_x` service tier `on_demand` on input tokens per minute (ITPM): Limit 7000, Requested 7022";
    expect(recordLimitFromError("qwen", message)).toBe(7000);
    expect(getKnownLimit("qwen")?.tokens).toBe(7000);
    expect(getKnownLimit("qwen")?.source).toBe("error");
  });

  it("learns a TPM ceiling", () => {
    expect(
      recordLimitFromError(
        "gpt-oss",
        "Rate limit reached ... on tokens per minute (TPM): Limit 8000, Used 6063",
      ),
    ).toBe(8000);
  });

  it("learns an output-token ceiling without claiming the input budget", () => {
    const message =
      "Request too large for model `qwen/qwen3.8-27b` in organization `org_x` service tier `on_demand` on output tokens per minute (OTPM): Limit 1000, Requested 2048.";

    expect(recordLimitFromError("qwen", message)).toBe(1000);
    expect(getKnownOutputLimit("qwen")?.tokens).toBe(1000);
    expect(getKnownOutputLimit("qwen")?.kind).toBe("output");
    expect(getKnownLimit("qwen")).toBeNull();
  });

  it("returns null when no limit is stated", () => {
    expect(recordLimitFromError("m", "You have no credits remaining.")).toBe(
      null,
    );
  });
});

describe("recordLimitFromHeaders", () => {
  it("reads a Headers instance", () => {
    recordLimitFromHeaders(
      "m",
      new Headers({ "x-ratelimit-limit-tokens": "12000" }),
    );
    expect(getKnownLimit("m")?.tokens).toBe(12000);
    expect(getKnownLimit("m")?.source).toBe("header");
  });

  it("reads an output-token header separately", () => {
    recordLimitFromHeaders(
      "m",
      new Headers({ "x-ratelimit-limit-output-tokens": "1000" }),
    );
    expect(getKnownOutputLimit("m")?.tokens).toBe(1000);
    expect(getKnownLimit("m")).toBeNull();
  });

  it("reads a plain object and ignores junk", () => {
    recordLimitFromHeaders("m", { "X-RateLimit-Limit-Tokens": "n/a" });
    expect(getKnownLimit("m")).toBeNull();
  });

  it("does not let a stale error override a header", () => {
    recordLimitFromHeaders("m", { "x-ratelimit-limit-tokens": "30000" });
    recordLimitFromError("m", "Limit 7000");
    expect(getKnownLimit("m")?.tokens).toBe(30000);
    expect(getKnownLimit("m")?.source).toBe("header");
  });
});

describe("setKnownLimit", () => {
  it("ignores non-positive values", () => {
    setKnownLimit("m", 0, "declared");
    setKnownLimit("m", Number.NaN, "declared");
    expect(getKnownLimit("m")).toBeNull();
  });

  it("stores output limits independently", () => {
    setKnownLimit("m", 900, "declared", "output");
    expect(getKnownOutputLimit("m")?.tokens).toBe(900);
    expect(getKnownOutputLimit("m")?.kind).toBe("output");
    expect(getKnownLimit("m")).toBeNull();
  });
});
