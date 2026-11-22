# arcanaTeX: core-loop reliability, accounts, and telemetry

* **Author:** mrphilo420
* **Date:** 2026-11-02
* **Predecessor:** `docs/prism-study.md`
* **Status:** draft brief, pre-design

## Overview

arcanaTeX has a larger feature surface than Prism and a worse first run. The
measured failure: with the default model, the first chat message is rejected at
7,022 tokens against a 7,000 token limit, and the user is shown nothing.

The proposal under review is "make the core loop reliable": explicit compile and
chat state machines, keep the last good PDF, surface every failure with a
recovery, stop pasting the manuscript into the prompt, then add editor
intelligence.

Six fresh-context reviewers examined it against the code. The proposal as
written is wrong in three ways, and right in one.

Scope was added during review. Providers become user-configurable instead of
development-only. An account becomes required to use the hosted app, and the
account records product events that the operator reads in the dev panel. Projects
stay in the browser; server-side storage and multi-device access were considered
and deferred.

## Analysis

### 1. The token diagnosis is incomplete, so the fix targets the wrong term

The study attributed the failure to the system prompt and tool schemas. Both
numbers were client-side only. The server adds more before the call:

| Part | chars | ~tokens | share |
| --- | --- | --- | --- |
| server system prompt (`route.ts` 4,873 + Lean guide 1,148) | 6,018 | 1,685 | 24% |
| client system prompt (`use-document-context.ts`) | 6,249 | 1,749 | 25% |
| 15 client tool schemas | 9,554 | 2,674 | 38% |
| 3 server tool schemas | 3,230 | 904 | 13% |
| user message | 42 | 12 | — |

The manuscript itself is roughly 721 tokens — about 10% of the request. Deleting
it entirely still leaves the request at ~7,008 tokens. **Tool schemas are the
largest single line, and they are not in the proposal.**

### 2. "Choose a model with a larger window" is not available

All three curated Groq models are 8K TPM / 200K TPD on the free tier. The model
picker advertises "131k context" for each, which is the window, not the binding
limit. A picker entry that cannot serve the app's own prompt is a false promise.

### 3. Prompt caching is the only lever that raises throughput, and the app defeats it

Cached tokens do not count toward Groq rate limits, and the cached models are the
`gpt-oss` family — not the default `qwen/qwen3.8-27b`. The app also rebuilds the
system string whenever file content changes, so the prefix never matches and
nothing caches. Freezing the prefix and defaulting to `gpt-oss-20b` would drop
counted input per step from ~6,400 to ~1,000–1,500. That is a smaller change than
any proposed slice and it is the only one that changes the daily ceiling.

### 4. Two skills are over budget before the user speaks

`/paper-review` starts at ~5,562 tokens and `/prove` at ~8,479, with empty user
messages. They appear to fit only because a blanket 3,500-character truncation in
`route.ts` cuts every tool result, including the manuscript. The review bundle
says "all relevant sources were included" while the model receives about 4% of
the paper. Loading skill text as a tool result instead of a system append removes
this class of failure.

### 5. The chat state machine is misdiagnosed

Chat state is already owned by `useChat` / `useAISDKRuntime`. There are no chat
booleans in the store to replace. The actual defect is narrower: a stream error
produces no assistant row at all, and `chat.error` surfaces only as an
auto-dismissing toast. That is a rendering fix, not a state-machine migration.

### 6. The compile state machine is real but smaller than proposed

Porting Prism's taxonomy wholesale imports states this app cannot enter —
`NoURL`, `DownloadFailed`, `NotConnected` — and a `retryAt` with no retry
mechanism behind it. Two defects underneath are more serious than the model:

- `latestRun` is a module global. `hydrateProject` does not bump it and does not
  cancel in-flight work, so a compile started in project A can call `setPdfData`
  after the user opens project B. With a freshness flag, it would be marked
  current.
- `setCompileError` nulls `pdfData`, and the PDF pane checks the error before the
  bytes. Keeping the previous PDF requires changing both.

Four separate triggers start compiles (idle debounce, mount, compile-request id,
Enter key). Coalescing serialises requests, not state ownership.

Freshness also has no input identity today. It needs the `files` / `mainFileId` /
`compiler` captured at run start and compared at render, not a boolean.

### 7. The editor fights the writer

In a `.tex` file, `Enter` is bound at highest precedence to compile, and
`Shift-Enter` inserts a newline. With auto-compile on, every paragraph break can
trigger two compiles. This is one line of keymap and it affects daily use more
than the state machine.

### 8. Migration: keep compile state ephemeral, and fix a destructive bug first

The store is not persisted wholesale; IndexedDB receives an explicit projection.
So compile state can live purely in memory with no migration. Bumping
`DB_VERSION` would be a one-way door — IndexedDB cannot downgrade, and `getDB`
caches the rejected promise.

However, chat history is currently destroyed by a load failure: the catch sets
messages to `[]` and marks the project loaded, then the 600 ms autosave deletes
the stored record. A rolling deploy or a bad record erases conversations. This
must be fixed before anything else touches that path.

### 9. There is no way to diagnose a failure after the fact

No request id crosses the chat or compile boundary. The 413 path returns before
the `console.error`. The user has a screenshot; the server has an unrelated log
line. A single preflight log with provider, model, estimated input tokens and
headroom would have made this incident visible before a user hit it.

### 10. The repo is not currently landable

68 uncommitted entries on `main`. `lib/compile-project.ts` imports
`./coalesce`, which is untracked; CI references `.github/actions/setup`, which is
also untracked. Staging the modified files alone breaks the build. A refactor of
this size cannot be isolated until that lands.

### 11. Part of this scope is already owned

`docs/superpowers/specs/2026-10-28-chat-revise-design.md` already defines the AI
edit path (anchored edits, approval gate, per-hunk review, undo), and its slice 5
defers "raised chat limits" and model probing. The uncommitted
`agent-edits.ts` / `review-bar.tsx` / `merge-changes-card.tsx` implement it. A
second design against the same route and the same context hook will produce two
tool registries and two error paths.

### 12. texlab has no home in the current architecture

`latex-api` creates a temp directory per compile request and deletes it in a
`finally`. A language server needs a persistent per-project filesystem and
process. Building LSP now means building it twice — once against per-request temp
dirs, again when the sandbox lands. SyncTeX is the cheap part and can ship
independently.

### 13. Provider support exists, but only behind the dev panel

The multi-provider layer is already built: five API dialects (`openai-chat`,
`openai-responses`, `anthropic`, `google`, `opencode`), twelve presets (Meta,
OpenCode, Anthropic, Nous, OpenAI, Groq, OpenRouter, HuggingFace, Google,
DeepSeek, xAI, Ollama), model discovery, free-model tagging, and refresh.

None of it is reachable by a user. Configuration lives in
`.llm-providers.local.json` on the server, and every route that writes it is
gated by `isDevPanelRouteEnabled()`, which returns false in production unless
`DEV_PANEL_ENABLED=1`. `/api/ai/models` is public but only reports what the
server already has.

So "connect OpenCode or Claude" is not a new integration. It is a visibility and
storage problem: the feature exists and has no supported front door.

### 14. There is no capability metadata, so no budget can be computed

Every configured model is reported with `contextWindow: "provider"` and
`tier: "balanced"`. The picker shows a label and a "Free" tag. Nothing records
the numbers that decide whether a request will be accepted: context window, max
output, tool-call support, prompt-caching support, or the provider's rate limits.

A per-model request budget requires that metadata. Without it, the preflight can
only measure the request and guess.

### 15. A second diagnostic system will drift

`CompileDiagnostic[]` is the single source for editor markers, the inspector, the
autofix rules, and submission checks. An on-type checker that keeps its own array
produces underlines the inspector does not list. It needs a `source` field on the
existing type and one merge function with documented precedence.

### 16. Multi-device project access makes a conflict model mandatory

The current sync sends the whole project as a JSON snapshot and replaces the
receiving project wholesale. That is tolerable while the feature is opt-in and
experimental. It is not tolerable once the account promises the same project on
any device: a laptop and a phone opened on the same paper, one offline, will
resolve by whoever writes last, and the other side's work disappears without a
message.

Three levels are available:

- **Optimistic concurrency.** Each project carries a revision number. A write
  asserts the revision it started from; a stale write is rejected and the user is
  offered a diff. Cheap, correct for sequential use, poor for simultaneous
  editing.
- **Per-file versioning.** Files gain timestamps and independent writes. Reduces
  the blast radius, still cannot merge two edits to the same paragraph.
- **CRDT.** Per-file text merging with no rejected writes. Correct for
  simultaneous editing, and the only option that supports live collaboration
  later.

Whichever is chosen, "sync" stops being a feature toggle and becomes part of the
storage model. This is the largest new cost created by the multi-device decision.

### 17. Project content leaves the browser, so retention and export become requirements

The README states that projects stay in the browser. Server-side project storage
makes that false. Deployment then needs, at minimum: account deletion that
removes projects, a full export, a stated retention period, and encryption at
rest for project contents as well as keys. Prism's shutdown notice is a useful
reminder that an export path is the difference between a migration and a data
loss.

### 18. Existing browser projects need a claim path

There are projects in IndexedDB on every device already in use. Signing in must
offer to upload them, must handle the same project existing on two devices, and
must not silently discard the local copy. Neither `StoredProject` nor
`ProjectVersion` carries an origin or device identifier today, so a duplicate is
indistinguishable from a distinct project.

*Findings 16 to 18 are deferred with server-side storage. They are kept here
because the decision to revisit multi-device will reopen all three.*

### 19. A sign-up gate with no server-side benefit is the weakest version of the idea

Keeping projects local and requiring an account means the account delivers
nothing the user can see. They pay a sign-up wall to use software that could have
opened instantly, and their data does not follow them between devices. That is a
conversion cost paid entirely by the user for a benefit that accrues entirely to
the operator.

It is also removable. The project is MIT-licensed; anyone can fork the client and
delete the gate. The gate therefore only holds for the hosted deployment, which
means the business case has to survive on that deployment alone.

Ways to reduce the cost, in increasing order of effectiveness:

- Ask for an account at the point of value (first export, first share, first
  backup, first paid provider) rather than at launch.
- Offer a guest session that works fully offline and can be claimed later. The
  code already supports anonymous sessions in spirit: everything is local.
- Give the account something real even without server projects: portable
  provider settings, a settings backup, and a restore link.

### 20. Advertising data changes the privacy posture, and the repo has no consent surface

Product analytics and advertising data are different obligations. Counting
events to understand activation is ordinary operational telemetry. Building
audience segments for ad targeting is personal data processing: it needs a lawful
basis, a disclosure the user actually reads, a retention limit, and — for
third-party ad networks under GDPR — affirmative consent before any identifier is
shared. California requires an opt-out and a "do not sell or share" path.

The app currently has no privacy policy, no consent UI, and no data inventory. The
README actively promises that projects stay in the browser, which will be read as
a privacy claim.

Three shapes, cheapest first:

- **First-party product analytics.** Events into the operator's own store, seen in
  the dev panel, no third-party sharing. Lowest risk, no consent banner in most
  jurisdictions if the data is aggregate and not used for advertising.
- **First-party analytics plus an ad-partner feed.** Same events, plus identifier
  sharing for targeting. Requires consent capture, a policy, a retention rule, and
  a deletion path that reaches partners.
- **Third-party ad pixels and SDKs.** Fastest to add, highest legal and
  reputational cost, and the hardest to reconcile with a local-first product.

The dev panel already exists and is the natural place to read the numbers. What
it must not become is an unreviewed dump of personal data: anything displayed
there is also discoverable in a breach, a support export, or a subpoena.

## Goals vs. Non-Goals

### In scope

- A user can connect a provider (OpenCode, Anthropic, Google, OpenAI-compatible,
  local) without a development build, and pick a model from it.
- Each model reports the limits that decide whether a request fits, and the
  request is sized to the selected model rather than to a fixed assumption.
- An account is required to use the hosted app. Projects stay in the browser.
- The account records product events so the operator can see activation,
  retention, and feature use in the dev panel.
- A user can export every project and delete their account and its data.
- The first message succeeds on the default configuration, or fails with a
  specific, actionable message in the thread.
- A failed compile leaves the previous PDF visible and marked out of date.
- An in-flight compile can never write into a different project.
- `Enter` inserts a newline in LaTeX files.
- A failed chat-history load never deletes the stored conversation.
- Every failure is identifiable from a log line and a request id.

### Out of scope (this pass)

- Server-side project storage and multi-device access. Deferred; see
  Alternatives F.
- Prism's full compile taxonomy, retry/backoff policy, and abort plumbing.
- A chat state machine.
- texlab / LSP.
- Live multi-user collaboration.
- On-type diagnostics beyond a single merged type.

## Alternatives Weighed

### A. Port Prism's compile enums wholesale

* **Pros:** Matches the reference implementation; less design work.
* **Cons:** Imports unreachable states, and a retry model with no retry mechanism.
* **Rejected:** The app has no download, URL, or sandbox lifecycle to represent.

### B. Put the state machine in its own store or an xstate actor

* **Pros:** Smaller `document-store`; explicit transitions.
* **Cons:** Compile state is reset atomically with files in four places. A second
  store adds a second reset path and a window where project A's PDF can render
  under project B. xstate adds an actor lifecycle and a second subscription model.
* **Rejected:** A pure reducer in `lib/compile-machine.ts` plus one field on the
  existing store keeps the atomic reset and is testable in the node-only suite.

### C. Keep the document dump and raise the limits

* **Pros:** No prompt redesign.
* **Cons:** Every curated model is capped at 8K TPM. Raising limits requires a paid
  tier or a different provider, which is a product decision, not a code change.
* **Rejected as the primary fix:** Caching plus a frozen prefix raises throughput
  without changing providers.

### D. Build texlab now

* **Pros:** Real language-server diagnostics, the biggest editor gap versus Prism.
* **Cons:** Needs a persistent per-project process that `latex-api` does not have;
  the node-only test setup cannot exercise it.
* **Rejected for this pass:** It is a separate project with its own acceptance
  tests.

### E. Add a chat state machine

* **Pros:** Symmetry with compile.
* **Cons:** The runtime already owns this state; a parallel machine would duplicate
  it.
* **Rejected:** Fix the missing error row instead.

### F. Server-side project storage for multi-device access

* **Pros:** Projects follow the user; enables sharing, permissions, and a future
  collaborative editor.
* **Cons:** Needs identity, a database, encryption, a conflict model, a claim path
  for existing browser projects, retention and export. Turns a local-first tool
  into a hosted product and invalidates the README's central claim.
* **Rejected for this pass:** Cost is weeks, not days, and it forces decisions the
  reliability repair should not wait on. Reopens when multi-device becomes a
  committed product requirement.

### G. Guest-first with a claimable account

* **Pros:** No sign-up wall before first value; the account is asked for when it
  can pay for itself (export, share, backup, paid provider). Preserves the
  local-first promise.
* **Cons:** Two identity states to test; a guest project needs an ownership rule
  on claim; analytics before sign-up are weaker.
* **Rejected for this pass:** The owner wants the account at entry. Kept as the
  fallback if the gate measurably reduces activation.

## Key Decisions & Staging for Next Steps

### What this brief now covers

The original scope was a reliability repair. Review added user-configurable
providers. The owner then added a required account and product telemetry, and
deferred server-side project storage.

The work splits into two tracks that can ship independently:

- **Track 1 (repair):** prompt budget, error rendering, compile reducer, keymap,
  chat-history safety. No new infrastructure.
- **Track 2 (account and telemetry):** identity, session, provider settings for a
  signed-in user, event collection, dev-panel reporting, export and deletion.

Track 2 depends on Track 1's request path, not on its internals. Track 1 can ship
before an account exists. Track 2 does not change how projects are stored.

Decisions belonging to the owner:

1. **Budget target — resolved: bring your own provider.** The design is not sized
   to one tier. Each model carries a capability record, and each request is sized
   to the selected model. Free Groq stays as the zero-config fallback; OpenCode,
   Anthropic, Google, OpenAI-compatible and local models are first-class.
2. **Where provider credentials live — resolved: per-user server storage.**
   Keys are encrypted at rest, scoped to an account, and managed from a settings
   page. This adds three prerequisites: an identity system and session model, a
   durable store for user records and encrypted secrets, and a migration path for
   the existing `.llm-providers.local.json`.
3. **What the account owns — resolved: credentials and telemetry only.** Projects
   stay in the browser (Alternative F deferred). The account exists to identify
   the user, hold provider settings, and record product events. The README's
   local-first claim survives, with the qualification that using the hosted app
   requires an account.
4. **What telemetry does — resolved: first-party product analytics only.** Events
   go to the operator's own store and are read as aggregate counts in the dev
   panel. No identifiers are shared with ad partners. This measures activation,
   retention, and feature use; it does not build an ad-targeting capability. If
   advertising becomes a real requirement later, the consent and disclosure work
   in finding 20 comes back with it.
5. **Where telemetry is stored — unresolved.** The app has no database. Options
   are the existing Upstash Redis, a new Postgres or SQLite store, or a
   third-party analytics service.
6. **Scope of the first pass.** Track 1 only, or Track 1 plus identity? They no
   longer belong in one release.
7. **Ownership of the chat path.** Fold the token-budget fix into the existing
   chat-revise design as a precondition, or replace that design's slice 5.

### Credential storage options considered

**A. Browser-held keys.** Keys are stored in this browser and sent with each
request to the app's own route, which forwards them to the provider. Fits the
local-first claim: projects already live in IndexedDB, and the server holds
nothing. Fails when the app is shared between people, and a key in browser
storage is readable by any script on the origin.

**B. Per-user server storage.** Chosen. Keys are encrypted at rest, scoped to an
account, and managed from a settings page. Requires authentication and a
database.

**C. Environment only.** Operators set keys on the host. No UI, no per-user
state, no auth. This is the current model for Groq and OpenAI.

Findings that should be actioned regardless of those answers, in order:

1. Land the working tree; verify CI on that commit.
2. Stop the chat-history deletion on load failure.
3. Restore `Enter` to newline.
4. Open a supported provider settings surface; remove the dev-panel gate from
   provider writes.
5. Add per-model capability metadata and a preflight that sizes the request to it.
6. Freeze the prompt prefix and gate tools by active file kind.
7. Render stream errors as an assistant row with Retry / Switch model.
8. Compile: pure reducer, last-good PDF, freshness predicate, generation guard.
9. Preflight token log with request id.

Track 2 adds, in order:

1. Identity and session, with a single sign-in method.
2. A durable store for user records, provider settings, and events.
3. A consent and disclosure surface, scoped to whichever data policy is chosen.
4. Event collection on the existing dev panel, aggregate first.
5. Export and account deletion that reach every stored copy.
