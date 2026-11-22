import { describe, expect, it } from "vitest";
import {
  applyBibEntryChanges,
  formatBibtexProblems,
  normalizeBibtex,
  parseBibtex,
} from "./bibtex";

const ARTICLE = `@article{smith2020,
  author = {Smith, John and Doe, Jane},
  title = {A {Nested} Title},
  journal = {Journal of Tests},
  year = {2020},
  pages = {1--10},
}`;

describe("parseBibtex", () => {
  it("parses entries, keys, and nested braces", () => {
    const parsed = parseBibtex(ARTICLE);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toMatchObject({
      type: "article",
      key: "smith2020",
    });
    expect(
      parsed.entries[0].fields.find((field) => field.name === "title")?.value,
    ).toBe("A {Nested} Title");
    expect(parsed.problems).toEqual([]);
  });

  it("parses quoted and bare values", () => {
    const parsed = parseBibtex(
      `@inproceedings{k, title = "Quoted", year = 2021, month = jan}`,
    );

    expect(parsed.entries[0].fields).toMatchObject([
      { name: "title", value: "Quoted" },
      { name: "year", value: "2021" },
      { name: "month", value: "jan" },
    ]);
  });

  it("reports an unclosed entry as a structural error", () => {
    const parsed = parseBibtex("@article{broken, title = {Missing close}");

    expect(parsed.entries).toEqual([]);
    expect(parsed.problems[0].severity).toBe("error");
  });

  it("reports duplicate keys and missing required fields", () => {
    const parsed = parseBibtex(`
@article{same, title = {One}}
@article{same, title = {Two}}
`);

    const messages = parsed.problems
      .map((problem) => problem.message)
      .join("\n");
    expect(messages).toContain('Duplicate citation key "same"');
    expect(messages).toContain('missing required field "author"');
    expect(messages).toContain('missing required field "journal"');
  });
});

describe("normalizeBibtex", () => {
  it("normalizes fields and mechanical mistakes", () => {
    const result = normalizeBibtex(`@ARTICLE{ key ,
  title = "A & B" ,
  year = 2020,
  month = {January},
  pages = {1 - 10},
  doi = {https://doi.org/10.1234/x},
  empty = {},
}`);

    expect(result.changed).toBe(true);
    expect(result.content).toContain("@article{key,");
    expect(result.content).toContain("title = {A \\& B}");
    expect(result.content).toContain("year = {2020}");
    expect(result.content).toContain("month = jan");
    expect(result.content).toContain("pages = {1--10}");
    expect(result.content).toContain("doi = {10.1234/x}");
    expect(result.content).not.toContain("empty");
  });

  it("preserves comments and @string blocks", () => {
    const input = `% top comment
@string{foo = "Bar"}

@article{a,
  author = {A},
  title = {T},
  journal = {J},
  year = {2020},
}

% trailing comment
`;
    const result = normalizeBibtex(input);

    expect(result.content).toContain("% top comment");
    expect(result.content).toContain('@string{foo = "Bar"}');
    expect(result.content).toContain("% trailing comment");
  });

  it("leaves a structurally broken file untouched", () => {
    const input = "@article{broken, title = {Missing close}";
    const result = normalizeBibtex(input);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(input);
    expect(
      result.problems.some((problem) => problem.severity === "error"),
    ).toBe(true);
  });

  it("reports duplicate and missing required fields", () => {
    const result = normalizeBibtex(
      `@article{a, title = {One}, title = {Two}, year = {2020}, journal = {J}}`,
    );

    const messages = formatBibtexProblems(result.problems);
    expect(messages).toContain('missing required field "author"');
    expect(messages).not.toContain('Duplicate field "title"');
    expect(result.content).not.toContain("title = {Two}");
  });
});

describe("applyBibEntryChanges", () => {
  it("sets and removes fields on one entry", () => {
    const result = applyBibEntryChanges(
      ARTICLE,
      "smith2020",
      { note: "A note", pages: "10--20" },
      ["journal"],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain("note = {A note}");
    expect(result.content).toContain("pages = {10--20}");
    expect(result.content).not.toContain("journal =");
    expect(result.content).toContain("author = {Smith, John and Doe, Jane}");
  });

  it("rejects an unknown entry", () => {
    const result = applyBibEntryChanges(ARTICLE, "missing", { title: "X" });

    expect(result).toMatchObject({ ok: false });
  });
});
