import { describe, expect, it } from "vitest";
import { ocrTextToLatex } from "@/lib/ocr";

describe("ocrTextToLatex", () => {
  it("returns an empty string for blank input", () => {
    expect(ocrTextToLatex("  \n \n")).toBe("");
  });

  it("escapes LaTeX special characters", () => {
    expect(ocrTextToLatex("50% of A & B cost $5 #1 a_b")).toBe(
      "50\\% of A \\& B cost \\$5 \\#1 a\\_b",
    );
    expect(ocrTextToLatex("{x}~y^z")).toBe(
      "\\{x\\}\\textasciitilde{}y\\textasciicircum{}z",
    );
  });

  it("escapes backslashes without double-escaping", () => {
    expect(ocrTextToLatex("a\\b")).toBe("a\\textbackslash{}b");
  });

  it("joins wrapped lines into paragraphs", () => {
    expect(ocrTextToLatex("one two\nthree four")).toBe("one two three four");
  });

  it("keeps blank lines as paragraph breaks", () => {
    expect(ocrTextToLatex("first\npara\n\n\n\nsecond")).toBe(
      "first para\n\nsecond",
    );
  });

  it("rejoins words hyphenated across line breaks", () => {
    expect(ocrTextToLatex("computa-\ntional cost")).toBe("computational cost");
  });

  it("converts typographic quotes and dashes", () => {
    expect(ocrTextToLatex("“hi” it’s a—b 1–2")).toBe("``hi'' it's a---b 1--2");
  });
});
