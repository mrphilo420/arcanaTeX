export type ProofreadScope = "document" | "selection" | "citations";

export interface ProofreadInvocation {
  scope: ProofreadScope;
  focus: string;
  explicit: boolean;
}

const SCOPE_ALIASES: Record<string, ProofreadScope> = {
  document: "document",
  paper: "document",
  all: "document",
  selection: "selection",
  selected: "selection",
  citations: "citations",
  citation: "citations",
  references: "citations",
  cites: "citations",
};

const NATURAL_PROOFREAD_PATTERN =
  /\b(?:proof-?read|check (?:the |my )?(?:grammar|spelling|typos?))\b/i;

export function getProofreadInvocation(
  text: string,
): ProofreadInvocation | null {
  const command = text.match(/\/proofread\b([^\n]*)/i);
  const explicit = Boolean(command);
  if (!explicit && !NATURAL_PROOFREAD_PATTERN.test(text)) return null;

  const words = (command?.[1] ?? "").trim().split(/\s+/).filter(Boolean);
  const scope = words[0] ? SCOPE_ALIASES[words[0].toLowerCase()] : undefined;

  return {
    scope: scope ?? "document",
    focus: (scope ? words.slice(1) : words).join(" "),
    explicit,
  };
}

export const PROOFREAD_SKILL = `Built-in skill: /proofread

You are now proofreading the user's manuscript. This is read-only: do not
modify any file. Do not call insert_latex, replace_selection, find_and_replace,
or write_project_file. Report findings in chat; the user decides what to apply.

Scope:
- document (default): use load_review_context, then read any file it truncated.
- selection: proofread only the selected text the user sent (file path and line range are in the message or editor context).
- citations: audit citations only (see Citation check). Skip prose.

Proofreading checks, in priority order:
1. Spelling, grammar, punctuation, and agreement errors.
2. Ambiguous, awkward, or overly long sentences; undefined abbreviations on first use.
3. Terminology and notation consistency (symbol meanings, spelling variants, US/UK mixing, tense).
4. LaTeX prose hygiene: straight quotes instead of \`\`...'', missing non-breaking space before \\cite/\\ref (use ~), "etc." spacing, hyphen vs en/em dash in ranges, $...$ misuse in prose.
5. Academic tone: unsupported superlatives, hedging mismatches, claims that exceed the evidence shown.

Citation check:
- Every \\cite, \\citep, \\citet key must exist in a loaded .bib file or thebibliography block; list unresolved keys with file and line.
- List .bib entries that are never cited.
- Flag incomplete entries (missing author, year, or title) and duplicate keys.
- Do not claim a reference is real or correct unless the .bib content supports it. Never invent a DOI, author, or title. If external verification is needed, say so.

Grounding rules:
- Quote the exact original text and give file and line when available. Never "fix" text you did not read.
- Never change LaTeX commands, math, labels, or citation keys inside your suggestions; correct prose only.
- Separate certain errors from stylistic suggestions. Do not rewrite the author's voice.
- If nothing is wrong in a category, say so briefly rather than inventing findings.

Output format:
# Proofreading report
## Summary (counts by severity and the 3 most important fixes)
## Errors (must fix)
Table: location | original | suggested | reason
## Style suggestions (optional)
## Consistency issues
## Citation check
## Not checked (what you could not assess, e.g. truncated files)

The invocation may add a focus such as tone, grammar, or notation. Prioritize it while keeping the read-only rule.`;
