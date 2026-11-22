import { describe, expect, it } from "vitest";
import { closeRunawayArgument } from "@/lib/latex-braces";

const file = (content: string, id = "main") => ({ id, content });

const AFFIL_PREVIEW =
  "{\\orgdiv {Mathematics Department, College of Science}, \\orgname {Bula";

const BROKEN_AFFIL =
  "\\affil*[1]{\\orgdiv{Mathematics Department, College of Science}, \\orgname{Bulacan State University}, \\orgaddress{\\city{Malolos}, \\country{Philippines}}";

const doc = (affil: string, rest = "\\abstract{Short.}\n\n\\maketitle\n") =>
  `\\begin{document}\n\n${affil}\n\n${rest}\\end{document}\n`;

describe("closeRunawayArgument", () => {
  it("closes a one-line argument that is missing its final brace", () => {
    const result = closeRunawayArgument(
      [file(doc(BROKEN_AFFIL))],
      AFFIL_PREVIEW,
    );

    expect(result).toMatchObject({ ok: true, fileId: "main", line: 3 });
    if (!result.ok) return;
    expect(result.content).toContain(
      "\\country{Philippines}}}% Auto-fix: closed unmatched {",
    );
  });

  it("changes nothing outside the one inserted span", () => {
    const original = doc(BROKEN_AFFIL);
    const result = closeRunawayArgument([file(original)], AFFIL_PREVIEW);
    if (!result.ok) throw new Error(result.reason);

    const inserted = "}% Auto-fix: closed unmatched {";
    expect(result.content.replace(inserted, "")).toBe(original);
  });

  it("inserts before an existing trailing comment without a second marker", () => {
    const result = closeRunawayArgument(
      [file(doc(`${BROKEN_AFFIL} % corresponding author`))],
      AFFIL_PREVIEW,
    );
    if (!result.ok) throw new Error(result.reason);

    expect(result.content).toContain(
      "\\country{Philippines}}} % corresponding author",
    );
    expect(result.content).not.toContain("Auto-fix");
  });

  it("ignores braces inside comments and escaped braces when counting", () => {
    const line = "\\affil*{a \\{ b {c} % } }";
    const result = closeRunawayArgument([file(doc(line))], "{a\\{b{c}");

    expect(result.ok).toBe(true);
  });

  it("preserves CRLF line endings", () => {
    const text = doc(BROKEN_AFFIL).replace(/\n/g, "\r\n");
    const result = closeRunawayArgument([file(text)], AFFIL_PREVIEW);
    if (!result.ok) throw new Error(result.reason);

    expect(result.content.replace(/\r\n/g, "")).not.toContain("\n");
    expect(result.content.split("\r\n")).toHaveLength(
      text.split("\r\n").length,
    );
  });

  it("is idempotent: a fixed file needs no further repair", () => {
    const first = closeRunawayArgument(
      [file(doc(BROKEN_AFFIL))],
      AFFIL_PREVIEW,
    );
    if (!first.ok) throw new Error(first.reason);

    const second = closeRunawayArgument([file(first.content)], AFFIL_PREVIEW);
    expect(second.ok).toBe(false);
  });

  it("refuses when the argument may continue on the next line", () => {
    const text = doc(`${BROKEN_AFFIL}\n, \\orgname{Other}`);
    const result = closeRunawayArgument([file(text)], AFFIL_PREVIEW);

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toMatch(/ambiguous|several lines/i);
  });

  it("refuses when more than one brace is missing", () => {
    const result = closeRunawayArgument(
      [file(doc(`${BROKEN_AFFIL.slice(0, -1)}`))],
      AFFIL_PREVIEW,
    );

    expect(result.ok).toBe(false);
  });

  it("refuses when the preview matches more than once", () => {
    const text = `${doc(BROKEN_AFFIL)}\n${doc(BROKEN_AFFIL)}`;
    const result = closeRunawayArgument([file(text)], AFFIL_PREVIEW);

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toMatch(/more than one|ambiguous/i);
  });

  it("refuses when the preview cannot be found", () => {
    const result = closeRunawayArgument(
      [file(doc("\\affil{ok}"))],
      AFFIL_PREVIEW,
    );

    expect(result).toMatchObject({ ok: false });
  });

  it("refuses a preview that does not start at an opening brace", () => {
    const result = closeRunawayArgument(
      [file(doc(BROKEN_AFFIL))],
      "\\orgdiv {Mathematics Department, College",
    );

    expect(result.ok).toBe(false);
  });

  it("refuses very short previews that could match anywhere", () => {
    expect(closeRunawayArgument([file(doc("\\a{x"))], "{x").ok).toBe(false);
  });

  it("leaves files with verbatim content for review", () => {
    const text = `${doc(BROKEN_AFFIL)}\\begin{verbatim}\n{\n\\end{verbatim}\n`;
    const result = closeRunawayArgument([file(text)], AFFIL_PREVIEW);

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toMatch(/verbatim|review/i);
  });

  it("finds the anchor in whichever project file contains it", () => {
    const result = closeRunawayArgument(
      [file("\\documentclass{article}\n", "a"), file(doc(BROKEN_AFFIL), "b")],
      AFFIL_PREVIEW,
    );

    expect(result).toMatchObject({ ok: true, fileId: "b" });
  });
});
