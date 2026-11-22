# Anchored Edits (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI edit tools address text by content instead of character offsets, first-match, or line numbers, through a pure, tested module.

**Architecture:** A pure module `lib/ai/file-edits.ts` (anchor, apply, invert) with no store or DOM. A second pure module `lib/ai/edit-requests.ts` turns tool input into a ready-to-apply result for `find_and_replace` and `propose_patch`. The tools in `latex-tools.tsx` and `proof-tools.tsx` call those and then the store. No approval gate, review UI, or undo yet (slices 2-4).

**Tech Stack:** TypeScript, zod, vitest (node environment, `apps/web/lib/**/*.test.ts`), Zustand store `stores/document-store.ts`.

**Spec:** `docs/superpowers/specs/2026-10-28-chat-revise-design.md` (sections "Core: a pure edit module" and Slice 1).

## Global Constraints

- Package is `@open-prism/web`; run tests with `pnpm --filter @open-prism/web test` and types with `pnpm --filter @open-prism/web typecheck`.
- Edits are addressed by text; a match returns `ok`, `not_found`, or `ambiguous`. Never silently pick one.
- CRLF is normalized once, inside `file-edits.ts`. A file that contained `\r\n` is written back with `\r\n`.
- `invertEdit` must refuse (`conflict`) when current text no longer contains the applied `after` at the anchor. It never restores snapshots.
- Multi-edit application is atomic per file: validate all anchors first, then apply, or change nothing.
- No code copied from Oleafly (AGPL). Ideas only.
- The working tree has many unrelated uncommitted changes. Commit only the files named in each task (`git add <paths>`), never `git add -A`.
- Existing tests, including `lib/chat-skills/mathematical-prover.test.ts`, must keep passing.

## Review Focus

- `find` text written with LF against a CRLF file must match, and the file must stay CRLF afterwards (Task 1).
- Empty `find` must be rejected, not match everywhere (Task 1).
- A `find` that spans several lines, and one that is a fragment of a line, must both work (Tasks 1, 3).
- Two edits whose matches overlap must fail without changing anything (Task 1).
- `find` equal to `replace` must be reported as a no-op, not as success (Task 2).
- An ambiguous match must tell the model how many places and which lines, so it can add context (Task 2).
- `propose_patch` with `oldText` must still produce a correct `before`/`after` when `oldText` is a fragment in the middle of a line (Task 3).

---

### Task 1: Pure edit module

**Files:**
- Create: `apps/web/lib/ai/file-edits.ts`
- Test: `apps/web/lib/ai/file-edits.test.ts`

**Interfaces:**
- Produces (all exported from `@/lib/ai/file-edits`):
  - `normalizeEol(text: string): string` converts `\r\n` and lone `\r` to `\n`.
  - `type EditSpec = { find: string; replace: string; contextBefore?: string; contextAfter?: string; replaceAll?: boolean }`
  - `type AnchorResult = { ok: true; start: number; end: number } | { ok: false; reason: "empty_find" } | { ok: false; reason: "not_found" } | { ok: false; reason: "ambiguous"; count: number; lines: number[] }` where `lines` are 1-based line numbers of each match, in the normalized text.
  - `anchorEdit(content: string, spec: Pick<EditSpec, "find" | "contextBefore" | "contextAfter">): AnchorResult`. Offsets refer to `normalizeEol(content)`. With `contextBefore`/`contextAfter`, only occurrences of `find` immediately preceded/followed by that text count.
  - `type AppliedEdit = { start: number; end: number; before: string; after: string }` where `before` is the text that was replaced, `after` is the text inserted, and `start`/`end` are offsets in the normalized RESULT content, so `end === start + after.length` (account for the length change of every earlier edit in the same call). `invertEdit` relies on this.
  - `type ApplyResult = { ok: true; content: string; applied: AppliedEdit[] } | { ok: false; reason: "empty_find" | "not_found" | "ambiguous" | "overlap"; editIndex: number; count?: number; lines?: number[] }`
  - `applyEdits(content: string, edits: EditSpec[]): ApplyResult`. Anchors every edit against the original content, rejects overlaps, then applies back to front. `replaceAll: true` turns one spec into every non-overlapping occurrence. Result `content` uses `\r\n` if the input contained `\r\n`.
  - `invertEdit(current: string, applied: AppliedEdit): { ok: true; content: string } | { ok: false; reason: "conflict" }`. Succeeds only if `normalizeEol(current).slice(applied.start, applied.start + applied.after.length) === applied.after`.
  - `offsetsToLineRange(content: string, start: number, end: number): { startLine: number; endLine: number }` 1-based, inclusive, on the normalized text; `end` is exclusive, and an empty range reports its start line for both.
  - `resolveProjectFile<T extends { path: string; name: string }>(files: T[], target: string): T | undefined` matches by exact path, by name, or by path suffix `/${target}` (the rule `propose_patch` uses today).

- [ ] **Step 1: Write the failing tests** in `file-edits.test.ts` (import from `@/lib/ai/file-edits`). Names and assertions:
  - `anchorEdit returns ok with offsets for a unique match`: `anchorEdit("a\\nfoo\\nb", {find:"foo"})` equals `{ok:true,start:2,end:5}`.
  - `anchorEdit reports not_found`: `{ok:false,reason:"not_found"}`.
  - `anchorEdit rejects an empty find`: `{ok:false,reason:"empty_find"}`.
  - `anchorEdit reports ambiguity with count and lines`: content `"x\\nfoo\\nfoo\\n"` gives `{ok:false,reason:"ambiguous",count:2,lines:[2,3]}`.
  - `anchorEdit disambiguates with contextBefore/contextAfter`: content `"A foo\\nB foo\\n"`, `find:"foo", contextBefore:"B "` is ok at the second match; `contextAfter:"\\n"` alone is still ambiguous.
  - `anchorEdit matches LF find against CRLF content`: content `"a\\r\\nfoo\\r\\nb"` with `find:"a\\nfoo"` is ok.
  - `applyEdits replaces a multi-line find`: result content equals the expected string and `applied[0].before === "a\\nfoo"`.
  - `applyEdits keeps CRLF`: CRLF input stays CRLF in `content` (no bare `\\n`).
  - `applyEdits is atomic`: edits `[ok edit, missing edit]` returns `{ok:false,reason:"not_found",editIndex:1}` and the input string is unchanged (assert the returned object has no `content`).
  - `applyEdits rejects overlapping edits`: two specs whose matches intersect return `reason:"overlap"`.
  - `applyEdits replaceAll applies every occurrence`: three occurrences give three `applied` entries and no remaining `find`.
  - `invertEdit undoes a clean edit`: apply then invert returns the original (normalized) content.
  - `invertEdit succeeds after an unrelated later edit elsewhere`: edit line 1, then user appends text at the end; inverting leaves the appended text.
  - `invertEdit reports conflict when the edited text changed`: returns `{ok:false,reason:"conflict"}`.
  - `offsetsToLineRange` for a range inside line 2 gives `{startLine:2,endLine:2}`; for a range crossing two lines gives `{startLine:2,endLine:3}`.
  - `resolveProjectFile` matches by path, by name, and by suffix, and returns `undefined` otherwise.

- [ ] **Step 2: Run to verify it fails.**
  Run: `pnpm --filter @open-prism/web exec vitest run lib/ai/file-edits.test.ts`
  Expected: FAIL (module not found).

- [ ] **Step 3: Implement the module** in `apps/web/lib/ai/file-edits.ts` with the signatures above. Approach: normalize content and spec strings with `normalizeEol`, find occurrences with `indexOf` in a loop (advance by `find.length` so occurrences do not overlap), filter by context, compute `lines` by counting `\n` before each offset. In `applyEdits`, collect resolved ranges for all edits, sort by `start`, reject if any range's `start` is less than the previous `end`, then splice from the last range to the first.

- [ ] **Step 4: Run to verify it passes.**
  Run: `pnpm --filter @open-prism/web exec vitest run lib/ai/file-edits.test.ts`
  Expected: PASS, all tests.

- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/lib/ai/file-edits.ts apps/web/lib/ai/file-edits.test.ts
  git commit -m "Add a pure anchored edit module for AI file edits"
  ```

---

### Task 2: Anchored `find_and_replace`

**Files:**
- Create: `apps/web/lib/ai/edit-requests.ts`
- Test: `apps/web/lib/ai/edit-requests.test.ts`
- Modify: `apps/web/components/workspace/editor/latex-tools.tsx` (the `find_and_replace` tool, ~lines 98-141, and the `findAndReplace` selector at line 20)
- Modify: `apps/web/stores/document-store.ts` (remove `findAndReplace` from the interface at line 217 and the implementation at ~691-706; `latex-tools.tsx` is its only caller)

**Interfaces:**
- Consumes: `applyEdits`, `resolveProjectFile`, `EditSpec` from Task 1.
- Produces (exported from `@/lib/ai/edit-requests`):
  - `type FindAndReplaceInput = { find: string; replace: string; path?: string; replaceAll?: boolean; contextBefore?: string; contextAfter?: string }`
  - `type FileLike = { id: string; path: string; name: string; type: string; content?: string | null }`
  - `planFindAndReplace(files: FileLike[], activeFileId: string, input: FindAndReplaceInput): { success: true; fileId: string; filePath: string; newContent: string; replacements: number } | { success: false; error: string }`

- [ ] **Step 1: Write the failing tests** in `edit-requests.test.ts`:
  - `uses the active file when path is omitted`: returns `fileId` of the active file and the replaced content.
  - `targets another file by path`: `path:"chapters/two.tex"` edits that file, not the active one.
  - `errors when the file is not found`: `error` contains `File not found: nope.tex`.
  - `errors on a binary file`: `type:"image"` gives `error` containing `Cannot edit a binary file`.
  - `errors when find is not found`: `error` contains `Could not find`.
  - `reports ambiguity with count and lines`: two matches gives `error` containing `matches 2 places` and `lines 2, 3` and `contextBefore`.
  - `replaceAll replaces every match and reports the count`: `replacements === 3`.
  - `rejects a no-op`: `find === replace` gives `error` containing `identical`.
  - `keeps CRLF`: CRLF file edited with an LF `find` returns content containing only `\r\n` line breaks.

- [ ] **Step 2: Run to verify it fails.**
  Run: `pnpm --filter @open-prism/web exec vitest run lib/ai/edit-requests.test.ts`
  Expected: FAIL (module not found).

- [ ] **Step 3: Implement `planFindAndReplace`** in `edit-requests.ts`. Resolve the file with `resolveProjectFile` (or the active file by id when `path` is absent). Only `type === "tex"` is editable (same text check `propose_patch` uses). Call `applyEdits` with one `EditSpec`; map each failure reason to the error texts asserted above.

- [ ] **Step 4: Run to verify it passes.**
  Run: `pnpm --filter @open-prism/web exec vitest run lib/ai/edit-requests.test.ts`
  Expected: PASS.

- [ ] **Step 5: Wire the tool.** In `latex-tools.tsx`, extend the `find_and_replace` zod schema with optional `path`, `replaceAll` (boolean), `contextBefore`, `contextAfter` (each with a `.describe` telling the model when to use it), update the tool description to say the match must be unique unless `replaceAll` is set, call `planFindAndReplace(state.files, state.activeFileId, input)` using `useDocumentStore.getState()`, and on success call `updateFileContent(fileId, newContent)`. Return `{ success: true, message, replacements }`. Remove the `findAndReplace` selector (line 20) and the store method and its interface entry.

- [ ] **Step 6: Typecheck and run the whole suite.**
  Run: `pnpm --filter @open-prism/web typecheck && pnpm --filter @open-prism/web test`
  Expected: no type errors; all tests pass.

- [ ] **Step 7: Commit**
  ```bash
  git add apps/web/lib/ai/edit-requests.ts apps/web/lib/ai/edit-requests.test.ts apps/web/components/workspace/editor/latex-tools.tsx apps/web/stores/document-store.ts
  git commit -m "Make find_and_replace anchored, multi-file, and unambiguous"
  ```

---

### Task 3: Anchored `propose_patch`

**Files:**
- Modify: `apps/web/lib/ai/edit-requests.ts`
- Modify: `apps/web/lib/ai/edit-requests.test.ts`
- Modify: `apps/web/components/workspace/editor/proof-tools.tsx` (`patchParameters` at line 39, the `propose_patch` tool at ~326-390)

**Interfaces:**
- Consumes: `anchorEdit`, `offsetsToLineRange`, `normalizeEol` from Task 1.
- Produces (exported from `@/lib/ai/edit-requests`):
  - `type PatchInput = { startLine?: number; endLine?: number; replacement: string; oldText?: string }`
  - `planPatch(content: string, input: PatchInput): { ok: true; startLine: number; endLine: number; before: string; after: string } | { ok: false; error: string }`
  - With `oldText`: `replacement` substitutes exactly `oldText`. The range is the whole lines containing the match, `before` is those lines, `after` is those lines with the match replaced; `startLine`/`endLine` inputs are ignored. Without `oldText`: both lines are required and `after` is `replacement` (current behavior).
  - Error texts, unchanged from today where they exist: `endLine must be >= startLine.`, `Patch is too large to review safely.` (range over 300 lines), `Line range is outside the file (<n> lines).`, `The replacement is identical.` New: `Provide oldText or both startLine and endLine.`, `oldText was not found in the file.`, `oldText matches <n> places (lines <a>, <b>). Include more surrounding text.`

- [ ] **Step 1: Write the failing tests** in `edit-requests.test.ts`:
  - `line-range patch behaves as before`: `{startLine:2,endLine:2,replacement:"X"}` on `"a\\nb\\nc"` gives `before:"b"`, `after:"X"`.
  - `rejects a reversed range`, `rejects a range outside the file`, `rejects a range over 300 lines`, `rejects an identical replacement` with the error texts above.
  - `requires oldText or both lines`: `{replacement:"X"}` gives the `Provide oldText...` error.
  - `oldText anchors to whole lines`: content `"a\\nb\\nc"`, `oldText:"b"` gives `startLine:2,endLine:2`.
  - `oldText as a mid-line fragment keeps the rest of the line`: content `"let x := foo bar\\n"`, `oldText:"foo"`, `replacement:"baz"` gives `before:"let x := foo bar"` and `after:"let x := baz bar"`.
  - `multi-line oldText spans lines`: gives `startLine:2,endLine:3`.
  - `oldText ignores stale line numbers`: lines point elsewhere but the result matches `oldText`.
  - `reports not found and ambiguity`: error texts above, ambiguity includes the line numbers.

- [ ] **Step 2: Run to verify it fails.**
  Run: `pnpm --filter @open-prism/web exec vitest run lib/ai/edit-requests.test.ts`
  Expected: FAIL (`planPatch` not defined).

- [ ] **Step 3: Implement `planPatch`** in `edit-requests.ts`, moving the existing validations out of the tool. Work on `normalizeEol(content)`; derive `startLine`/`endLine` from `offsetsToLineRange` and slice whole lines for `before`.

- [ ] **Step 4: Run to verify it passes.**
  Run: `pnpm --filter @open-prism/web exec vitest run lib/ai/edit-requests.test.ts`
  Expected: PASS.

- [ ] **Step 5: Wire the tool.** In `proof-tools.tsx`, make `startLine`/`endLine` optional in `patchParameters`, add `oldText: z.string().min(1).max(40_000).optional()` with a `.describe` saying it is the exact current text to replace and is preferred over line numbers, and add a `.refine` that requires `oldText` or both lines. Replace the inline validation and `before`/`after` computation (lines ~345-366) with `planPatch(file.content ?? "", input)`, use its `startLine`/`endLine`/`before`/`after` in `usePatchStore.getState().propose(...)`, and use `resolveProjectFile` for the file lookup (lines ~333-338). Update the tool description to recommend `oldText`. Keep the `file.type !== "tex"` check and the `File not found` message.

- [ ] **Step 6: Typecheck and run the whole suite.**
  Run: `pnpm --filter @open-prism/web typecheck && pnpm --filter @open-prism/web test`
  Expected: no type errors; all tests pass, including `mathematical-prover.test.ts`.

- [ ] **Step 7: Commit**
  ```bash
  git add apps/web/lib/ai/edit-requests.ts apps/web/lib/ai/edit-requests.test.ts apps/web/components/workspace/editor/proof-tools.tsx
  git commit -m "Let propose_patch anchor by text instead of line numbers"
  ```

---

## Self-review notes

- Spec coverage for slice 1: anchoring module with tests (Task 1), anchored `find_and_replace` (Task 2), `propose_patch` gains `oldText` with line numbers as fallback (Task 3). The gate, review UI, Keep-race fix, editor minimal-diff sync, and undo are slices 2-4 by design.
- The `invertEdit` function is built and tested here but has no caller until slice 4. Inverting several edits from one `applyEdits` call must go last-to-first, or re-anchor each by its `after` text; slice 4 owns that.
- Add one test to Task 1: `applyEdits records offsets in the result content` — two edits where the first changes length; `result.content.slice(applied[1].start, applied[1].end) === applied[1].after`.
- Not in this slice: `replace_selection` still uses offsets (slice 3 routes it through the gate and re-anchors it); the replaceAll prompt threshold of 20 matches (slice 3).
