import { describe, expect, it } from "vitest";
import { describeUpstreamFailure } from "@/lib/compile-errors";

describe("describeUpstreamFailure", () => {
  it("explains an oversized project on 413", () => {
    expect(
      describeUpstreamFailure(413, "text/plain", "Payload Too Large"),
    ).toMatch(/too large.*50 MB/i);
  });

  it("explains a busy compile service on 503", () => {
    expect(
      describeUpstreamFailure(
        503,
        "application/json",
        JSON.stringify({ error: "Server busy, try again later" }),
      ),
    ).toMatch(/busy/i);
  });

  it("surfaces the service's own JSON error", () => {
    expect(
      describeUpstreamFailure(
        500,
        "application/json",
        JSON.stringify({ error: "Compilation timed out" }),
      ),
    ).toBe("Compilation timed out");
  });

  it("includes status and text for unknown non-JSON failures", () => {
    expect(describeUpstreamFailure(502, "text/html", "Bad Gateway")).toBe(
      "Compile service returned 502: Bad Gateway",
    );
  });

  it("truncates long non-JSON bodies", () => {
    const message = describeUpstreamFailure(500, "text/html", "x".repeat(1000));
    expect(message.length).toBeLessThan(250);
  });

  it("falls back when the body is empty", () => {
    expect(describeUpstreamFailure(500, "text/plain", "")).toBe(
      "Compile service returned 500",
    );
  });

  it("tolerates malformed JSON", () => {
    expect(describeUpstreamFailure(500, "application/json", "{oops")).toBe(
      "Compile service returned 500: {oops",
    );
  });
});
