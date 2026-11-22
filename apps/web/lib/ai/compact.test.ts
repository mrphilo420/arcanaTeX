import { describe, expect, it } from "vitest";
import { splitForCompaction } from "./compact";

describe("splitForCompaction", () => {
  it("returns a short message unchanged", () => {
    expect(splitForCompaction("short message", 1000)).toEqual([
      "short message",
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(splitForCompaction("", 1000)).toEqual([]);
  });

  it("splits on paragraph boundaries and respects the limit", () => {
    const paragraphs = Array.from(
      { length: 20 },
      (_, i) => `Paragraph ${i} ${"x".repeat(80)}`,
    );
    const text = paragraphs.join("\n\n");
    const chunks = splitForCompaction(text, 300);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(300);
  });

  it("keeps every paragraph", () => {
    const paragraphs = Array.from(
      { length: 12 },
      (_, i) => `Unique-${i} ${"y".repeat(50)}`,
    );
    const chunks = splitForCompaction(paragraphs.join("\n\n"), 200);
    const joined = chunks.join(" ");

    for (let i = 0; i < paragraphs.length; i += 1) {
      expect(joined).toContain(`Unique-${i}`);
    }
  });

  it("hard-splits a single oversized line", () => {
    const chunks = splitForCompaction("z".repeat(1000), 300);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(300);
    expect(chunks.join("").length).toBe(1000);
  });

  it("never emits empty chunks", () => {
    const chunks = splitForCompaction("a\n\n\n\nb", 200);
    expect(chunks.every((chunk) => chunk.length > 0)).toBe(true);
  });
});
