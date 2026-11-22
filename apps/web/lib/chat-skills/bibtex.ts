export type BibtexMode = "fix" | "report";

export interface BibtexInvocation {
  mode: BibtexMode;
  focus: string;
  explicit: boolean;
}

const NATURAL_BIBTEX_PATTERN =
  /\b(?:fix|correct|clean(?:\s*up)?|repair|patch|check)\b.{0,40}(?:\bbibtex\b|\bbibliography\b|\.bib\b)|\bbibtex\s+(?:errors?|cleanup|repair|check)\b/i;

export function getBibtexInvocation(text: string): BibtexInvocation | null {
  const command = text.match(/\/bibtex\b([^\n]*)/i);
  const explicit = Boolean(command);
  if (!explicit && !NATURAL_BIBTEX_PATTERN.test(text)) return null;

  const words = (command?.[1] ?? "").trim().split(/\s+/).filter(Boolean);
  let mode: BibtexMode = "fix";
  const focus: string[] = [];

  for (const word of words) {
    const normalized = word.toLowerCase();
    if (
      normalized === "report" ||
      normalized === "check" ||
      normalized === "inspect"
    ) {
      mode = "report";
    } else if (
      normalized === "fix" ||
      normalized === "repair" ||
      normalized === "clean" ||
      normalized === "cleanup"
    ) {
      mode = "fix";
    } else {
      focus.push(word);
    }
  }

  return { mode, focus: focus.join(" "), explicit };
}

/**
 * Embedded BibTeX repair skill. Mechanical corrections are deterministic; the
 * model's job is to interpret the report and only add data the user supplied.
 */
export const BIBTEX_SKILL = `Built-in skill: /bibtex

You are correcting a BibTeX database, not writing the paper. Read the .bib
files before changing anything: use list_project_files and read_project_file.
Call patch_bibtex with mode="fix" (the default) to apply the safe mechanical
corrections and return the remaining problems. Use mode="report" only when the
user explicitly asks for an inspection without changes. The tool already
normalizes braces, commas, duplicate and empty fields, pages, month, bare DOI,
and unescaped & and %; do not duplicate that work by hand.

Always apply the safe mechanical corrections first, even when entries are
missing required fields. Missing data is reported after the patch; it is not a
reason to leave malformed syntax in place.

Never invent bibliographic data. Missing authors, titles, years, venues,
volumes, pages, or DOIs are gaps for the user to supply. Do not fill them with
plausible text. Do not invent a citation key, and do not rename one unless you
update every \\cite, \\citep, \\citet, and \\nocite in the project and the user
explicitly asks for the rename.

Safe mechanical corrections:
- normalize entry syntax and field delimiters;
- remove duplicate and empty fields;
- normalize pages to an en-dash "--";
- normalize month names to jan/feb/...;
- strip a doi.org URL from the doi field;
- escape & and % in prose fields, but not in url/doi/eprint/file;
- report duplicate keys, missing required fields, and journal/booktitle mismatches.

Semantic corrections:
- For one entry, call patch_bibtex with entryKey and set/remove. Only set values
  that are already in the source or supplied by the user in this conversation.
- If a required field is missing and the user has not supplied it, report the
  gap in chat. Do not use an LLM guess as a bibliographic fact.
- Missing entry type or journal/booktitle mismatch can be reported with the
  evidence from the entry; edit it only when the evidence is unambiguous.

Do not modify .tex files except citation-key updates that the user explicitly
requested. Do not touch figures, the manuscript body, or other files.

Output: a compact report of what the tool changed, the remaining warnings, and
the exact data the user needs to supply. If there is no .bib file, say so and
point to the Literature panel or a new references.bib file.`;
