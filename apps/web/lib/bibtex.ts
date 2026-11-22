export type BibSeverity = "error" | "warning" | "info";

export interface BibField {
  name: string;
  value: string;
  line: number;
}

export interface BibEntry {
  type: string;
  key: string;
  fields: BibField[];
  raw: string;
  start: number;
  end: number;
  line: number;
}

export interface BibProblem {
  severity: BibSeverity;
  message: string;
  entryKey?: string;
  field?: string;
  line?: number;
}

export interface BibDocument {
  entries: BibEntry[];
  problems: BibProblem[];
}

const REQUIRED_FIELDS: Record<string, string[]> = {
  article: ["author", "title", "journal", "year"],
  book: ["title", "publisher", "year"],
  booklet: ["title"],
  inbook: ["author", "title", "chapter", "publisher", "year"],
  incollection: ["author", "title", "booktitle", "publisher", "year"],
  inproceedings: ["author", "title", "booktitle", "year"],
  conference: ["author", "title", "booktitle", "year"],
  manual: ["title"],
  mastersthesis: ["author", "title", "school", "year"],
  phdthesis: ["author", "title", "school", "year"],
  proceedings: ["title", "year"],
  techreport: ["author", "title", "institution", "year"],
  unpublished: ["author", "title", "note"],
  misc: [],
};

const MONTHS = new Set([
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
]);

const MONTH_NAMES: Record<string, string> = {
  january: "jan",
  february: "feb",
  march: "mar",
  april: "apr",
  may: "may",
  june: "jun",
  july: "jul",
  august: "aug",
  september: "sep",
  october: "oct",
  november: "nov",
  december: "dec",
};

const URL_FIELDS = new Set([
  "url",
  "doi",
  "eprint",
  "file",
  "howpublished",
  "urldate",
]);

function lineAt(content: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset && index < content.length; index += 1) {
    if (content[index] === "\n") line += 1;
  }
  return line;
}

/** Blanks `%` comments outside entry bodies while preserving offsets. */
function maskComments(content: string): string {
  const chars = content.split("");
  let depth = 0;
  let quote = false;

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === '"') {
      quote = !quote;
      continue;
    }
    if (quote) continue;
    if (char === "{") depth += 1;
    else if (char === "}") depth = Math.max(0, depth - 1);
    else if (char === "%" && depth === 0) {
      while (index < chars.length && chars[index] !== "\n") {
        chars[index] = " ";
        index += 1;
      }
    }
  }

  return chars.join("");
}

function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = false;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === '"') {
      quote = !quote;
      continue;
    }
    if (quote) continue;
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === separator && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function indexOfTopLevel(value: string, needle: string): number {
  let depth = 0;
  let quote = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === '"') {
      quote = !quote;
      continue;
    }
    if (quote) continue;
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === needle && depth === 0) return index;
  }
  return -1;
}

function stripOuter(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed.slice(1, -1).trim();
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function findEntryEnd(content: string, openIndex: number): number | null {
  const open = content[openIndex];
  const close = open === "{" ? "}" : open === "(" ? ")" : null;
  if (!close) return null;

  let depth = 1;
  let quote = false;
  for (let index = openIndex + 1; index < content.length; index += 1) {
    const char = content[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === '"') {
      quote = !quote;
      continue;
    }
    if (quote) continue;
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return null;
}

/**
 * A focused BibTeX parser: entries, keys, fields, comments and offsets. It is
 * deliberately tolerant; malformed structures become problems rather than
 * throwing, so the repair tool can report them without losing the file.
 */
export function parseBibtex(content: string): BibDocument {
  const masked = maskComments(content);
  const entries: BibEntry[] = [];
  const problems: BibProblem[] = [];
  let index = 0;

  while (index < masked.length) {
    const at = masked.indexOf("@", index);
    if (at === -1) break;

    const match = /^@\s*([A-Za-z]+)/.exec(masked.slice(at));
    if (!match) {
      index = at + 1;
      continue;
    }

    const type = match[1].toLowerCase();
    let openIndex = at + match[0].length;
    while (openIndex < masked.length && /\s/.test(masked[openIndex])) {
      openIndex += 1;
    }

    if (masked[openIndex] !== "{" && masked[openIndex] !== "(") {
      problems.push({
        severity: "error",
        message: `@${type} is missing its opening brace.`,
        line: lineAt(content, at),
      });
      index = openIndex;
      continue;
    }

    const end = findEntryEnd(masked, openIndex);
    if (end === null) {
      problems.push({
        severity: "error",
        message: `@${type} entry is not closed.`,
        line: lineAt(content, at),
      });
      break;
    }

    index = end;
    if (type === "comment" || type === "preamble" || type === "string") {
      continue;
    }

    const body = masked.slice(openIndex + 1, end - 1);
    const segments = splitTopLevel(body, ",");
    const key = (segments.shift() ?? "").trim();
    const line = lineAt(content, at);

    if (!key) {
      problems.push({
        severity: "error",
        message: `@${type} has no citation key.`,
        line,
      });
    }

    const fields: BibField[] = [];
    const seen = new Set<string>();
    let fieldOffset = openIndex + 1 + key.length;

    for (const segment of segments) {
      const trimmed = segment.trim();
      if (!trimmed) {
        fieldOffset += segment.length + 1;
        continue;
      }

      const equals = indexOfTopLevel(trimmed, "=");
      if (equals === -1) {
        problems.push({
          severity: "warning",
          message: `Unparseable field in @${type}{${key}}: ${trimmed.slice(0, 80)}`,
          entryKey: key || undefined,
          line: lineAt(content, fieldOffset),
        });
        fieldOffset += segment.length + 1;
        continue;
      }

      const name = trimmed.slice(0, equals).trim().toLowerCase();
      const value = stripOuter(trimmed.slice(equals + 1));
      const fieldLine = lineAt(content, fieldOffset);

      if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
        problems.push({
          severity: "warning",
          message: `Invalid field name "${name}" in @${type}{${key}}.`,
          entryKey: key || undefined,
          line: fieldLine,
        });
      } else if (seen.has(name)) {
        problems.push({
          severity: "warning",
          message: `Duplicate field "${name}" in @${type}{${key}}.`,
          entryKey: key || undefined,
          field: name,
          line: fieldLine,
        });
      } else {
        seen.add(name);
        fields.push({ name, value, line: fieldLine });
      }

      fieldOffset += segment.length + 1;
    }

    entries.push({
      type,
      key,
      fields,
      raw: content.slice(at, end),
      start: at,
      end,
      line,
    });
  }

  problems.push(...analyzeEntries(entries));
  return { entries, problems };
}

function analyzeEntries(entries: BibEntry[]): BibProblem[] {
  const problems: BibProblem[] = [];
  const keys = new Map<string, number>();

  for (const entry of entries) {
    const where = entry.key ? `@${entry.type}{${entry.key}}` : `@${entry.type}`;
    if (!REQUIRED_FIELDS[entry.type] && entry.type !== "misc") {
      problems.push({
        severity: "info",
        message: `Unknown entry type @${entry.type} in ${where}.`,
        entryKey: entry.key,
        line: entry.line,
      });
    }

    if (keys.has(entry.key)) {
      problems.push({
        severity: "warning",
        message: `Duplicate citation key "${entry.key}" (also on line ${keys.get(entry.key)}).`,
        entryKey: entry.key,
        line: entry.line,
      });
    } else if (entry.key) {
      keys.set(entry.key, entry.line);
    }

    if (/\s/.test(entry.key) || /[{}",#%]/.test(entry.key)) {
      problems.push({
        severity: "warning",
        message: `Citation key "${entry.key}" contains spaces or forbidden characters.`,
        entryKey: entry.key,
        line: entry.line,
      });
    }

    const fields = new Map(
      entry.fields.map((field) => [field.name, field.value] as const),
    );

    for (const name of REQUIRED_FIELDS[entry.type] ?? []) {
      const value = fields.get(name);
      if (!value || value.trim().length === 0) {
        problems.push({
          severity: "warning",
          message: `${where} is missing required field "${name}".`,
          entryKey: entry.key,
          field: name,
          line: entry.line,
        });
      }
    }

    if (
      entry.type === "book" &&
      !fields.has("author") &&
      !fields.has("editor")
    ) {
      problems.push({
        severity: "warning",
        message: `${where} needs an author or editor.`,
        entryKey: entry.key,
        line: entry.line,
      });
    }

    const year = fields.get("year");
    if (year && !/^\d{4}[a-z]?$/i.test(year.trim())) {
      problems.push({
        severity: "warning",
        message: `${where} has a non-standard year "${year}".`,
        entryKey: entry.key,
        field: "year",
        line: entry.line,
      });
    }

    const pages = fields.get("pages");
    if (pages && /[^-]--?[^-]/.test(pages) && !pages.includes("--")) {
      problems.push({
        severity: "info",
        message: `${where} uses a single hyphen in pages; use an en-dash "--".`,
        entryKey: entry.key,
        field: "pages",
        line: entry.line,
      });
    }

    const month = fields.get("month");
    if (month) {
      const normalized = month.trim().toLowerCase().replace(/[{}]/g, "");
      if (
        !MONTHS.has(normalized) &&
        !MONTH_NAMES[normalized] &&
        !/^\d{1,2}$/.test(normalized)
      ) {
        problems.push({
          severity: "info",
          message: `${where} has a non-standard month "${month}".`,
          entryKey: entry.key,
          field: "month",
          line: entry.line,
        });
      }
    }

    if (entry.type === "article" && fields.has("booktitle")) {
      problems.push({
        severity: "warning",
        message: `${where} is @article but uses booktitle; @inproceedings may be intended.`,
        entryKey: entry.key,
        line: entry.line,
      });
    }
    if (entry.type === "inproceedings" && fields.has("journal")) {
      problems.push({
        severity: "warning",
        message: `${where} is @inproceedings but uses journal; @article may be intended.`,
        entryKey: entry.key,
        line: entry.line,
      });
    }

    const doi = fields.get("doi");
    if (doi && /^https?:\/\/(?:dx\.)?doi\.org\//i.test(doi.trim())) {
      problems.push({
        severity: "info",
        message: `${where} has a URL in doi; the bare DOI is more portable.`,
        entryKey: entry.key,
        field: "doi",
        line: entry.line,
      });
    }

    for (const field of entry.fields) {
      if (URL_FIELDS.has(field.name)) continue;
      if (/(?<!\\)&/.test(field.value) || /(?<!\\)%/.test(field.value)) {
        problems.push({
          severity: "warning",
          message: `${where} has an unescaped "&" or "%" in "${field.name}".`,
          entryKey: entry.key,
          field: field.name,
          line: field.line,
        });
      }
    }
  }

  return problems;
}

function escapeBibValue(value: string, field: string): string {
  if (URL_FIELDS.has(field)) return value;
  return value.replace(/(?<!\\)&/g, "\\&").replace(/(?<!\\)%/g, "\\%");
}

function normalizePages(value: string): string {
  return value
    .replace(/[–—]/g, "--")
    .replace(/\s*-\s*/g, "--")
    .replace(/-{3,}/g, "--")
    .replace(/\s*--\s*/g, "--");
}

function normalizeMonth(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[{}"]/g, "");
  if (MONTHS.has(normalized)) return normalized;
  const full = MONTH_NAMES[normalized];
  if (full) return full;
  const numeric = Number.parseInt(normalized, 10);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) {
    return [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ][numeric - 1];
  }
  return value.trim();
}

function buildEntry(entry: BibEntry): string {
  const fields: Array<{ name: string; value: string }> = [];
  const seen = new Set<string>();

  for (const field of entry.fields) {
    if (seen.has(field.name)) continue;
    seen.add(field.name);

    let value = field.value.replace(/\s+/g, " ").trim();
    if (!value) continue;

    if (field.name === "pages") value = normalizePages(value);
    if (field.name === "month") value = normalizeMonth(value);
    if (field.name === "doi") {
      value = value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim();
    }
    value = escapeBibValue(value, field.name);
    fields.push({ name: field.name, value });
  }

  const lines = fields.map((field) =>
    field.name === "month" && MONTHS.has(field.value)
      ? `  ${field.name} = ${field.value}`
      : `  ${field.name} = {${field.value}}`,
  );

  return `@${entry.type}{${entry.key}${
    lines.length > 0 ? `,\n${lines.join(",\n")}` : ""
  }\n}`;
}

/**
 * Normalizes syntax and mechanical field mistakes in place while preserving
 * comments, @string blocks, and everything outside the entries. Returns the
 * original file untouched when a structural error would make rewriting risky.
 */
export function normalizeBibtex(content: string): {
  content: string;
  changed: boolean;
  entries: BibEntry[];
  problems: BibProblem[];
} {
  const parsed = parseBibtex(content);
  const structural = parsed.problems.some(
    (problem) => problem.severity === "error",
  );
  if (structural) {
    return {
      content,
      changed: false,
      entries: parsed.entries,
      problems: parsed.problems,
    };
  }

  const replacements = parsed.entries
    .map((entry) => ({
      start: entry.start,
      end: entry.end,
      text: buildEntry(entry),
    }))
    .filter((replacement) => {
      const entry = parsed.entries.find(
        (candidate) => candidate.start === replacement.start,
      );
      return entry ? entry.raw !== replacement.text : false;
    });

  if (replacements.length === 0) {
    return {
      content,
      changed: false,
      entries: parsed.entries,
      problems: parsed.problems,
    };
  }

  let next = content;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    next =
      next.slice(0, replacement.start) +
      replacement.text +
      next.slice(replacement.end);
  }

  const normalizedDocument = parseBibtex(next);
  return {
    content: next,
    changed: true,
    entries: normalizedDocument.entries,
    problems: normalizedDocument.problems,
  };
}

/**
 * Applies explicit field changes to one entry. Used by the repair tool after
 * the model has checked the source; unknown keys are rejected rather than
 * silently creating a new entry.
 */
export function applyBibEntryChanges(
  content: string,
  entryKey: string,
  set: Record<string, string> = {},
  remove: string[] = [],
): { ok: true; content: string } | { ok: false; reason: string } {
  const parsed = parseBibtex(content);
  const entry = parsed.entries.find((candidate) => candidate.key === entryKey);
  if (!entry)
    return { ok: false, reason: `Entry "${entryKey}" was not found.` };

  const fields = new Map(
    entry.fields.map((field) => [field.name, field.value] as const),
  );
  for (const [name, value] of Object.entries(set)) {
    const normalized = name.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_-]*$/.test(normalized)) {
      return { ok: false, reason: `Invalid field name "${name}".` };
    }
    if (!value.trim()) fields.delete(normalized);
    else fields.set(normalized, value.trim());
  }
  for (const name of remove) {
    fields.delete(name.trim().toLowerCase());
  }

  const changed = buildEntry({
    ...entry,
    fields: [...fields.entries()].map(([name, value]) => ({
      name,
      value,
      line: entry.line,
    })),
  });

  return {
    ok: true,
    content: content.slice(0, entry.start) + changed + content.slice(entry.end),
  };
}

export function formatBibtexProblems(problems: BibProblem[]): string {
  if (problems.length === 0) return "No BibTeX problems found.";
  return problems
    .map(
      (problem) =>
        `${problem.severity.toUpperCase()}${problem.line ? `:${problem.line}` : ""}${
          problem.entryKey ? ` ${problem.entryKey}` : ""
        }${problem.field ? `.${problem.field}` : ""}: ${problem.message}`,
    )
    .join("\n");
}
