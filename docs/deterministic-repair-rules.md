# Deterministic LaTeX Repair Rules

Status: proposed specification for `apps/web/lib/latex-autofix.ts`.

This document defines the repair contract, the rule catalog, the current
implementation gaps, and the test-first acceptance matrix. It does not change
runtime behavior by itself.

## 1. Scope

The input is a `CompileDiagnostic` produced by
`apps/web/lib/compile-diagnostics.ts` plus the project's `.tex` files. A repair
rule may only edit source text. It may not invoke an AI model, install TeX
packages, delete project files, or change the compiler.

The output remains an `AutoFixResult`:

```ts
{
  updates: { id: string; content: string }[];
  applied: string[];
  skipped: { diagnosticId: string; reason: string }[];
}
```

## 2. Determinism contract

A rule qualifies as deterministic only when all of the following hold.

| ID | Contract |
|---|---|
| D1 | Edits are selected by exact lexical patterns over **active** TeX only. Comments and verbatim/listing bodies are masked before matching. |
| D2 | The rule has a closed set of mappings. It never invents a package, environment, command, or class name outside a checked-in table or theorem-like whitelist. |
| D3 | One diagnostic maps to one rule. No probabilistic matching, no model calls, no browsing, no package discovery. |
| D4 | Running the same rule twice on its own output produces no further edits. |
| D5 | Edits are local: a body edit is line- or command-local; preamble edits insert immediately before `\begin{document}` (or after `\documentclass` as fallback). |
| D6 | Two edits may not overlap. The second discovery is skipped with a reason instead of being force-applied. |
| D7 | All bytes outside the edited range are preserved, including line endings, comments, and unrelated whitespace. |
| D8 | Diagnostics that are not errors, or that lack the data required by a rule, are skipped with a stable human-readable reason. |
| D9 | Rule order, file order, and edit order are fixed. No timestamps, random IDs, or object-key iteration affect the result. |
| D10 | Every applied edit leaves an `% Auto-fix:` marker unless the edit is an unambiguous preamble insertion **or the marker could change the output**. A trailing `%` swallows the line break and so removes the space between two lines of prose; edits inside running text (R12) therefore carry no marker and rely on the diff preview and version snapshot. R8 adds its marker only because the next line is blank. |

## 3. Active-text mask

The implementation should build one lexical mask per `.tex` file before
matching any rule.

- A `%` starts a comment unless it is escaped as `\%`.
- The mask is disabled inside `verbatim`, `verbatim*`, `lstlisting`, `minted`,
  `\verb|...|`, `\lstinline|...|`, and `\mintinline{...}{...}` bodies.
- `\begin`/`\end` tokens inside an inactive span never participate in a rule.
- Mask ranges are calculated from the original file and remain valid while
  edits are collected. Edits are applied afterwards in descending offset order.
- If the mask cannot be established because a verbatim delimiter is
  unterminated, the file is marked **review-only**.

This is the highest-priority infrastructure change: several current rules
match commented commands or definitions because they search raw file text.

## 4. Rule catalog

### R1 — Missing graphic

**Diagnostic:** `missing-graphic` with `data.file` set.

**Preconditions**

1. The missing path has an image extension (`.pdf`, `.png`, `.jpg`, `.jpeg`,
   `.eps`, `.svg`, `.gif`).
2. Exactly one active `\includegraphics[options]{path}` command matches the
   normalized path, and the command is not inside a comment or verbatim span.
3. The command is the only active content on its line, apart from whitespace
   and a trailing comment.
4. The line is not already marked with `% Auto-fix: missing graphic`.

**Edit**

- Prepend `% Auto-fix: missing graphic <path>` to the command's line and
  comment that line.
- If the command spans multiple lines, shares a line with prose, or occurs more
  than once, do not edit. Return `Review` with the reason.

**Why this is safe:** the edit is reversible and removes the compile blocker
without deleting source.

**Current implementation:** partial. `commentLineEdit` comments the entire
line even when other content is present, `findGraphicCommands` does not skip
comments, and repeated runs can add another `% Auto-fix` header.

---

### R2 — Undefined environment

Split into two rules.

#### R2a — Package-provided environment

**Diagnostic:** `undefined-environment` with a mapped environment.

**Mapping:** only the existing checked-in table
(`ENVIRONMENT_PACKAGES`) and `proof -> amsthm`.

**Preconditions**

1. The environment is in the mapping.
2. The package is not already loaded by an **active** `\usepackage` or
   `\RequirePackage` in the project.
3. The main file has a stable insertion point for the package.

**Edit**

- Insert `% Auto-fix: environment <env>` and
  `\usepackage{<package>}` immediately before `\begin{document}`.
- If the package is already active, skip: "package already loaded; this
  environment needs a manual definition."

#### R2b — Theorem-like environment

**Diagnostic:** `undefined-environment` with no package mapping.

**Preconditions**

1. The environment name, after stripping one trailing `*`, is in the
   `THEOREM_LIKE` whitelist.
2. The environment has no existing active `\newtheorem` or `\newtheorem*`
   definition.
3. The main file has a stable insertion point.

**Edit**

- Insert `\newtheorem{name}{Title}` (or `\newtheorem*` for a starred name)
  before `\begin{document}`.
- Starred environments also require an active `amsthm`; add it once if
  missing.

**Hard stop:** unknown non-theorem-like environments are **review-only**.
Creating `\newtheorem{foo}{Foo}` for an arbitrary environment is not
deterministic and can silently change document semantics.

**Current implementation:** partial. The package branch is sound. The fallback
branch currently defines any unknown non-built-in environment as a theorem
environment; it must be restricted to the whitelist.

---

### R3 — Environment mismatch

**Diagnostic:** `environment-mismatch` with `data.begin` / `data.end`.

**Preconditions**

1. The file has no active verbatim-like body and no unterminated verbatim.
2. The file has no `\if`, `\else`, `\fi`, `\unless`, or similar conditional
   around the candidate environment tokens. Conditional branches make the
   stack ambiguous; mark review-only.
3. The number of proposed edits is at most 20. Beyond that, review-only.
4. Each candidate line contains only the `\begin`/`\end` token, whitespace, and
   an optional trailing comment.

**Edit**

Use a stack over active, non-`document` environment tokens:

- Matching `\begin`/`\end` pairs are unchanged.
- For an unmatched `\end{env}`, comment the whole line only under the
  line-local guard above.
- For a nested mismatch, insert the missing `\end{...}` lines immediately
  before the offending `\end`, each with an `% Auto-fix` marker.
- For unclosed environments at the end, insert the closing lines immediately
  before `\end{document}`.

**Why this is safe:** every insertion is additive and reversible; ambiguous
branching is never rewritten.

**Current implementation:** partial. It handles the stack and inserts missing
ends, but only skips `verbatim`, `lstlisting`, and `minted`; it does not guard
`\verb`, `\lstinline`, `\mintinline`, or conditionals.

---

### R4 — Missing package file

**Diagnostic:** `missing-package` with `data.package` or `data.file`.

**Preconditions**

1. The package name is present as an exact token in an active
   `\usepackage`/`\RequirePackage` command.
2. The command is not inside a comment.
3. The invocation is not `\usepackage` inside a macro definition or a
   conditional branch that could be false at compile time.

**Edit**

- Remove the exact package token from the package list.
- Preserve the command options and the other package names.
- If the list becomes empty, comment the entire command line with
  `% Auto-fix: missing package <name>`.
- Do not remove a `.cls` reference. Missing classes remain review-only.

**Current implementation:** partial. It removes tokens and preserves options,
but `findPackageCommands` scans raw text and can rewrite commented invocations.

---

### R5 — Undefined command

**Diagnostic:** `undefined-command` with `data.command`.

**Preconditions**

1. The command is an exact key in the checked-in `COMMAND_PACKAGES` map.
2. No active local definition already defines the command via `\newcommand`,
   `\newcommand*`, `\providecommand`, `\DeclareMathOperator`,
   `\DeclareMathOperator*`, `\def`, or `\let`.
3. The mapped package is not already loaded by an active package command.
4. The main file has a stable insertion point.

**Edit**

- Insert `% Auto-fix: command \foo` and `\usepackage{package}` before
  `\begin{document}`.

**Hard stop:** an unknown command, a locally defined command, or a command
whose package is already loaded is review-only. Never guess a package from the
command name.

**Current implementation:** partial. It checks the package map and loaded
packages, but does not check local definitions and does not mask comments.

---

### R6 — Duplicate definition

**Diagnostic:** `duplicate-command` with `data.command`.

**Preconditions**

1. The command is defined more than once by active definitions.
2. The duplicate definitions are **byte-identical after trimming outer
   whitespace**. Different bodies are a semantic override, not a duplicate.
3. The definitions use `\newcommand` or `\newcommand*`. A later
   `\renewcommand`, `\providecommand`, `\def`, or `\let` is an intentional
   redefinition and must not be commented away.
4. The duplicate definition is line-local: one definition per line, with no
   trailing prose.

**Edit**

- Comment every duplicate after the first, with
  `% Auto-fix: duplicate command \foo`.
- If bodies differ, skip: "different definitions require a manual
  renewcommand/rename decision."

**Current implementation:** partial and unsafe for the target contract. It
includes `\renewcommand` and `\providecommand` in the candidate set, treats
any later definition as duplicate, and can match commented definitions.

---

### R7 — Missing input file (proposed, disabled)

Do not enable this without fixtures and a product decision.

A possible rule would comment an active `\input{path}` or `\include{path}` only
when the command is the sole active content on its line and the target is
missing. Unlike a graphic, a missing input often contains document structure;
commenting it silently drops content. Keep it **review-only** for now.

### R8 — Unclosed argument (runaway argument)

**Diagnostic:** `runaway-argument` with `data.runaway` set (the text TeX prints
after `Runaway argument?`). Covers `File ended while scanning use of \x` and
`Paragraph ended before \x was complete`.

**Why this is allowed despite the earlier "never auto-fix" policy.** The error
location is useless: TeX fails at end of file (or at the next paragraph), far
from the cause. The runaway text is not: TeX prints the start of the argument
it was reading, so it names where the argument began. The rule anchors on that
text instead of the error line, and acts only when the closing position is
unambiguous.

**Preconditions (all must hold, otherwise skip with the stated reason)**

1. The runaway text, with all whitespace removed, is at least 8 characters,
   starts with `{`, and matches **exactly one** place in the active text of
   the project's `.tex` files. TeX inserts spaces after control words and
   folds line breaks, so matching ignores whitespace.
2. The file contains no verbatim-like or conditional text (`verbatim`,
   `Verbatim`, `lstlisting`, `minted`, `comment`, `\verb`, `\lstinline`,
   `\mintinline`, `\iffalse`); braces there are not counted the way a plain
   scan counts them. Review-only.
3. Scanning active text from the anchor (comments masked, `\{`, `\}` and other
   escaped characters ignored), the brace depth never falls below 1.
4. At the end of the anchor's line the depth is exactly 1: the argument's own
   inner groups are complete on that line, so only its final `}` is missing.
5. The next line is blank (or the file ends). If it continues the text, the
   argument may legitimately continue and the position is ambiguous.
6. From the anchor to the end of the file exactly one `{` is left open. Two or
   more missing braces are review-only.
7. The line does not already carry `% Auto-fix: closed unmatched {`.

**Edit**

- Insert `}` after the last active character of the anchor's line, before any
  trailing comment and trailing whitespace.
- If the line has no trailing comment, follow the brace with
  `% Auto-fix: closed unmatched {`. If it already has a comment, insert only
  the brace so the existing comment is not disturbed.
- Line endings (`\n`, `\r\n`, lone `\r`) and every other byte are preserved.

**Why this is safe:** after the edit the file is brace-balanced from the
anchor onward (precondition 6), the insertion is a single character at a
position fixed by preconditions 4 and 5, running the rule again finds no
unmatched brace (idempotent), and the apply path saves a version snapshot and
shows a diff preview like every other rule.

**Implementation:** `apps/web/lib/latex-braces.ts` (`closeRunawayArgument`),
called from `runAutoFixes`; the parser captures `data.runaway` in
`compile-diagnostics.ts`.

**Worked example (a Springer Nature `sn-jnl` manuscript).** One missing `}` on
an `\affil*[1]{...}` line produced `File ended while scanning use of
\\@@coraddress` with the runaway text `{\orgdiv {Mathematics Department, ...`.
The old log panel blamed `tikzlibrarypositioning.code.tex` (see section 10).
The rule located the single line, appended the brace, and the project compiled.

#### Best practices behind R8

Gathered from how TeX reports this error, community debugging guidance
(latex.org forum threads on `File ended while scanning use of ...`), and
observation of this project's own logs. The forum material is advice from
individual helpers, not an authoritative specification.

| Practice | How R8 applies it |
|---|---|
| The runaway text shows where the argument started; the error line shows only where TeX gave up. | Anchor on the runaway text, never on the error line. |
| Look at the code *before* the reported spot, not after it. | The edit is at the anchor's own line. |
| A closing brace is often hidden by a `%` comment. | Comments are masked before counting; a `}` in a comment never counts. |
| Escaped braces are not groups. | `\{`, `\}`, `\\` and other `\x` pairs are skipped. |
| When the cause is ambiguous, bisect or ask; do not guess. | Seven explicit refusal conditions; unknown cases fall through to the AI fixer, which the user approves. |
| A repair should be reversible and visible. | Marker comment, diff preview, version snapshot before applying. |
| Unstarred `\newcommand` arguments may span paragraphs, so a runaway argument reaches end of file instead of stopping at a blank line. The manual: "The starred form of these two forbids the arguments from containing multiple paragraphs of text." | Do not rely on a paragraph break as the end of the argument; require a blank next line as *evidence of the boundary*, not as the error location. Verified against the LaTeX2e reference manual and observed in the log above. |

## 5. Negative rules: never auto-fix

These diagnostics are intentionally left untouched:

| Diagnostic | Reason |
|---|---|
| `math-mode` | Missing `$` may be a line-spanning math construct or a macro expansion; a local guess can corrupt semantics. |
| `runaway-argument` (other cases) | R8 handles only the narrow, anchored case above. Everything else (no runaway text, several missing braces, multi-line arguments, verbatim) stays manual. |
| `fatal` | The log usually reports a symptom, not a reliable source range. |
| `missing-class` | A class may come from a TeX distribution or a project-specific file; removing the reference changes the document model. |
| `missing-file` (non-image) | Same content-loss risk as R7. |
| `undefined-reference` | Source is usually correct; rerun or fix the label/citation manually. |
| `undefined-citation` | Same as references; a missing BibTeX entry is not a source edit. |
| warnings | Warnings are review information; no deterministic source edit is defined. |

For all of these, `describeAutoFix` returns `null`, the inspector shows
**Manual**, and no version snapshot is created unless another rule applies.

## 6. Rule ordering and conflict resolution

Use this fixed order:

1. Build the active-text mask for every `.tex` file.
2. Resolve diagnostics to files by `fileId`, then exact `filePath`, then file
   basename. If still ambiguous, skip.
3. Evaluate R8, R4, R5, R2, R6, R3, R1 in that order. R8 runs first because an unclosed brace invalidates every later diagnostic in the log.
4. Collect edits with `(ruleId, fileId, start, end, text)`.
5. Reject any edit that overlaps an already-accepted edit; record a skip
   reason.
6. Apply accepted edits per file in descending offset order.
7. Re-check idempotence by running the same diagnostic set on the result.

Stable ordering matters because preamble rules all insert near the same marker.
The implementation should aggregate package additions into one deterministic
preamble block or insert them in rule-id/package-name order.

## 7. Current implementation audit

| Rule | Existing behavior | Gap against this contract |
|---|---|---|
| R1 | Comments the line containing a matching `\includegraphics`. | Matches commented commands; comments any shared line; not idempotent. |
| R2a | Loads mapped package before `\begin{document}`. | Package-loaded scan is raw, so commented packages count. |
| R2b | Defines theorem-like and arbitrary unknown environments. | Arbitrary unknown environments must not become `\newtheorem`. |
| R3 | Stack-balances active environment tokens; skips some verbatim bodies. | Missing `\verb`/`\lstinline`/conditional guards; line-wide comment can remove neighboring content. |
| R4 | Removes a missing package token, preserves other packages/options. | Raw matching can rewrite commented `\usepackage` lines. |
| R5 | Adds a mapped package for an undefined command. | No local-definition check; raw package-loaded scan. |
| R6 | Comments every later `\newcommand`/`\renewcommand`/`\providecommand` definition. | Must only handle identical `\newcommand` definitions; intentional redefinitions are not duplicates. |
| R7 | Not implemented. | Keep review-only unless product decision changes. |
| R8 | Implemented in `latex-braces.ts` with the preconditions above. | None known; covered by `latex-braces.test.ts` and `latex-autofix.test.ts`. |
| Negative set | Warnings are skipped; unsupported errors fall through. | Correct policy; needs explicit reasons in the UI. |

`latex-autofix.ts` has a Vitest suite (`pnpm test`), but it covers only a
subset of the fixtures below; R8 is fully covered. The remaining rows of the
matrix are still to be written.

## 8. Test-first acceptance matrix

Write each fixture as a failing test before changing production code. The
expected result includes both the edited text and the `skipped` reason.

| Rule | Fixture | Expected |
|---|---|---|
| R1 | One image command on its own line | Line commented; `applied` includes one graphic. |
| R1 | Command shares a line with prose | No update; skipped as review. |
| R1 | Command already commented | No update; skipped. |
| R1 | Multi-line `\includegraphics` | No update; skipped. |
| R2a | `align` with no `amsmath` | `\usepackage{amsmath}` inserted once. |
| R2a | `align` with `amsmath` already loaded | No update; skipped. |
| R2b | `lemma` with no definition | `\newtheorem{lemma}{Lemma}` inserted. |
| R2b | `foo` with no mapping | No update; review-only. |
| R3 | Unclosed `figure` before `\end{document}` | Closing `\end{figure}` inserted. |
| R3 | Stray `\end{itemize}` on its own line | Line commented. |
| R3 | Mismatch inside `\iffalse` | No update; review-only. |
| R4 | `\usepackage{foo,bar}` with missing `foo` | Becomes `\usepackage{bar}`. |
| R4 | Sole `\usepackage{foo}` missing | Line commented with marker. |
| R4 | `missing-class` `.cls` | No update; skipped. |
| R5 | `\mathbb` with no `amssymb` | `amssymb` inserted. |
| R5 | `\mathbb` already locally defined | No package edit; skipped. |
| R5 | Unknown command | No update; skipped. |
| R6 | Two identical `\newcommand` definitions | Second commented. |
| R6 | Two different definitions | No update; skipped. |
| R6 | `\newcommand` then `\renewcommand` | No update; intentional redefinition. |
| R8 | One-line argument missing its last `}` | `}` and marker appended to that line only. |
| R8 | Argument continues on the next line | No update; skipped as ambiguous. |
| R8 | Runaway text matches twice, or not at all | No update; skipped with the reason. |
| R8 | Closing brace only inside a `%` comment | Comment ignored; brace still added. |
| R8 | Verbatim-like content in the file | No update; review-only. |
| All | Apply the full rule set twice | Second run returns zero updates and only skips. |
| All | Run with warnings/math/runaway/fatal | Zero updates; explicit negative reasons. |

Recommended harness: add a small `vitest` or `node:test` target that imports
`runAutoFixes` and `previewAutoFix` directly. Run the fixture tests, then the
whole suite, then `pnpm lint` and `pnpm --filter @open-prism/web build`.

## 9. Implementation order

1. Add the test harness and the fixtures above (red).
2. Extract the active-text mask and use it in every matcher.
3. Harden R1, restrict R2b, and fix R6 semantics (green for those fixtures).
4. Add conditional/verbatim guards to R3 and R4.
5. Add local-definition checks to R5.
6. Add the idempotence and conflict tests.
7. Only then consider R7 or any new rule.

## 10. AI repairs are outside this contract

AI fixes are an opt-in fallback for errors and prioritized warnings that remain
after the deterministic rules. They use the selected Groq model and are
validated as line-based patches before application. They do not inherit
determinism from this document.

Warning families and their priorities are listed in
`apps/web/lib/latex-warning-knowledge.ts`. Bulk repair covers critical, high,
and medium warnings; low-priority typographic notes (underfull boxes, font
substitution, rerun notices) are still shown but are not auto-fixed. The AI
prompt receives the matching knowledge-base entries and is told to omit a
patch rather than invent a remedy. Overfull hboxes have a deterministic first
pass: emergency stretch for a mild single box, `\sloppy` for repeated or
severe boxes.

Repairs are allowed even when the last compile produced a PDF: the UI saves a
version first and recompiles, so the previous state can be restored.

## 11. Open questions

- Should a missing `\input` be review-only permanently, or become R7 after
  fixtures prove that commenting it is acceptable?
- Should package insertion preserve user ordering, or sort packages for
  reproducibility? Recommendation: preserve rule order and sort within a
  single inserted block.
- Should duplicate detection compare normalized whitespace or exact bytes?
  Recommendation: exact bytes after outer trim; whitespace differences are
  semantically relevant in TeX.
- Should `\DeclareMathOperator*` and `\def` be included in R6? Recommendation:
  detect them for local-definition checks in R5, but do not auto-comment them
  in R6 without dedicated tests.


## 10. Log attribution (supports every rule above)

Rules locate source by file, so the diagnostic must name the right file.
The parser (`compile-diagnostics.ts`) used to remember the last `.tex` name
printed anywhere in the log and never noticed a file closing, so any error
after the TikZ libraries loaded was blamed on `tikzlibrarypositioning.code.tex`
and a user chased the wrong file. It now:

- follows the `(file ... )` nesting TeX prints, with a stack, so the current
  file is whichever file is actually open;
- joins lines that TeX or MiKTeX hard-wrapped at 79 columns before reading
  parentheses (MiKTeX ignores `max_print_line` and wraps long paths);
- accepts absolute paths that contain spaces (`.../Application Support/...`);
- lets an explicit `file.tex:LINE:` location override the stack for its line.

Residual risk: parenthesised prose in a log can unbalance the stack. Texts such
as `(Font)` and `(see the transcript file ...)` are covered by tests; other
unbalanced output falls back to the main file rather than a wrong library file.


## 11. Proposed rules from the LaTeX2e reference manual

Status: **R9, R10, R11 and R12a-c are implemented** (R12d and R13-R17 remain proposals). Written against the unofficial LaTeX2e
reference manual (<https://latexref.xyz>, June 2026 edition). Each entry says
what the manual does and does not support, because several widely repeated
"fixes" are community folklore rather than documented behaviour.

### 11.1 Classes of fix

The determinism contract (section 2) covers edits that are safe to apply in
bulk. Some manual-backed fixes are deterministic *given a choice the author
must make*. Keep them out of **Fix all**:

| Class | Meaning | Fix all | UI |
|---|---|---|---|
| **A: Apply** | Meets D1-D10. One correct edit. | Included | Diff preview, version snapshot. |
| **B: Suggest** | Edit is mechanical but the intent is not determined by the log or source. | Excluded | Diff preview; one click per fix; label states the assumption. |
| **P: Project action** | Changes project state, not source text (for example the main file). | Excluded | Separate button; shows what changes. |

### 11.2 Diagnostics the parser must learn first

Today these arrive as generic `error`. Each rule below needs the parser to
classify the message and capture the data in the last column. TeX prints the
text up to the point of failure on the first context line (`l.N <text>`) and
the remainder on the next line, so the **end of the first context line is a
precise anchor** inside line `N`.

| Message | New kind | Data to capture |
|---|---|---|
| `Can be used only in preamble` | `preamble-only` | context line `N`, command |
| `Missing $ inserted` (exists as `math-mode`) | keep | context prefix: ends in `_` or `^` for prose (R12d), or in `}` for an error inside a macro argument (R12a) |
| `Misplaced alignment tab character &` | `misplaced-tab` | context prefix |
| `You can't use 'macro parameter character #'` | `misplaced-hash` | context prefix |
| `Unicode character X (U+XXXX) not set up for use with LaTeX` | `unicode-char` | the character |
| `Illegal parameter number in definition of \x` | `illegal-parameter` | command |
| `Command \x already defined` (exists) | keep | command, line |
| `\x undefined` raised by `\renewcommand` | `renew-undefined` | command |
| `Too many }'s` / `Extra }, or forgotten $` | `extra-brace` | context prefix |
| `no legal \end found` / `Emergency stop` | keep `fatal` | whether the source has an active `\end{document}` |

### 11.3 Rules

#### R9 — Missing `\end{document}` (Class A)

**Manual:** the "Recovering from errors" section names a missing or
misspelled `\end{document}` as a common error: LaTeX stops at a `*` prompt.

**Preconditions**

1. The main file has an active `\begin{document}`.
2. **No** active `\end{document}` exists in any project `.tex` file. A symptom
   in the log is not enough: `no legal \end found` also appears after a
   runaway argument (as in R8's worked example), so the check is on the
   source, not the message.
3. No `runaway-argument` diagnostic is pending. Fix R8 first and recompile.

**Edit:** append `\end{document}` on its own line at the end of the main file,
with `% Auto-fix: missing \end{document}`. A misspelled `\end{documnet}` is
already an `environment-mismatch` handled by R3.

#### R10 — Set the main file (Class P)

**Basis:** reproduced in this project, not from the manual. With no file marked
main, the compile service builds the first file it receives and fails with
`Missing \begin{document}` or `macro parameter character #` on a Markdown file.
The manual's requirement is only that a document has `\documentclass` and a
`document` environment.

**Preconditions:** exactly one project `.tex` file has an active
`\documentclass`, and it is not the current main. **Action:** offer
"Set `<path>` as main". If two or more qualify, offer nothing.

#### R11 — `\usepackage` after `\begin{document}` (Class A)

**Manual (verified):** "\usepackage must be used in the document preamble,
between the \documentclass declaration and the \begin{document}." For the rare
need to load before `\documentclass` it names `\RequirePackage`.

**Preconditions:** the diagnostic's line `N` is, in active text, a single
`\usepackage[opts]{pkgs}` and nothing else, located after `\begin{document}`;
the file holding it also holds the `\begin{document}`. **Edit:** comment the
line with `% Auto-fix: moved to preamble` and insert the same command before
`\begin{document}` using the existing preamble-insertion routine. If the
package is already loaded with different options, skip (Class B territory).

#### R12 — Reserved characters printed literally

**Manual (verified):** the reserved set is `\ { } % $ & _ ^ # ~`; `_` and `^`
outside math "will get you the TeX error 'Missing $ inserted'"; the text
symbols section gives `\textasciitilde`, `\textasciicircum`,
`\textbackslash`, `\textdollar` or `\$`, `\textunderscore`,
`\textbraceleft`, `\textbraceright`, `\textbar`.
**Not found in the pages checked:** `\#`, `\%`, `\&` are standard LaTeX but
were not listed on the pages fetched; confirm against the manual's "Reserved
characters" text before relying on them in documentation.

All four sub-rules anchor on the end of the first context line, so they edit
one character at a known position.

| Rule | Class | Preconditions | Edit |
|---|---|---|---|
| R12a `_` or `^` inside `\texttt{}` | A | TeX reports an error inside a macro argument at the **end of the argument**, so the printed context ends at the closing `}` of the `\texttt{...}` group, not at the character (confirmed against real pdfLaTeX output). The context must end at a `}` that closes a `\texttt` group; the group must contain no `$`; every unescaped `_` and `^` in it is escaped. Typewriter text is code or a file name, so the intent is literal. | `\_` and `\textasciicircum{}` |
| R12b `&` outside alignment | A | Context prefix ends with `&`; the innermost open environment is not `tabular`, `array`, `align`, `matrix`, `cases` or another alignment environment; if the environment stack cannot be built, skip. | `\&` |
| R12c `#` outside a definition | A | Context prefix ends with `#`; the position is not inside `\newcommand`, `\renewcommand`, `\def`, `\newenvironment` bodies. | `\#` |
| R12d `_` or `^` in plain prose | B | Prefix ends with the character, outside math and outside `\texttt`. | Offer `\_`, and state the assumption. The author may have meant math (`$x_i$`); the log cannot tell. |

#### R13 — Unicode punctuation under pdfLaTeX (Class A, whitelist)

**Manual (verified):** `--` or `\textendash` is the en dash, `---` or
`\textemdash` the em dash, and `` `` `` and `''` the double quotes.
**From LaTeX kernel behaviour, not the manual pages fetched:** pdfLaTeX stops
with `Unicode character ... not set up for use with LaTeX` for code points that
no font encoding supports; XeLaTeX, LuaLaTeX and Tectonic read Unicode natively,
so this is a pdfLaTeX-only failure.

**Whitelist (text mode only):** U+2013 to `--`, U+2014 to `---`, U+2018 to
`` ` ``, U+2019 to `'`, U+201C to `` `` ``, U+201D to `''`, U+00A0 to `~`.
Anything else (for example U+2212 minus, which depends on math mode) is
review-only. **Edit:** replace every active occurrence of the character named
in the diagnostic; skip comments and verbatim. These are pasted-from-Word
artifacts and the mapping is the manual's own.

#### R14 — `\renewcommand` of an undefined command (Class B)

**Manual (verified):** `\renewcommand` requires the name "must already be
defined" and otherwise errors (`LaTeX Error: \hank undefined`);
`\newcommand` requires it "must not be already defined".
**Why not Class A:** an undefined target usually means a package that would
define it is missing. Switching to `\newcommand` compiles, but silently
discards the intent to override that package's command.
**Suggest:** `\renewcommand` to `\newcommand` for that one definition, stating
the assumption.

#### R15 — Redefinition choices (Class B)

**Manual (verified):** `\providecommand` defines a command only if it is not
defined and otherwise "does nothing", with no error; `\newcommand` errors on a
second definition; names that begin with `\end` are illegal.

- Non-identical `\newcommand` duplicates: offer two explicit suggestions,
  `\renewcommand` (later definition wins) or `\providecommand` (first wins).
  Showing both is the honest answer; the log cannot say which was intended.
- `\newcommand{\endfoo}`: no edit (renaming changes every use). Improve the
  message to quote the manual rule.

#### R16 — Illegal parameter number (Class B)

**Manual (verified):** `nargs` is 0 to 9; parameters are `#1` to `#nargs`, and
with an optional argument `#1` is that argument.
**Suggest:** raise the declared count to the highest `#n` used in the body when
the used numbers are contiguous from 1 and at most 9. Class B because callers
must pass the extra argument. Nested definitions need `##` and stay
review-only.

#### R17 — Stray `}` (Class B, mirror of R8)

Anchor on the context prefix: the brace depth, counted over active text, first
goes negative at exactly that `}`. Suggest deleting that brace. Class B because
the missing piece may be an opening `{` earlier. The source here is community
guidance, not the manual.

### 11.4 Extending the package tables (R5, R2a)

Add a mapping only with a citation to the package's own CTAN documentation.
Candidates to verify before adding: `\mathscr` to `mathrsfs`, `\cref` to
`cleveref`, `\subfloat` to `subcaption` or `subfig` (ambiguous, so
review-only), `\algorithmicrequire` to `algorithmicx`. None of these is
checked against CTAN here.

### 11.5 Suggested order

1. R9 and R10: small, high value, and R10 addresses the large-folder failure.
2. R11 and R12a/b/c: mechanical, anchored on a known line.
3. R13: very common for pasted manuscripts.
4. Class B suggestions (R12d, R14-R17): require the UI split in 11.1.

### 11.6 Acceptance fixtures (write first, red)

| Rule | Fixture | Expected |
|---|---|---|
| R9 | Main has `\begin{document}`, no `\end{document}` anywhere | Appended once, marker present. |
| R9 | `\end{document}` present, log shows `no legal \end found` after a runaway | No update; skipped (symptom only). |
| R10 | Exactly one file with `\documentclass`, main unset | Action offered. Two candidates: nothing offered. |
| R11 | `\usepackage{amsmath}` after `\begin{document}` | Moved before it, original commented. |
| R12a | `\texttt{my_file}` with `_` error | `\texttt{my\_file}`. |
| R12b | `R&D` in prose; same text inside `tabular` | Prose escaped; the `tabular` untouched. |
| R12c | `#` in prose; `#1` inside `\newcommand` | Prose escaped; definition untouched. |
| R13 | `“quoted” – dash` | `` ``quoted'' -- dash ``; comments untouched. |
| R14 | `\renewcommand{\foo}` with no definition | Class B suggestion, not in Fix all. |
| All | Apply twice | Second run returns zero updates. |


### 11.7 Implementation status and what real TeX taught us

| Rule | State | Where |
|---|---|---|
| R9 | Implemented | `runAutoFixes` (kind `fatal` with `data.noLegalEnd`) |
| R10 | Implemented as a UI action; no source edit | `lib/main-file.ts`, notice in the Logs tab |
| R11 | Implemented | `movePackageToPreamble` in `latex-autofix.ts` |
| R12a-c | Implemented | `lib/latex-reserved.ts`, `lib/latex-active.ts` |
| R12d, R13-R17 | Proposed | not started |

**Verification.** A document with all five mistakes (missing `\end{document}`,
`_` in `\texttt`, `&`, `#`, and a `\usepackage` after `\begin{document}`) was
compiled with MiKTeX pdfLaTeX, repaired from the real log in one pass, and
recompiled to a PDF with zero errors. Cascade errors such as `Extra }, or
forgotten $` vanished once their causes were fixed, so they need no rule.

**What the real run corrected.** The first R12a design anchored on a context
that ends with the offending character. The real log printed
`l.3 See \texttt{my_file}`: TeX had already read the whole argument. The
`&`, `#` and `\usepackage` anchors did match real output (`l.5 The R&`,
`l.7 costs #`, `l.9 \usepackage`). Lesson for the remaining proposals: confirm
each anchor against a real log before writing the rule; hand-written logs
encode the author's assumption.

**Mutation checks.** Disabling each guard in turn (prose-environment
whitelist, definition guard, `\texttt` guard, symptom check for R9,
already-loaded check for R11) made at least one test fail. The
context-matching guard is redundant with the later character check, so
removing it alone changes nothing; it stays as defence in depth.
