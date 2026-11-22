import { describe, expect, it } from "vitest";
import { toApiResources } from "@/lib/compile-resources";

describe("toApiResources", () => {
  it("keeps empty text files so \\input of a placeholder works", () => {
    expect(toApiResources([{ path: "empty.tex", content: "" }])).toEqual([
      { path: "empty.tex", content: "" },
    ]);
  });

  it("passes text content and the main flag through", () => {
    expect(
      toApiResources([{ path: "main.tex", content: "hi", main: true }]),
    ).toEqual([{ path: "main.tex", content: "hi", main: true }]);
  });

  it("strips whitespace from base64 files", () => {
    expect(toApiResources([{ path: "a.png", file: "AB\nCD E" }])).toEqual([
      { path: "a.png", file: "ABCDE" },
    ]);
  });

  it("treats base64 image data sent as content as a file", () => {
    expect(toApiResources([{ path: "a.jpg", content: "/9j/AB\nCD" }])).toEqual([
      { path: "a.jpg", file: "/9j/ABCD" },
    ]);
    expect(toApiResources([{ path: "a.png", content: "iVBORw0K" }])).toEqual([
      { path: "a.png", file: "iVBORw0K" },
    ]);
  });

  it("omits content when none was provided", () => {
    expect(toApiResources([{ path: "x.bin" }])).toEqual([{ path: "x.bin" }]);
  });
});
