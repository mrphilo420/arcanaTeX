export type HourglassMode =
  | "outline"
  | "draft"
  | "diagnose"
  | "revise"
  | "extract"
  | "review";

export interface HourglassInvocation {
  mode: HourglassMode;
  focus: string;
  explicit: boolean;
}

const MODE_ALIASES: Record<string, HourglassMode> = {
  outline: "outline",
  plan: "outline",
  structure: "outline",
  draft: "draft",
  write: "draft",
  diagnose: "diagnose",
  check: "diagnose",
  "hourglass-check": "diagnose",
  revise: "revise",
  edit: "revise",
  extract: "extract",
  abstract: "extract",
  title: "extract",
  review: "review",
  verdict: "review",
};

const NATURAL_HOURGLASS_PATTERN =
  /\b(?:hourglass(?: check)?|reverse outline|structure (?:my|this|the) (?:paper|manuscript)|does (?:my|this) (?:paper|manuscript) (?:flow|have a clear story|read well)|tighten (?:my|the) abstract|does (?:my|the) title overclaim|the discussion feels weak|the ending is flat)\b/i;

export function getHourglassInvocation(
  text: string,
): HourglassInvocation | null {
  const command =
    text.match(/\/hourglass\b([^\n]*)/i) ??
    text.match(/\/paper-write\b([^\n]*)/i);
  const explicit = Boolean(command);
  if (!explicit && !NATURAL_HOURGLASS_PATTERN.test(text)) return null;

  const words = (command?.[1] ?? "").trim().split(/\s+/).filter(Boolean);
  let mode: HourglassMode = "diagnose";
  const focus: string[] = [];

  for (const word of words) {
    const candidate = MODE_ALIASES[word.toLowerCase()];
    if (candidate) {
      mode = candidate;
    } else {
      focus.push(word);
    }
  }

  return { mode, focus: focus.join(" "), explicit };
}

/** `draft` and `revise` are the only modes that edit the manuscript. */
export function hourglassNeedsEdits(mode: HourglassMode): boolean {
  return mode === "draft" || mode === "revise";
}

/**
 * Embedded hourglass-paper-writer skill. Condensed from the SteinGate skill so
 * it fits the request budget, but keeps the contract, gates, defects, and
 * output rules that make the skill checkable.
 */
export const HOURGLASS_SKILL = `Built-in skill: /hourglass (hourglass-paper-writer)

A paper is a controlled change of scope, not a container for sections. The reader starts with the field, is walked down to one answerable question, is held there while the evidence is presented, and is walked back out to what the answer means. Enforce that path as a monotonicity contract, not as a section order.

Modes:
- outline: fill the one-page structural plan (question, evidence inventory, target venue, waist sentence, numbered questions, closure table).
- draft: write section prose from an outline or notes, one section at a time.
- diagnose (default): trace the levels, name defects, build the closure table, give a fix order.
- revise: edit the manuscript and return a change log.
- extract: title, abstract, and highlights only.
- review: a severity-ranked structural report a third party could act on.

Before writing a single sentence, read the manuscript, the project constraints (venue, length, notation, scope limits), the result inventory (theorems, tables, figures, experiments and their status), and the project outline. If a fact is not in those sources, ask or leave a marked gap. Do not fill it with plausible prose.

THE CONTRACT — five gates, in order. A later gate cannot rescue an earlier one.

Gate 1 — Shape: the level trace. Tag every paragraph with its scope level and check monotonicity.
L0 the field and why it matters (Introduction ¶1)
L1 the subfield or problem class (Introduction ¶1–2)
L2 the specific gap or failure (Introduction ¶2–3)
L3 the question or objective (end of Introduction)
L4 the object, design, dataset, or formal setting (Methods/Preliminaries)
L5 the result (Results/Proofs)
L6 the bounded implication (Discussion)

Pass conditions: L0→L3 is non-increasing; L4 and L5 are flat; L5→L6 is non-decreasing and every step is licensed by a named result; no paragraph jumps more than one level (a two-level jump is a missing paragraph).

Gate 2 — Waist: one sentence, no citations, no field-level framing:
"We [operation] [object] under [conditions] to establish [result]."
If you cannot write it, the paper has a topic, not a waist. Write it before the abstract.

Gate 3 — Closure: extract the numbered questions from the end of the Introduction and the answers from the Conclusion. They must match in count, order, and label. Every objective needs an answer; every result needs an objective. Orphan objective and orphan result are structural defects.

Gate 4 — Calibration: one evidence status per claim, carried unchanged from abstract to conclusion.
proves ← proof; shows ← measurement; indicates ← association; suggests ← inference; may ← speculation.
The abstract may never use a stronger verb than the weakest link in the body's support chain.

Gate 5 — Production: the paper compiles, references resolve, figures were rendered and inspected, citations were verified, and declarations match what happened. This is a checklist, not a rewrite.

SECTION PLAYBOOK (short form):
- Title: name the object and finding, searchably; a reader can predict the result; it must not assert more than the abstract.
- Abstract: the whole hourglass in one paragraph; every number must also appear in the body.
- Introduction: narrow L0→L3 and hand off; end on a numbered question; no widening after the questions.
- Related work: build the gap, not a bibliography; end with what is still open.
- Methods/Preliminaries: hold the waist; a competent reader could repeat it.
- Results/Proofs: answer the questions in order; one finding per paragraph; do not explain method.
- Discussion: widen L5→L6; every widening traces to a named result; do not re-run the results.
- Conclusion: close the loop with the same questions in the same order; add no new claim.

Paragraph rules: claim first, consequence last; one claim per paragraph (six sentences is the working ceiling; the abstract is the exception); every sentence advances the level trace or supplies evidence; no sentence may be true of a different paper ("Recent years have seen growing interest in X" carries no information).

ARCHETYPES — pick before applying a template:
- Empirical/IMRaD: waist is Methods + Results; test is design + primary outcome.
- Theoretical/mathematical: waist is Preliminaries + Results + Proofs; the main theorem with all hypotheses.
- Formalization: statement + module + axiom audit; test is the declaration and its axiom footprint.
- Computational/ML: data + model + evaluation protocol; test is baseline, metric, split, ablation.
- Qualitative: sampling + coding + theme derivation; test is the analytic procedure and audit trail.
For a math or formalization paper, L5 is a proof, not a measurement, and the pass test is an axiom audit. Do not list declarations instead of arguing; that is the named defect "declaration-list proof".

NAMED DEFECTS (use these names):
funnel leak; diffuse waist; methods creep; results re-run; unlicensed widening; orphan objective; orphan result; new-claim conclusion; abstract drift; title overclaim; citation laundering; hedge mismatch; reverse paragraph; table narration; declaration-list proof.
A finding must cite a location. "The discussion is weak" is not a finding. "The discussion states a field-level implication in ¶2 that no result licenses; cite Theorem 4.2 or downgrade to 'suggests'" is a finding.

OUTPUT CONTRACT:
- draft: prose plus a short header stating the question the section answers, its level, and the claim status of every assertion.
- diagnose/review: verdict (≤60 words, no hedging); level trace (paragraph or section); waist sentence (quoted or NOT FOUND with reason); closure table (question, location, status); findings ranked blocking/major/minor with location, why it matters, concrete fix; fix order (max four, structural before cosmetic); rubric out of 16 and band.
- outline: the filled outline; extract: title/abstract/highlights only.

EDITING RULES:
- diagnose, review, outline, and extract are read-only: do not modify files.
- draft and revise may edit the manuscript with the normal edit tools; every edit is reviewed by the user before it applies.
- Never invent citations, results, theorem names, line numbers, or verification evidence. Use the project files; quote or cite section/file/line references.
- For a formalization paper, separate informal claims from Lean declarations, report sorry/admit/axioms and whether the formal statements match the paper's assumptions, and never call a formalization complete without build evidence.`;
