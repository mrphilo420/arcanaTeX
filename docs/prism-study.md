# Prism: a functional teardown

A study of `prism.openai.com` (OpenAI's LaTeX workspace, Jan 2026 – Jan 2027),
based on a full client capture made on 1 Nov 2026, plus a live run of arcanaTeX
for comparison.

The question this document answers is narrow and practical:

> arcanaTeX has more features on paper. Why does Prism feel like a product and
> arcanaTeX feel like a prototype?

The short answer: **Prism is not better because it has more features. It is
better because every async path in it has an explicit state, a visible
transition, and a recovery.** The feature surface is smaller than ours.

---

## 1. What Prism actually is

- A Next.js 16.3.3 App Router client (Turbopack, React 19, Tailwind, Radix).
- Monaco as the editor, with a **real language server** attached.
- **One project sandbox per project** that owns: the files, the TeX toolchain,
  the language server, and the Codex agent.
- Yjs for realtime co-editing, with IndexedDB persistence.
- Server-side version history.
- A Codex agent that edits the project through a shell, not through a chat
  transcript.

Everything else — Zotero, arXiv, voice, paper review, Beamer — is a feature on
top of that core. The core is what makes it usable.

---

## 2. The eight mechanisms that make it work

### M1 — One sandbox per project, shared by compile, LSP and agent

Prism does **not** stream the project to a compile endpoint per keystroke. Each
project gets a sandbox with a real filesystem. The client talks to it through a
proxy:

```
/s/sandboxes/proxy          # authenticated proxy to the sandbox
/s/sandbox-resources        # files/artifacts
/s/codex_v2_*               # agent workspace
```

The client keeps that sandbox alive with activity-based keepalive
(`noteActivity()`), exposes `ensureSandboxConnection({ forceFresh })`, and
handles rate limiting with a countdown (`sandboxRetryCountdown`) rather than a
dead end.

Why it matters: compile, diagnostics, and AI all see **the same files** at the
same time. There is no reconciliation step, and no "the model edited file A but
the editor still has file A open" class of bug.

### M2 — An explicit compile state machine

The PDF pane is driven by four enums, not booleans.

```ts
BackendStatusType  = { NotConnected, Connecting, Connected, ErrorConnecting }
PdfRenderError     = { Aborted, NoPDF, ServerError, NoURL, NotConnected, DownloadFailed }
ConnectionStatus   = { Connected, Syncing, Disconnected, ErrorConnecting, Empty }
LoadingMode        = { initializing, compiling, downloading, retrying, preview }
```

Plus a reducer with explicit phases:

```ts
idle → provisioning → syncing → ready → error
```

with `desiredConnection`, `previouslyConnected`, `rendering`, `renderPhase`,
`shouldRetry`, `retryAt`, `userDiagnostics`.

The UI derives everything from that:

- `compileButtonLabel()` returns `Compile`, `Compiled`, `Initializing…`,
  `Compiling…`, `pdfDownloading`, `pdfDownloadRetrying`, `reconnect`, or
  `sandboxRateLimitedTitle` — one function, no scattered `if (loading)`.
- **The last successful PDF stays on screen while a new compile runs.** Freshness
  is a separate flag (`isPdfFresh`), so the UI can say "stale" without blanking
  the pane.
- Aborting a compile restores the previous successful render instead of showing
  an error.
- Logs are kept separately: `pdfTexLog`, `latexmkLog`, `bibTexLog`.
- Invalid filenames are a **terminal, explanatory** state that blocks compile
  with a reason, not a generic failure.
- A "no attempt to render" state is distinguished from "render failed".
- Progress is asymptotic (`p += (100 - p) / 5`, capped at 95) so it never
  finishes before the work does.

### M3 — A language server, not just a compile log

Prism bundles `vscode-languageclient`-style machinery:
`MonacoLspClient`, `WebSocketTransport`, `createTransportToWorker`,
`textDocument/publishDiagnostics`, semantic tokens, completion, and
`workspace/executeCommand`.

Diagnostics arrive as **live editor markers** (`monaco.editor.setModelMarkers`)
before you compile. The compile log is a second, complementary source.

This is the single largest UX difference between Prism and a CodeMirror editor
with `codemirror-lang-latex`: ours is syntax highlighting, theirs is a language
service.

### M4 — SyncTeX both ways

`syncTexViewResults` maps PDF click → source line, and source → PDF location.
It is wired into the PDF page component directly, not bolted on as a button.

### M5 — The AI split: live editor state in, project edits through a workspace

This is the most instructive part.

Prism's AI has **two tool surfaces**.

**Client tools** (small, read the user's live editor):

```
getOpenFile, getSelectedText, getFileContent, getWordCount,
listProjectFiles, getDocumentLogs, getDocumentIssues,
openFile, createNewFile, suggestDiffs, returnSuggestedPrompts, runCommand
```

**Agent workspace** (server-side Codex, real filesystem):

```
apply_patch, rg/grep, ls/find/glob, cat/sed/head/tail, exec/bash
```

The agent runs in the sandbox; the client polls a `turn_state`:

1. `response_with_tools_start` → `{ request_id, turn_state, codex_listen_snapshot }`
2. `response_with_tools_status` with `turn_state`
3. while `pending`, the server streams `codex_live_progress`:
   `{ reasoningSummaries[], toolCalls[{ name, call_type, arguments_preview, source }] }`
4. the client synthesises progress lines from tool names:
   *"Explored 3 files" · "Searched" · "Read 4 files" · "Editing in my workspace" · "Running a command"*
5. when done, the workspace diff becomes a **merge panel** with per-hunk
   Keep/Undo, `auto-apply pending`, and conflict messages that name the file and
   the reason.

Two consequences:

- **The prompt stays small.** Prism never pastes the manuscript into the system
  prompt. The model reads what it needs. arcanaTeX does the opposite and pays
  for it (see §4, D1).
- **Long work is interruptible and reviewable.** The turn is a job with
  progress, not a stream that either finishes or dies.

### M6 — Collaboration is a CRDT, with a local database

`Y.Doc` + `y-websocket` + `y-indexeddb`, per-document client tokens minted from
an auth endpoint, awareness for presence, heartbeat, connection timeout, and
exponential backoff reconnect (`3s * min(10, 1.1^retries)`, then `500ms * …`).
`browserRecoveryPendingConnection` / `local copy recovered` handles the case
where the server is unreachable but the browser has the document.

### M7 — Version history is automatic and server-side

Wording from the product, verbatim:

> Versions are saved automatically in the background, not when you compile. A
> new version is created after meaningful editing activity or a short pause, and
> duplicate no-change versions are skipped.

Server actions include `mintVersionHistoryEntryFromCompile`, so a compile can
also mint a revision. Restores are explicit (`restoreVersionHistoryEntry`) and
represented as a new revision ("Revert of Version N"), not a destructive
rewind.

### M8 — A defensive product shell

- Retries split into two regimes: quick retries (`3s`, capped, 4 attempts) then
  slow retries (`30s` doubling to `120s`), with jitter (`0.9–1.0`).
- Error taxonomy with codes and request IDs surfaced to the user.
- Transient render errors are distinguished from terminal ones
  (`isTransientPdfRenderError` vs `isPdfPaneRenderableError`).
- Maintenance mode, shutdown notices, migration guides, export with a progress
  bar — the unglamorous states are designed, not defaulted.

---

## 3. Side-by-side

| Concern | Prism | arcanaTeX today |
| --- | --- | --- |
| Compile state | 4-status + 6-error + 5-loading state machine | `isCompiling`, `compileError`, `pdfData` |
| Stale PDF | kept, marked stale | **nulled on any error** (`setCompileError`) |
| Diagnostics | LSP markers + compile log | compile log only |
| PDF ↔ source | SyncTeX both directions | none |
| Editor | Monaco + language server | CodeMirror + `codemirror-lang-latex` |
| AI input | client tools read live state; prompt stays small | whole project context pushed into the system prompt |
| AI edits | Codex workspace + per-hunk merge | `propose_patch` + patch dialog (**good, keep this**) |
| Collab | Yjs CRDT + IndexedDB | whole-project JSON snapshot, last-write-wins |
| Versions | automatic, server-side, on idle + compile | manual, 30 max, local |
| Compile runtime | warm per-project sandbox | spawn per request in `apps/latex-api` |

Two of ours are already better and should not be touched: the **approval-gated
patch flow** and the **local-first project library**.

---

## 4. What a live run of arcanaTeX actually shows

Measured against `localhost:3100` (web) and `localhost:3001` (latex-api) on
2 Nov 2026.

### D1 — Chat is dead out of the box

Default model is `qwen/qwen3.8-27b` on Groq's on-demand tier.

```
Request too large for model `qwen/qwen3.8-27b` ... (ITPM):
Limit 7000, Requested 7022
```

The request breakdown

| Part | Size |
| --- | --- |
| system prompt | 6,249 chars (~1,560 tok) |
| 15 client tool schemas | 9,554 chars (~2,390 tok) |
| 3 server tools added server-side | not counted client-side |
| user message | 2 chars |

The app's own prompt + tool schemas exceed the default model's per-minute
budget. **Every first message fails**, by roughly 20 tokens.

### D2 — The failure is invisible

`app/api/chat/route.ts` maps 413 to:

> "The editor context was compacted automatically; try sending the message
> again or choose a model with a larger context window."

Nothing was compacted, and retrying cannot help. The stream emits
`{"type":"error"}`; the thread renders **no assistant message at all**. The only
signal is a toast that auto-dismisses. From the user's seat: type, send, nothing.

### D3 — The last good PDF is destroyed on error

```ts
setCompileError: (error) => set({ compileError: error, pdfData: null })
```

Prism's `isPdfFresh` exists precisely to avoid this.

### D4 — The PDF worker is a hard CDN dependency

```ts
pdfjs.GlobalWorkerOptions.workerSrc =
  `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
```

Protocol-relative, fetched from unpkg at runtime. This contradicts the
local-first claim and makes the core loop depend on a third party.

### D5 — No SyncTeX, no LSP

`synctex` appears only in import/submission string handling. There is no
language server.

### D6 — Collaboration is not CRDT

`use-project-sync.ts` sends the entire project as a JSON snapshot on every
change. Two people typing produce clobbering, not merging.

### D7 — Versions are manual

`createProjectVersion()` is called from the inspector and before agent edits.
Nothing mints a version on idle or on compile, so "restore" is only as good as
the user's discipline.

### What does work

Compile → PDF → preview works end to end (verified with both `tectonic` and
MiKTeX), the patch/approval flow is sound, and the project library is real. The
foundation is fine; the failure modes are at the edges.

---

## 5. Rebuild plan

Ordered by "how much of the product does this unblock per unit of work".
Slices 1–3 are the difference between "demo" and "usable".

### Slice 1 — Make the default path survive (hours)

1. **Trim the request.** Move `CODE_EXECUTION_GUIDE` and `PROOF_GOLF_GUIDE` out
   of the always-on system prompt and append them only when the active file is
   Python/R/Lean or the user asks for a figure/proof. Send the long tail of tool
   schemas only for the matching file kind.
2. **Preflight the budget.** Count tokens before the call; if over, drop the
   least relevant context (main-document excerpt → file list → history) and say
   so in the thread.
3. **Pick a default that fits.** A curated Groq model whose ITPM is not 7k, or
   make the picker's first run explicit.
4. **Render errors inline.** An `error` part in the stream must append an
   assistant message with a retry action; keep the toast for background
   failures only.
5. **Never null the PDF.** Add `isPdfFresh`.

Acceptance: a fresh project sends "hi" and gets a reply; unplug the model and
the thread shows a specific, actionable error next to the message.

### Slice 2 — Compile state machine (1–2 days)

Port `§M2` wholesale: `BackendStatusType`, `PdfRenderError`, `renderPhase`,
`retryAt`, `shouldRetry`, `userDiagnostics`, plus a single
`compileButtonLabel()` derivation. Replace `isCompiling`/`compileError`.
Keep the previous PDF, expose `isPdfFresh`, and make abort restore it.

Acceptance: killing the latex-api mid-compile leaves the last PDF visible with a
"reconnecting…" state and a working retry, not a blank pane.

### Slice 3 — Editor intelligence (3–5 days)

Two options, in order of cost:

- **Cheap:** reuse the compile log as you do now, but add an on-type
  environment/brace/reference checker in a worker. Gets 70% of the perceived
  value of an LSP.
- **Real:** run `texlab` inside `apps/latex-api` per project and speak LSP over
  a WebSocket into CodeMirror (`@codemirror/lsp-client` or a small adapter).
  Add SyncTeX from `latex-api` (`-synctex=1`, parse `.synctex.gz`) for
  click-to-source and source-to-PDF.

Acceptance: an undefined `\ref` is underlined before compiling; clicking the PDF
puts the caret on the right line.

### Slice 4 — AI architecture (1 week)

Keep `propose_patch` as the write path. Change the read path:

- Stop pasting the manuscript into the system prompt. Keep the prompt to
  project metadata + active file path + selection.
- Give the model `list_project_files`, `read_project_file`, `search_project`
  (already exist) and let it fetch, instead of pre-loading.
- Add a **turn progress** surface: show which tools ran, in order, with counts.
  This is what makes a 40-second agent turn feel alive instead of hung.
- Auto-mint a version at the start of every agent turn.

Acceptance: the same request that now 413s runs on a 7k-ITPM model, and the user
can see what the agent is doing.

### Slice 5 — Collaboration as CRDT (3–5 days)

Replace snapshot sync with Yjs: one `Y.Doc` per project, a `Y.Text` per file,
`y-indexeddb` for local persistence, the existing Hono `sync.ts` as the relay.
Keep the token-per-room auth. Migrate existing projects on first open.

Acceptance: two browsers typing in the same paragraph converge without loss.

### Slice 6 — Automatic history (1–2 days)

Mint a version after N seconds of settled editing, dedupe no-change versions,
mint one on every successful compile. Move the cap off 30, or make it a rolling
window per project rather than per library.

---

## 6. Reference: Prism constants worth copying

```
BackendStatusType  NotConnected=0 Connecting=1 Connected=2 ErrorConnecting=3
PdfRenderError     Aborted=0 NoPDF=1 ServerError=2 NoURL=3 NotConnected=4 DownloadFailed=5
ConnectionStatus   Connected Syncing Disconnected ErrorConnecting Empty
RenderPhase        compiling downloading retrying preview
Reconnect (auth)   3s * min(10, 1.1^retries)
Reconnect (socket) 500ms * min(10, 1.1^retries), 3 attempts per cycle
Retry (status)     fast 3s→10s (4 tries), slow 30s→120s, jitter 0.9–1.0
Progress           p += (100 - p) / 5, capped at 95
Editor             Monaco + LSP over WebSocket; Monaco is ~3.5 MB with the
                   LaTeX completion database
```

---

## 7. One-paragraph summary

Prism wins on state handling, not features. Every risky operation — compiling,
rendering, connecting, agent turns — is modelled as an explicit machine with a
visible current state, a reason for that state, and a way out. Its AI is a
workspace agent that reads before it writes, and every write lands in a review
panel. arcanaTeX has the better *ideas* (local-first, approval gating, Lean,
TikZ) but drives them with booleans and one-shot promises, and its default model
cannot fit its own prompt — so the first thing a new user does fails silently.
Fix the state machines and the AI input strategy, and the feature lead starts to
show.
