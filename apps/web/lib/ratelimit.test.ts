import type { Ratelimit } from "@upstash/ratelimit";
import { describe, expect, it, vi } from "vitest";
import { getIP, rateLimitResponse } from "@/lib/ratelimit";

const request = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api", { headers });

const limiterReturning = (result: object) =>
  ({ limit: vi.fn().mockResolvedValue(result) }) as unknown as Ratelimit & {
    limit: ReturnType<typeof vi.fn>;
  };

describe("getIP", () => {
  it("uses the first x-forwarded-for entry", () => {
    expect(getIP(request({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe(
      "1.2.3.4",
    );
  });

  it("falls back to localhost without the header", () => {
    expect(getIP(request())).toBe("127.0.0.1");
  });
});

describe("rateLimitResponse", () => {
  it("lets requests through when no limiter is configured", async () => {
    expect(await rateLimitResponse(null, request())).toBeNull();
  });

  it("lets requests through under the limit", async () => {
    const limiter = limiterReturning({
      success: true,
      limit: 20,
      remaining: 19,
      reset: 0,
    });
    expect(await rateLimitResponse(limiter, request())).toBeNull();
  });

  it("limits by the caller's IP", async () => {
    const limiter = limiterReturning({
      success: true,
      limit: 20,
      remaining: 19,
      reset: 0,
    });
    await rateLimitResponse(limiter, request({ "x-forwarded-for": "9.9.9.9" }));
    expect(limiter.limit).toHaveBeenCalledWith("9.9.9.9");
  });

  it("returns 429 with rate-limit headers when exceeded", async () => {
    const limiter = limiterReturning({
      success: false,
      limit: 20,
      remaining: 0,
      reset: 1234,
    });
    const response = await rateLimitResponse(limiter, request());

    expect(response?.status).toBe(429);
    expect(await response?.json()).toEqual({ error: "Too many requests" });
    expect(response?.headers.get("X-RateLimit-Limit")).toBe("20");
    expect(response?.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response?.headers.get("X-RateLimit-Reset")).toBe("1234");
  });
});
