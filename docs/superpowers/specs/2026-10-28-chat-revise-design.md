# Chat-and-revise: tracked, undoable AI edits in arcana-tex

Status: draft for approval. Date: 2026-10-28.

## Intent

The chat should work like Prism's chat-and-revise: the user talks about the
document they have open, the assistant changes the real files, and the user
reviews those changes as diffs. Today only the `/prove` flow reviews anything.
In normal chat, `insert_latex`, `replace_selection`, `find_and_replace` and
`write_project_file` change files immediately with no record, no undo, and
fragile addressing (character offsets, first-match replace, line numbers).

This is also the foundation for a later, larger project: a local-first
workspace for LaTeX, Lean 4 and a bench of models where every AI change is
tracked and reversible. Decisions here should not block that.

## Decided with the user

- **Default is auto-apply.** Edits land immediately, tracked and undoable.
  The user wants to be interrupted only at checkpoints, not per edit.
- Both selection rewrites and paper-wide edits must work.
- Ideas are borrowed from Oleafly (AGPL-3.0). Ideas and designs only. No code
  is copied, because arcana-tex is MIT.

## Interpretation of "checkpoint" (the PM's call, to be confirmed)

A checkpoint is a moment the user is shown something, not a per-edit prompt:

1. At the end of an assistant turn: one line, "N files changed, +A -D", with
   Review and Undo all.
2. Before the first change of a turn: a project version snapshot is taken
   (the existing `createProjectVersion`).
3. A blocking prompt appears only for: a conflict (the user's text changed
   under a proposed edit and cannot be re-anchored), or an action that is
   destructive or hard to reverse (deleting a file, overwriting a whole file).
4. A single global switch (stored in this browser's localStorage, with a
   chat-header toggle) changes the mode to "ask before every edit", for when
   the user wants the stricter behavior. Not per-project.

## Goals

- Every AI-initiated change to a project file passes one chokepoint, so it can
  be recorded, reviewed and undone.
- Edits are addressed by text, not by offsets or line numbers, and report
  not-found or ambiguous instead of silently picking one.
- Undo reverses exactly the AI's edits and never destroys the user's later
  edits.
- Multi-file edits are atomic: all anchors are validated before any file is
  written.
- Lean patches are accepted only when `check_lean_candidate` proved the
  candidate. Enforced in code, not only in the prompt.
- Reviewing hunks is pleasant: inline in the editor, keyboard-driven.

## Non-goals (this project)

- Isolated-copy research tasks, ACP/CLI agents, OS sandboxing, MCP/CLI
  surfaces, a Rust rewrite.
- An `AiToolsHost` port abstraction. There is one host (the browser). Extract a
  port only when a second runtime (latex-api, a CLI) must run the same tools.
- Shell and network risk classes. Only `read` and `write` exist client-side;
  leave room in the type.
- Real-time collaboration.

## Anti-goals (failure even if it technically works)

- An edit that overwrites text the user typed after the proposal.
- Undo that restores a whole-file snapshot and loses manual edits.
- The model told "applied" when nothing was applied, or retrying a change the
  user declined.
- A gate that rubber-stamps stale proposals because anchoring was skipped.
- Remote sync silently erasing pending changes or invalidating undo.

## Design

### Core: a pure edit module (`apps/web/lib/ai/file-edits.ts`)

No store, no DOM. Functions:

- `anchorEdit(content, { find, contextBefore?, contextAfter? })` returns
  `ok {start,end}`, `not_found`, or `ambiguous`.
- `applyEdits(content, edits[])` is atomic per file and handles overlaps.
- `invertEdit(current, applied)` returns the reverted content, or `conflict`
  when `current` no longer contains the applied `after` at the anchor.
- Line-ending normalization (CRLF) happens here, once.

`propose_patch` keeps its line numbers as a hint and gains an `oldText`
anchor. `find_and_replace` gains an optional `path` and requires a unique
match unless `replaceAll` is set.

### Gate: `apps/web/stores/approval-store.ts` + `lib/approval-risk.ts`

- Tool `execute` is async, so the gate awaits the decision and the model sees
  the real result (applied, declined, conflict). The `abortSignal` from the
  tool context removes a pending entry when the user stops generation.
- `classify(toolName)` returns `read` or `write`. A test asserts every
  registered write-class tool is in the classifier.
- Modes: `auto-apply` (default), `ask`. In `auto-apply`, destructive actions
  still prompt.
- A single `applyEdit(change)` helper is the only code path that mutates file
  content on behalf of the AI. It records `{turnId, toolCallId, path, before,
  after}`.
- Declined proposals return "the user declined; do not re-propose". Identical
  proposals are deduplicated by hash.

### Review UI

- Thread: the `propose_patch` and edit tool renders become an approval/summary
  card with files, hunk counts, +/- and Review / Undo all.
- Editor: pending or reviewable hunks appear inline using CodeMirror's
  `@codemirror/merge` `unifiedMergeView` (new dependency), one file at a time,
  with per-hunk accept/reject. A review-only keymap (next/prev hunk, accept,
  reject, accept file, exit) is active only during review.
- Selection rewrites (`selection-chat.tsx`) produce a one-hunk change shown at
  the selection.
- The existing modal (`patch-preview-dialog.tsx`) becomes an optional
  side-by-side expand for one hunk.
- Fix the Keep race: re-read the file after `await createProjectVersion` and
  re-verify before splicing. (Reported by a reviewer; confirm against the
  code first.)

### Turn tracking and undo

- A turn is identified by the last user message; automatic continuations are
  the same turn. `chat-runtime-provider.tsx` is where this is observed.
- `stores/agent-changes-store.ts` groups records by turn and supports
  per-change and whole-turn undo/redo using `invertEdit`.
- Remote sync (`applyRemoteSnapshot`) revalidates pending and applied records
  and drops undo entries whose `after` no longer matches.

### Lean

- `check_lean_candidate` records a hash of each candidate that returned
  `proved=true` (normalized for whitespace and CRLF). Only the tool result may
  set this, never model text.
- `propose_patch` on a `.lean` file requires the replacement to match a
  recorded candidate (first version: exact match). Otherwise it errors with
  "run check_lean_candidate first".
- The turn summary shows evidence ("sorry-free, axiom-checked at <time>") and
  Lean-specific counts: declarations changed, `sorry` and axiom counts before
  and after. A "Verify build" button runs `build_lean_project` on request.
  Keep or auto-apply never waits on a build.

### Models

- A model without tool support runs chat-only: the server sends no tools, and
  `/prove` and edit tools are disabled with an explanation.
- Later: a one-time, on-demand tool-call probe per model with
  verified / untested / blocked badges and a context chip in the picker.

### Chat limits

- `/api/chat` currently caps history at 6,500 chars, system at 7,000 chars and
  output at 2,048 tokens. Raising them is deferred until `trimHistory` is
  extracted from `route.ts` and tested (never split a tool call from its
  result).

## Slices (each shippable)

1. `file-edits.ts` with tests; anchored `find_and_replace` and `propose_patch`.
2. Gate and `applyEdit` chokepoint; queue; thread card; inline review; the Keep
   race fix; decline/dedupe/abort handling.
3. Route every write tool through the gate; Lean proved-only rule; chat-only
   mode for tool-less models.
4. Turn tracking, undo/redo, remote-sync reconciliation, Lean-aware summary.
5. Model probe and badges; plan mode; raised chat limits.

## Constraints

- Next.js app in `apps/web`; tools run client-side via `useAssistantTool`
  against the Zustand store `document-store.ts`; storage is IndexedDB via
  `idb`.
- Tests are vitest, node environment, `lib/*.test.ts`. Extract logic into pure
  functions so it is testable without components.
- Local-first: no feature may require a hosted service.

## Left to the builder

Exact store shapes, hook names, keymap bindings, card visuals, how to track
hunk positions through user edits (a `RangeSet` is the suggested approach),
and the `@codemirror/merge` integration details.

## Calls made by the PM (marked as such; change any of them)

Resolved after an independent builder review of this document.

1. **Mode scope.** Global, per browser, localStorage. Toggle in the chat header.
2. **Persistence of undo records.** In-memory for slice 4. Cross-reload safety
   comes from the per-turn `createProjectVersion` snapshot, which is already
   persisted. Persisting records is a later option; it needs revalidation on
   load because `before`/`after` for whole files are large.
3. **Editor integration (verified in code).** The store stays the source of
   truth. Today `latex-editor.tsx` (the effect that syncs `activeFileContent`)
   replaces the whole CodeMirror document on any store change, which resets the
   cursor and would make every AI edit look like a full-file rewrite. Slice 2
   changes that sync to a minimal-diff transaction (common prefix/suffix),
   annotated so it is not recorded as user typing. Files that are not open are
   written to the store only. `unifiedMergeView` takes its baseline from the
   pre-edit content held in the turn record.
4. **`/prove` and the existing modal.** Folded into the one gate. `/prove` is a
   caller of the same chokepoint, not a second approval system. The Lean
   proved-only rule applies there like everywhere else.
5. **"Destructive or hard to reverse".** Decided per call from arguments, so
   `classify` takes the tool name and its input. Prompts for: file delete,
   overwrite of an existing file by `write_project_file`, and a `replaceAll`
   touching more than 20 matches. New-file creation and overwriting a file the
   AI created earlier in the same turn do not prompt.
6. **Turn boundaries.** Regenerate and edit-earlier-message start a new turn.
   Aborting mid-turn keeps edits already applied; they remain in the turn's
   summary and can be undone.
7. **Lean candidate match.** First version requires an exact normalized match.
   If real use shows frequent near-misses, `propose_patch` may instead reference
   a recorded candidate by id.
8. **Tool-less models before the probe.** A static `supportsTools` flag in model
   preset metadata, plus a per-model user override in the model picker.
   Default for unknown models is "tools on".

Minor builder-owned details (dedupe hash scope, CRLF specifics, the
`@codemirror/merge` dependency) stay with the builder.
