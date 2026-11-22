import { describe, expect, it } from "vitest";
import {
  enclosingGroups,
  locateContextOffset,
  maskComments,
  openEnvironments,
} from "@/lib/latex-active";

describe("maskComments", () => {
  it("blanks comments but keeps length and escaped percent signs", () => {
    const text = "a 50\\% b % hidden {\nnext";
    const masked = maskComments(text);

    expect(masked).toHaveLength(text.length);
    expect(masked).toContain("50\\% b");
    expect(masked).not.toContain("hidden");
    expect(masked).toContain("\nnext");
  });
});

describe("locateContextOffset", () => {
  const content = "first\n  The file my_name is here\nlast\n";

  it("returns the offset just past the printed context", () => {
    const offset = locateContextOffset(content, 2, "The file my_");

    expect(offset).not.toBeNull();
    expect(content.slice(0, offset ?? 0).endsWith("my_")).toBe(true);
  });

  it("refuses when the source line does not start with the context", () => {
    expect(locateContextOffset(content, 2, "Another my_")).toBeNull();
  });

  it("refuses truncated context and out-of-range lines", () => {
    expect(locateContextOffset(content, 2, "...le my_")).toBeNull();
    expect(locateContextOffset(content, 99, "x")).toBeNull();
  });

  it("refuses context long enough that MiKTeX may have wrapped it", () => {
    const long = "word ".repeat(20);
    expect(locateContextOffset(`${long}x\n`, 1, `${long}x`.trim())).toBeNull();
  });

  it("handles CRLF files", () => {
    const crlf = "a\r\nhello_\r\n";
    expect(locateContextOffset(crlf, 2, "hello_")).toBe(crlf.indexOf("_") + 1);
  });
});

describe("openEnvironments", () => {
  it("returns the environments open at an offset, innermost last", () => {
    const text =
      "\\begin{document}\n\\begin{tabular}{ll}\na & b\n\\end{tabular}\n\\begin{itemize}\nx";
    expect(openEnvironments(maskComments(text), text.length)).toEqual([
      "document",
      "itemize",
    ]);
  });

  it("ignores begin/end inside comments", () => {
    const text = "\\begin{document}\n% \\begin{tabular}\nx";
    expect(openEnvironments(maskComments(text), text.length)).toEqual([
      "document",
    ]);
  });
});

describe("enclosingGroups", () => {
  it("lists the text before each open brace around an offset", () => {
    const text = "see \\texttt{my_file} and {other";
    const inside = text.indexOf("_");
    const groups = enclosingGroups(maskComments(text), inside);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatch(/\\texttt$/);
  });

  it("returns nothing outside every group and skips escaped braces", () => {
    const text = "\\{ plain \\} text";
    expect(enclosingGroups(maskComments(text), text.length)).toEqual([]);
  });
});
