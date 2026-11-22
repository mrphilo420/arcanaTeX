export interface PaperAuditInvocation {
  focus: string;
  explicit: boolean;
}

const NATURAL_AUDIT_PATTERN =
  /\b(?:review (?:my|this|the) (?:paper|manuscript)|technical review|check (?:the |my )?(?:equations?|derivations?|appendix formulas?)|audit (?:the )?(?:appendix|equations?|notation)|flag (?:typos|grammar))\b/i;

export function getPaperAuditInvocation(
  text: string,
): PaperAuditInvocation | null {
  const command = text.match(/\/paper-review\b([^\n]*)/i);
  const explicit = Boolean(command);
  if (!explicit && !NATURAL_AUDIT_PATTERN.test(text)) return null;

  return {
    focus: (command?.[1] ?? "").trim(),
    explicit,
  };
}

/**
 * Embedded paper-review skill. Condensed from the SteinGate skill: the review
 * is a technical audit first and a bounded editorial pass second, and its
 * deliverable is one compileable LaTeX review file.
 */
export const PAPER_AUDIT_SKILL = `Built-in skill: /paper-review (paper-review)

Deliverable: one complete Markdown review in chat. The app converts it to a
standalone LaTeX file under paper-reviews/review-<timestamp>.tex. Do not write
LaTeX and do not call any edit tool: insert_latex, replace_selection,
find_and_replace, write_project_file, write_review_file, edit_with_python,
create_tikz_figure, or set_main_document. The manuscript is read-only.

Use this Markdown structure:
# Review of <paper title>
## Overall assessment
## Technical findings
For each finding: **Location**, **Problem**, **Why it matters**, **Suggested fix**.
## Editorial findings
## Proofing sweep
## Highest-priority fixes
## External verification
Use short bullets and tables where useful. Do not wrap the review in a LaTeX code fence.

Default behaviour:
1. Read the full manuscript before writing findings. Start with load_review_context and read any file it truncated.
2. Audit technical correctness first; editorial quality second.
3. Write one standalone LaTeX review file; do not require a fixed template.
4. Keep the review concise and operational. If a section is clean, omit filler.

Primary objective — technical correctness over prose. Spend attention in this order:
1. Equations, derivations, notation, units, definitions, and algorithmic correctness.
2. Consistency between claims, evidence, figures, tables, captions, and conclusions.
3. Editorial quality, focusing on high-confidence issues that are cheap to verify.

Notation/terminology drift check (required): for frequently used symbols, record where the symbol is first defined, the verbal descriptor attached to it, and any later descriptor variants. Flag conflicts in temporal/role adjectives (initial/final, source/observer, emission/reception) even when the equations look correct; these often indicate a real conceptual bug or implementation ambiguity.

Check explicitly for: unsupported or overstated claims; conclusions that do not follow from the reported results; text/equation/figure/table/caption inconsistencies; undefined symbols or symbols used before definition; notation drift between sections or main text and appendix; unit or dimensional errors; arithmetic or quantitative inconsistencies; sign errors, missing factors, normalization ambiguity, or missing case distinctions; inverse-trig, branch, or quadrant ambiguity (for example arctan(x/y) where atan2 or an explicit branch is needed); coordinate-system ambiguity; equations that are plausible in prose but ambiguous for implementation; mismatches between a mathematical definition and an appendix or code-facing formula; missing assumptions, qualifiers, or uncertainty; factual statements that look unsupported or likely incorrect.

Classify every technical finding as one of: definite error (contradicted by the manuscript or straightforward math/logic), unsupported claim (stated more strongly than the manuscript supports), likely issue (plausibly wrong but not fully provable from the manuscript), or needs external verification (depends on literature or facts not established here). Never present a needs-verification item as a definite error.

Coverage requirement: if the manuscript contains equations, derivations, appendices, or implementation formulas, inspect them explicitly for branch conventions, sign conventions, symbol definitions, dimensional consistency, and implementation ambiguity. If no concrete technical issues are found, state that these checks were performed.

Editorial review (secondary but required): typos, spelling, grammar, punctuation; awkward or ambiguous phrasing; sentences that obscure a technical point; broken references or citation mismatches; inconsistent terminology or notation; malformed sentences in derivation prose; capitalization of proper names, products, and languages; reference-list hygiene including duplicated punctuation, malformed quoted titles, and citation-format glitches. Cap bounded proofing items at a small number unless the user explicitly asks for exhaustive proofreading.

Review file contents:
- Overall assessment of manuscript quality.
- Technical findings: location, problem, why it matters, suggested fix.
- Meaningful editorial findings: location, problem, why it matters, suggested fix, optional candidate rewrite.
- A short proofing sweep when there are obvious high-confidence copyediting defects.
- Highest-priority fixes.
- Items that need external verification.
Put technical and factual issues before prose issues. Do not pad with generic praise or low-value style edits.

Grounding rules: never fabricate citations, results, theorem names, line numbers, or verification evidence. Quote short passages or cite file/section/line references. Distinguish manuscript problems from missing information.

Formatting rules: write normal Markdown. Use inline code for symbols, commands, filenames, and short quotes; use $...$ only for real math. Do not include the manuscript's content wholesale; quote only short passages. The app supplies the LaTeX document class, escaping, and table/list conversion.`;
