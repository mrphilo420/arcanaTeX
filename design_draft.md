# arcanaTeX: core-loop reliability, accounts, and first-party telemetry

* **Author:** mrphilo420
* **Status:** Draft
* **Date:** 2026-11-02
* **Predecessor:** `concepts_brief.md`, `docs/prism-study.md`

## Overview

arcanaTeX has more features than Prism and a worse first run. On a fresh install
with the default model, the first chat message is rejected before the model sees
it — the app's own prompt and tool schemas exceed the provider's per-minute token
budget — and the failure renders no assistant message at all.

This design covers two tracks that ship independently.

**Track 1 — repair.** Make the existing loop work: size the request to the
selected model, show failures inline, keep the last good PDF, fix the compile
state races, restore a sane editor keymap, and stop a storage error from deleting
chat history. No new infrastructure. Projects stay in the browser.

**Track 2 — account and telemetry.** Require an account to use the hosted app,
store per-user provider settings encrypted on the server, and record product
events that the operator reads as aggregate counts in the existing dev panel.
Projects still stay in the browser. No advertising identifiers and no third-party
sharing.

Server-side project storage, multi-device access, and a conflict model are
explicitly out of scope. They are recorded in `concepts_brief.md` as deferred.

## The Problem

Seven defects, each reproduced against a running build on 2026-11-02.

1. **The first message fails by construction.** Default model is
   `qwen/qwen3.8-27b` on Groq's on-demand tier: 7,000 input tokens per minute.
   The measured request is 7,022 tokens. The system prompt and tool schemas alone
   are 5,273 tokens before any document is included.
2. **The failure is invisible.** The route returns HTTP 200 with an SSE error
   chunk. The thread renders no assistant row. The only signal is a toast that
   auto-dismisses.
3. **The error message is wrong.** It says the editor context "was compacted
   automatically." Nothing was compacted, and retrying cannot help.
4. **Compile destroys the last good PDF.** `setCompileError` sets `pdfData: null`.
5. **A compile can land in the wrong project.** `latestRun` is a module global;
   opening another project neither bumps it nor cancels the run.
6. **`Enter` compiles instead of inserting a newline** in `.tex` files.
7. **A failed chat-history load deletes the conversation.** The catch sets
   messages to `[]` and marks the project loaded; the 600 ms autosave then deletes
   the stored record.

Separately, the multi-provider layer is complete but unreachable: twelve presets
and five API dialects exist, and every route that writes provider configuration is
gated by `isDevPanelRouteEnabled()`, false in production. There is also no way to
tell whether anyone uses the product, because nothing is recorded.

## Goals

Track 1:

* G1. On a fresh install with the default configuration, sending one message
  produces either an assistant reply or a specific, actionable error row inside
  the thread. No silent failure on any path.
* G2. Every chat and compile request is measured before it is sent, and the
  measurement is logged with provider, model, estimated input tokens, and
  headroom.
* G3. A failed or aborted compile leaves the previous PDF visible and marked out
  of date.
* G4. A compile started in one project can never write its result into another.
* G5. `Enter` inserts a newline in LaTeX files; compile has its own binding.
* G6. A chat-history load failure never deletes stored messages.
* G7. A provider can be connected from the settings surface, without a
  development build, in under two minutes.

Track 2:

* G8. The hosted app requires an account. A signed-out visitor can see the
  landing page and nothing else.
* G9. Provider credentials are stored per account, encrypted at rest, and never
  returned in full to the browser.
* G10. The operator can see daily active accounts, first-compile rate, first-chat
  rate, and 7-day retention in the dev panel.
* G11. A user can delete their account and all associated records, and export
  their project data.

## Non-Goals

* Server-side project storage, multi-device access, and conflict resolution.
* Live multi-user collaboration.
* Prism's full compile taxonomy, retry/backoff policy, and abort plumbing.
* A chat state machine. The runtime already owns chat state.
* texlab or any language server.
* Ad targeting, third-party analytics SDKs, or sharing identifiers with ad
  partners.
* Team accounts, roles, or permissions. One account equals one user.
* Billing.

## Open Questions

* **Q1. Durable store.** Upstash Redis is already configured for rate limiting.
  It can hold users, settings, and events, but analytics queries over a
  Redis-only store get awkward past a few hundred thousand events. Postgres is
  more work now and less work later. Decided in the Technical Plan.
* **Q2. Sign-in method.** Email magic link, GitHub OAuth, or Google OAuth. Each
  has a different cost in provider setup and a different failure mode for users
  without the provider account.
* **Q3. Key encryption.** Application-level encryption with an operator-held key,
  or database-level encryption with the key in the same trust boundary as the
  data. The first is meaningfully stronger and slightly more work.
* **Q4. Event schema.** Which events are worth recording, and what properties.
  Must be decided before implementation, because retrofitting properties onto
  historical events is impossible.
* **Q5. Export shape.** Export currently produces a project ZIP. With an account,
  export may also mean the account record. The project ZIP is the part users
  care about; the account record is a compliance obligation.

## Critical User Journeys

### CUJ 1: First message on a fresh install

* **Given**: A new account, no provider configured, the default model selected.
* **When**: The user opens a project and sends a message.
* **Then**: The request is measured against the model's budget. If it fits, an
  assistant reply appears. If it does not, an assistant row explains which part
  is too large, offers Switch model and Retry, and the request is logged with
  headroom.

### CUJ 2: Connect a provider

* **Given**: A signed-in user with no paid provider.
* **When**: They open Settings, choose a preset, paste a key, and save.
* **Then**: The key is validated against the provider's model list, the models
  appear in the picker grouped by provider, and the key is not readable again in
  full.

### CUJ 3: A compile fails mid-session

* **Given**: A project that compiled successfully a minute ago.
* **When**: An edit introduces an unmatched environment and auto-compile runs.
* **Then**: The previous PDF stays visible with an out-of-date marker, the new
  error appears once in the diagnostics list, and the compile button offers
  retry. No modal, no blank pane.

### CUJ 4: Sign up and be counted

* **Given**: A visitor on the landing page.
* **When**: They create an account and start a project.
* **Then**: The account exists, one `account_created` event is recorded, and the
  dev panel shows the account in the daily count. No project content is sent.

### CUJ 5: Load chat history after a corrupt record

* **Given**: A project whose stored chat record fails to parse.
* **When**: The project opens.
* **Then**: The thread is empty, a persistent notice says history could not be
  loaded, the stored record is left untouched, and the autosave is disabled for
  that project until the user acts.

## Technical Plan

```text
Track 1 — request path
┌──────────────┐   ┌──────────────────┐   ┌────────────────┐
│ use-document │──▶│ buildChatRequest │──▶│ /api/chat      │
│ -context     │   │ (budget + trim)  │   │ preflight log  │
└──────────────┘   └──────────────────┘   └───────┬────────┘
                                                  │
                          ┌───────────────────────┴────────┐
                          ▼                                ▼
                  ┌───────────────┐                ┌──────────────┐
                  │ provider call │                │ 413 / budget │
                  │ (tools gated) │                │  error part  │
                  └───────┬───────┘                └──────┬───────┘
                          ▼                               ▼
                  ┌───────────────────────────────────────────┐
                  │ thread: Text parts + Error part + actions │
                  └───────────────────────────────────────────┘

Track 2 — account and telemetry
┌───────────┐   ┌──────────────┐   ┌────────────────┐
│ sign-in   │──▶│ session      │──▶│ authenticated  │
│ (OAuth)   │   │ cookie       │   │ server routes  │
└───────────┘   └──────────────┘   └───────┬────────┘
                                           │
              ┌────────────────────────────┼──────────────────────┐
              ▼                            ▼                      ▼
    ┌──────────────────┐        ┌──────────────────┐   ┌──────────────────┐
    │ accounts         │        │ provider_creds   │   │ events           │
    │ (identity)       │        │ (AES-256-GCM)    │   │ (allowlisted)    │
    └──────────────────┘        └──────────────────┘   └────────┬─────────┘
                                                                ▼
                                                       ┌──────────────────┐
                                                       │ dev panel /      │
                                                       │ aggregate counts │
                                                       └──────────────────┘
```

### Track 1.1 — One request builder owns size

Today three layers independently decide what goes into a request: the client
context hook builds a system string, the route concatenates a second system
string, and a blanket 3,500-character truncation then cuts every message string
including tool results. Nothing counts.

Replace all three with one function.

`apps/web/lib/ai/request-budget.ts` exports:

```ts
interface ModelBudget {
  contextWindow: number;
  maxOutput: number;
  inputTokensPerMinute?: number;
  supportsTools: boolean;
  supportsCaching: boolean;
}

interface RequestPlan {
  system: string;          // static prefix only
  messages: UIMessage[];   // volatile context appended to the last user turn
  tools: ToolSet;          // gated by active file kind
  estimatedInputTokens: number;
  budget: ModelBudget;
  trimmed: TrimStep[];     // what was dropped, in order, for the log
}

function planChatRequest(input: PlanInput): RequestPlan
```

Trim order is fixed and logged: non-matching tool groups, always-on guides,
history, then the active-file excerpt. The active file is trimmed last because it
is what the user is asking about.

`estimatedInputTokens` is a character-based estimate with a separate weight for
JSON schema strings, calibrated against the one hard data point already available
(25,093 characters measured as 7,022 tokens). It is an estimate, not a
tokenizer; the design accepts that error in exchange for running in both the
browser and Node without a tokenizer dependency. The preflight log records it so
the estimate can be corrected against provider-reported usage.

### Track 1.2 — Freeze the prompt prefix

The static prefix is the server system prompt, the always-on behavioural rules,
and the serialized tool schemas. It must be byte-identical across requests or
provider-side caching never engages.

Three changes make it stable:

* Remove the prose list of tools from `SYSTEM_PROMPT`. It duplicates the schemas
  and is the part that drifts when a tool changes.
* Move project name, file list, active file, and selection out of `system` and
  into the final user message. They change on every keystroke today, which
  invalidates the prefix.
* Register the context hook so it does not re-fire on content changes alone.

Tool groups are selected by active file kind: `latex` (compile, diagnostics,
edit), `lean` (inspect, mathlib, candidate check), `research` (literature,
Zotero), `proof` (propose patch). A `.tex` file never carries the Lean tool
schemas.

### Track 1.3 — Model capability records

`ChatModelSelection` gains a `budget: ModelBudget` field. Three sources, in
priority order: operator override in the provider record, discovered provider
metadata, then a conservative default (8k input, no tools, no caching).

The picker shows the binding constraint, not the context window. A model that
cannot serve the current request is marked and selectable only with a warning.

### Track 1.4 — Errors as messages, not toasts

Stream errors arrive as an `error` part. Today only `Text` parts render, so the
turn ends with a user bubble and nothing else.

Add `components/assistant-ui/error-message.tsx` and register it in both
renderers (`thread.tsx`, `ai-drawer.tsx`). On any stream error, append a
persisted assistant message carrying:

```ts
{ code, message, requestId, retryable, actions: ["retry", "switch-model"] }
```

`chat.error` keeps its toast for background failures only. A turn never ends
with a user message and no assistant row.

### Track 1.5 — Compile reducer with input identity

`apps/web/lib/compile-machine.ts`, a pure reducer:

```ts
type CompilePhase = "idle" | "compiling" | "success" | "error" | "cancelled";
type CompileErrorKind = "latex" | "service" | "network" | "cancelled" | "unknown";

interface CompileInputs { files: ProjectFile[]; mainFileId: string; compiler: LatexCompiler }
interface CompileState {
  phase: CompilePhase;
  run?: { projectId: string; runId: number };
  inputs?: CompileInputs;
  pdf?: Uint8Array;
  error?: { kind: CompileErrorKind; message: string };
  startedAt?: number;
  finishedAt?: number;
}
```

Freshness is derived, not stored: `isFresh = inputs.files === current.files &&
inputs.mainFileId === current.mainFileId && inputs.compiler === current.compiler`.
Reference equality on `files` is correct because the store replaces the array on
every edit and on hydration.

`compile-project.ts` becomes the only dispatcher. The mount effect and the
`compileRequestId` effect in `pdf-preview.tsx` are deleted; the editor's compile
key calls the same function. Before applying a result, the reducer checks both
`projectId` and `runId`. Opening a project bumps a generation counter, so an
in-flight run from the previous project is discarded rather than written.

The error kind is classified once, at `/api/compile`: upstream non-JSON or
connection refused becomes `service`; a 5xx becomes `service`; a LaTeX log
becomes `latex`; an abort becomes `cancelled`. No retry policy is added in this
pass.

### Track 1.6 — Keymap and history safety

`Enter` inserts a newline in LaTeX files. `Mod-Enter` compiles. The default
document text that teaches the old convention is updated in the same commit.

`loadChatMessages` returns `{ status: "ok" | "empty" | "error" }` instead of
`UIMessage[] | null`. The provider records `loadSucceeded` per project and the
autosave effect returns early unless it is true. `StoredChatHistory` gains a
`version` field; unknown parts are downgraded to text on read rather than
dropped.

### Track 2.1 — Identity

Auth.js (NextAuth v5) with the GitHub provider and database sessions. GitHub
because the audience overlaps with the repository's own users and it needs no
email infrastructure; the provider list is a configuration value, so adding
Google later is a preset, not a redesign.

Database sessions rather than JWTs, because account deletion and session
revocation must be immediate.

Every API route that touches account data resolves the session server-side and
scopes queries by `account_id`. There is no client-supplied account identifier.

### Track 2.2 — Durable store

A thin repository seam at `apps/web/lib/server/db.ts` with typed methods
(`accounts`, `sessions`, `providerCredentials`, `events`). Two implementations
are acceptable behind it.

* **Postgres (recommended).** The event queries this design needs — daily
  uniques, funnel conversion, 7-day retention — are one `GROUP BY` each.
  Serverless connection pooling is a solved problem on the deployment platform
  already in use.
* **Upstash Redis (cheaper now).** Already configured and operating. Holds
  accounts and credentials without trouble. Event funnels require sorted sets
  and manual unique-count bookkeeping; that work grows with every new question
  asked of the data.

The seam exists so this choice can be reversed without touching route code. It
is not an abstraction for its own sake: the two implementations differ in query
cost by an order of magnitude, and that difference will be felt within months.

This is a decision the owner should confirm before implementation.

### Track 2.3 — Credential encryption

`apps/web/lib/server/crypto.ts`, AES-256-GCM:

* Key from `SECRETS_KEY`, 32 bytes base64, required at boot; the app refuses to
  start without it.
* Random 12-byte IV per record.
* Additional authenticated data binds ciphertext to `accountId` + `providerId`,
  so a row copied to another account fails to decrypt.
* The browser receives `hasApiKey` and the last four characters only. Full keys
  are never returned after write.

Storing keys with database-level encryption alone is insufficient: the key then
lives in the same trust boundary as the ciphertext, and a database dump plus a
config leak is a full compromise.

### Track 2.4 — Events

One table, one allowlist, no free-form payloads.

```text
events(id, account_id, name, properties jsonb, occurred_at, session_id)
```

Allowed names are a constant in code: `account_created`, `project_created`,
`first_compile`, `first_chat`, `provider_connected`, `compile_failed`,
`chat_failed`, `feature_opened`. Allowed property keys are also a constant;
unknown keys are dropped at ingest rather than rejected, so a client bug cannot
drop a whole batch.

Explicitly not recorded: project names, file names, file contents, prompts,
completions, provider keys, or IP addresses.

Ingest is `POST /api/events`, batched, rate limited by the existing limiter, and
authenticated. The dev panel reads `/api/dev/analytics`, which returns daily
series and funnel counts. Aggregates only; the panel never lists individual
events with an account attached.

### Track 2.5 — Consent, export, deletion

Because no identifiers are shared with third parties and no tracking cookies are
set, the requirement is a privacy policy plus a notice at sign-up, not a cookie
banner. The policy states what is collected, why, and for how long; events are
retained 12 months and then aggregated.

`DELETE /api/account` deletes the account row and cascades to sessions,
credentials, and events. `GET /api/account/export` returns the account record as
JSON. Project data is exported from the client, because the server never holds
it — this is stated in the UI so the distinction is not a surprise.

## Alternatives Considered

### A. Browser-held provider keys

* **Pros:** No server-side secret storage, no encryption key management, no
  account needed for the key itself. Matches the local-first claim exactly.
* **Cons:** Keys are readable by any script on the origin; a shared deployment
  has no per-user keys; keys do not follow the user between devices.
* **Rejected:** The owner chose per-user server storage. Reconsider if the
  product returns to single-user self-hosting.

### B. Upstash Redis as the primary store

* **Pros:** Already configured and running; zero new infrastructure; comfortably
  fast for accounts and credentials.
* **Cons:** Funnel and retention queries need sorted sets plus manual unique
  counting; no relational integrity between accounts, credentials, and events;
  cost scales with commands rather than storage.
* **Not rejected, deferred:** Kept as the second implementation behind the
  `db.ts` seam. Postgres is recommended in the plan, but the seam exists so this
  choice can be reversed without touching route code.

### C. A real tokenizer instead of a character estimate

* **Pros:** Exact token counts per provider; no drift between estimate and
  billing.
* **Cons:** Tokenizers differ per provider family, add megabytes to the bundle,
  and do not run in every target runtime without WASM.
* **Rejected:** The estimate is calibrated against one measured request and
  corrected from provider-reported usage. A tokenizer is the right answer only
  if preflight errors start causing user-visible failures.

### D. xstate, or a separate store for compile state

* **Pros:** Explicit statechart, smaller `document-store`.
* **Cons:** Compile state is reset atomically with files in four places; a second
  store adds a second reset path and a window where project A's PDF can render
  under project B. xstate adds an actor lifecycle and a second subscription
  model for a five-state machine.
* **Rejected:** A pure reducer plus one field keeps the atomic reset and runs in
  the existing node-only test setup.

### E. Port Prism's compile taxonomy wholesale

* **Pros:** Matches the reference implementation; less design work.
* **Cons:** Imports states this app cannot enter (`NoURL`, `DownloadFailed`,
  `NotConnected`) and a retry model with no retry mechanism behind it.
* **Rejected:** The app has no download, URL, or sandbox lifecycle to represent.

### F. A chat state machine

* **Pros:** Symmetry with compile.
* **Cons:** `useChat` and `useAISDKRuntime` already own this state; a parallel
  machine duplicates it and drifts.
* **Rejected:** The defect is a missing error row, not a missing state model.

### G. JWT sessions

* **Pros:** No session table, no database round trip per request.
* **Cons:** Revocation requires a denylist that reintroduces the table; account
  deletion cannot invalidate an issued token before expiry.
* **Rejected:** Database sessions, because immediate revocation is required by the
  account-deletion goal (G11).

### H. Email magic link sign-in

* **Pros:** No dependency on a third-party identity provider; works for any user.
* **Cons:** Requires transactional email infrastructure, deliverability work, and
  a link-expiry flow. None of that exists today.
* **Rejected for this pass:** GitHub OAuth needs no new infrastructure. The
  provider list is configuration, so magic link can be added without redesign.

### I. Third-party analytics

* **Pros:** Mature funnels, retention curves, and dashboards without building
  them.
* **Cons:** Sends user identifiers to a processor, which contradicts the
  first-party decision and pulls in consent and disclosure obligations.
* **Rejected:** First-party events in the operator's own store.

### J. Guest-first with a claimable account

* **Pros:** No sign-up wall before first value; the account is requested when it
  can pay for itself.
* **Cons:** Two identity states to test; an ownership rule is needed when a guest
  project is claimed.
* **Rejected for this pass:** The owner wants the account at entry. Retained as
  the fallback if the gate measurably reduces activation.

## Non-Functional Requirements

**Security.** Provider keys encrypted per record with AAD binding. Sessions
revocable server-side. No account identifier accepted from the client. The
compile service already runs in a temp directory; with projects still local, a
malicious `.tex` file reaches only the user's own compile.

**Performance.** Preflight adds no network call. The reducer is synchronous. Event
ingest is fire-and-forget with a small batch window; a failed ingest never blocks
a user action.

**Rollout.** Track 1 ships without an account and can be reverted independently.
Track 2 ships behind `NEXT_PUBLIC_REQUIRE_AUTH`; the flag defaults off in
development and on in production. Existing `.llm-providers.local.json` is
imported into the first account on first sign-in and then removed.

## Detailed Implementation Plan

### Track 1 — files

#### 1. `apps/web/lib/ai/request-budget.ts` (Create)

* **Type / Scope**: TypeScript module, server and client safe.
* **Proposed Changes**: Export `ModelBudget`, `PlanInput`, `RequestPlan`,
  `estimateTokens()`, and `planChatRequest()`. Owns the fixed trim order, the
  tool-group selection by file kind, and the estimate calibration constant. This
  is the only place that decides what enters a request.

#### 2. `apps/web/lib/ai/request-budget.test.ts` (Create)

* **Type / Scope**: Unit test.
* **Proposed Changes**: Table tests for each trim step in isolation and in
  combination; a test that a `.tex` request never contains Lean tool names; a
  test that estimated tokens for the measured 25,093-character request land
  within 5% of 7,022.

#### 3. `apps/web/lib/chat-models.ts` (Modify)

* **Type / Scope**: Shared model metadata.
* **Proposed Changes**: Add `budget: ModelBudget` to `ChatModelSelection`. Give
  every preset a conservative default; mark the three Groq models with their real
  8K/200K limits. Replace `contextWindow: "provider"` with a number or `null`.

#### 4. `apps/web/lib/ai/llm-providers.ts` (Modify)

* **Type / Scope**: Provider registry.
* **Proposed Changes**: Persist optional per-model budget overrides on
  `StoredLlmProvider`; include them in `getChatModelSelections()`. In Track 2,
  replace the file-backed store with the account-scoped store (§30).

#### 5. `apps/web/app/api/chat/route.ts` (Modify)

* **Type / Scope**: Next.js route handler.
* **Proposed Changes**: Replace the ad-hoc system assembly and
  `compactChatMessages` with `planChatRequest()`. Mint a request id, emit one
  `chat.preflight` log line, return a structured `context_budget_exceeded` error
  instead of calling the provider when over budget, and pass `req.signal` to
  `streamText`. Delete `truncateDeep`. Keep `maxDuration`.

#### 6. `apps/web/hooks/use-document-context.ts` (Modify)

* **Type / Scope**: Client hook.
* **Proposed Changes**: Stop building a system string. Emit a `VolatileContext`
  object (project name, file list, active file path, selection, Lean summaries)
  that the request builder attaches to the last user turn. Register once; do not
  re-register on `content` changes. Move `CODE_EXECUTION_GUIDE` and
  `PROOF_GOLF_GUIDE` behind file-kind switches.

#### 7. `apps/web/components/chat-runtime-provider.tsx` (Modify)

* **Type / Scope**: Client provider.
* **Proposed Changes**: Convert `chat.error` and stream `error` parts into a
  persisted assistant message instead of a toast. Track `loadSucceeded` per
  project; the autosave effect returns early until a load has succeeded. Pass the
  error's `requestId` through.

#### 8. `apps/web/components/assistant-ui/error-message.tsx` (Create)

* **Type / Scope**: React component.
* **Proposed Changes**: Renders `{code, message, requestId, retryable}` with a
  Retry action (calls `regenerate()`), a Switch model action (opens the picker),
  and a collapsible detail block. Used by both chat renderers.

#### 9. `apps/web/components/assistant-ui/thread.tsx` (Modify)

* **Type / Scope**: Chat renderer.
* **Proposed Changes**: Register the error part renderer alongside `Text`.

#### 10. `apps/web/components/workspace/editor/ai-drawer.tsx` (Modify)

* **Type / Scope**: Chat renderer (drawer variant).
* **Proposed Changes**: Same registration as §9.

#### 11. `apps/web/lib/compile-machine.ts` (Create)

* **Type / Scope**: Pure reducer, no React, no store imports.
* **Proposed Changes**: Export `CompileState`, `CompileEvent`, `compileReducer`,
  `initialCompileState()`, and `isFresh(state, current)`. The reducer applies a
  result only when `projectId` and `runId` match the current run.

#### 12. `apps/web/lib/compile-machine.test.ts` (Create)

* **Type / Scope**: Unit test.
* **Proposed Changes**: Transition table covering start, success, error of each
  kind, cancel, project switch mid-run, and a result arriving for a stale run.
  Asserts the previous PDF survives every failure path.

#### 13. `apps/web/stores/document-store.ts` (Modify)

* **Type / Scope**: Zustand store.
* **Proposed Changes**: Replace `pdfData`, `compileError`, `isCompiling` with one
  `compile: CompileState`. Add `compileGeneration`. Use `initialCompileState()`
  in the initializer, `hydrateProject`, `applyRemoteSnapshot`, `importProject`,
  and `deleteFile` so the reset cannot drift. Update `DEFAULT_TEX_CONTENT` to
  describe the new keymap.

#### 14. `apps/web/lib/compile-project.ts` (Modify)

* **Type / Scope**: Compile orchestration.
* **Proposed Changes**: Become the only dispatcher. Capture
  `{projectId, runId, inputs}` at start; check both identifiers before applying.
  Delete the module-level `latestRun` comparison in favour of the store's
  generation.

#### 15. `apps/web/components/workspace/preview/pdf-preview.tsx` (Modify)

* **Type / Scope**: PDF pane.
* **Proposed Changes**: Delete the mount-compile effect and the
  `compileRequestId` effect; compilation is triggered in one place. Render the
  PDF before the error banner. Show an out-of-date marker derived from
  `isFresh()`. Disable Download while stale, with a "Compile now" action.

#### 16. `apps/web/components/workspace/editor/latex-editor.tsx` (Modify)

* **Type / Scope**: Editor keymap.
* **Proposed Changes**: `Enter` inserts a newline; `Mod-Enter` compiles. Leave
  `Shift-Enter` as newline for muscle memory. Update the toolbar tooltip.

#### 17. `apps/web/lib/compile-errors.ts` (Modify)

* **Type / Scope**: Error classification.
* **Proposed Changes**: Return `{kind, message}` where kind is
  `latex | service | network | cancelled | unknown`. Map `ECONNREFUSED`,
  non-JSON upstream bodies, 5xx, and aborts to their kinds. Keep the existing
  string mapping as `message`.

#### 18. `apps/web/lib/projects/chat-history.ts` (Modify)

* **Type / Scope**: IndexedDB access.
* **Proposed Changes**: `loadChatMessages` returns
  `{status: "ok" | "empty" | "error"}`. `saveChatMessages` refuses to delete when
  the caller has not confirmed a successful load.

#### 19. `apps/web/lib/storage/schema.ts` (Modify)

* **Type / Scope**: Persistence types.
* **Proposed Changes**: Add `version: number` to `StoredChatHistory`. Do not bump
  `DB_VERSION`; the field is optional and normalised on read.

### Track 2 — files

#### 20. `apps/web/package.json` (Modify)

* **Type / Scope**: Dependencies.
* **Proposed Changes**: Add `next-auth` (v5) and the Postgres driver. Add
  `playwright` as a dev dependency for the verification plan.

#### 21. `apps/web/auth.ts` (Create)

* **Type / Scope**: Auth configuration.
* **Proposed Changes**: GitHub provider, database session strategy, callbacks
  that attach `accountId` to the session. No client-supplied identity is trusted.

#### 22. `apps/web/app/api/auth/[...nextauth]/route.ts` (Create)

* **Type / Scope**: Route handler.
* **Proposed Changes**: Export the Auth.js handlers. No other logic.

#### 23. `apps/web/middleware.ts` (Create)

* **Type / Scope**: Edge middleware.
* **Proposed Changes**: Redirect unauthenticated requests for `/project/*` to
  `/sign-in`. Leave the landing page and auth routes public. Gate behaviour on
  `NEXT_PUBLIC_REQUIRE_AUTH`.

#### 24. `apps/web/lib/server/db.ts` (Create)

* **Type / Scope**: Repository seam.
* **Proposed Changes**: Interfaces for `accounts`, `sessions`,
  `providerCredentials`, `events`. One factory that selects the implementation
  from environment. Every route imports this, never a driver.

#### 25. `apps/web/lib/server/db/schema.sql` (Create)

* **Type / Scope**: Database schema.
* **Proposed Changes**: `accounts`, `sessions`, `provider_credentials`, `events`
  with foreign keys and cascade deletes. Index on `events(occurred_at)` and
  `events(account_id, name)`.

#### 26. `apps/web/lib/server/db/postgres.ts` (Create)

* **Type / Scope**: Repository implementation.
* **Proposed Changes**: Implements §24 against Postgres, including the aggregate
  queries for daily uniques, funnel conversion, and 7-day retention.

#### 27. `apps/web/lib/server/crypto.ts` (Create)

* **Type / Scope**: Secret handling.
* **Proposed Changes**: AES-256-GCM encrypt/decrypt with a random IV and
  `accountId + providerId` as AAD. Key loaded from `SECRETS_KEY`; throw at boot
  when missing or the wrong length.

#### 28. `apps/web/lib/server/crypto.test.ts` (Create)

* **Type / Scope**: Unit test.
* **Proposed Changes**: Round-trip, tamper detection, wrong-AAD rejection,
  missing-key boot failure.

#### 29. `apps/web/lib/server/accounts.ts` (Create)

* **Type / Scope**: Account domain.
* **Proposed Changes**: Create, read, delete. Deletion cascades to sessions,
  credentials, and events, and returns what was removed so the UI can confirm.

#### 30. `apps/web/lib/server/credentials.ts` (Create)

* **Type / Scope**: Provider credential store.
* **Proposed Changes**: Write encrypted; read decrypted only inside the chat
  route; list returns `hasApiKey` and a last-four preview. Import from
  `.llm-providers.local.json` for the first account only.

#### 31. `apps/web/lib/server/events.ts` (Create)

* **Type / Scope**: Telemetry ingest and aggregation.
* **Proposed Changes**: Constant allowlists for event names and property keys.
  `record()` drops unknown keys. `aggregate()` returns daily series and funnel
  counts, never individual events joined to an account.

#### 32. `apps/web/lib/server/events.test.ts` (Create)

* **Type / Scope**: Unit test.
* **Proposed Changes**: Unknown names rejected, unknown properties dropped,
  batching idempotent by event id, aggregates correct across day boundaries.

#### 33. `apps/web/app/api/events/route.ts` (Create)

* **Type / Scope**: Route handler.
* **Proposed Changes**: Authenticated batch ingest, capped at 50 events per
  request, rate limited by the existing limiter, always returns 202 so a client
  bug cannot block the UI.

#### 34. `apps/web/app/api/dev/analytics/route.ts` (Create)

* **Type / Scope**: Route handler.
* **Proposed Changes**: Returns aggregates for the dev panel. Requires an
  authenticated operator; uses an explicit admin allowlist rather than the
  current dev-panel check, so analytics is not readable by every account in
  production.

#### 35. `apps/web/app/api/account/route.ts` (Create)

* **Type / Scope**: Route handler.
* **Proposed Changes**: `DELETE` deletes the account and all associated records,
  then clears the session cookie.

#### 36. `apps/web/app/api/account/export/route.ts` (Create)

* **Type / Scope**: Route handler.
* **Proposed Changes**: Returns the account record and provider metadata as JSON.
  Project data is not included and the response says so, because it is in the
  browser and exported from there.

#### 37. `apps/web/components/auth/sign-in-gate.tsx` (Create)

* **Type / Scope**: React component.
* **Proposed Changes**: Full-page sign-in for unauthenticated visitors, one
  provider button, links to the privacy policy and terms.

#### 38. `apps/web/app/layout.tsx` (Modify)

* **Type / Scope**: Root layout.
* **Proposed Changes**: Wrap in the session provider. No other change.

#### 39. `apps/web/app/api/dev/llm-providers/route.ts` (Modify)

* **Type / Scope**: Route handler.
* **Proposed Changes**: Remove `isDevPanelRouteEnabled` from the read and write
  paths; scope every operation to the authenticated account. Keep the dev-panel
  gate only for diagnostics endpoints.

#### 40. `apps/web/components/dev/llm-providers-panel.tsx` (Modify)

* **Type / Scope**: Settings UI.
* **Proposed Changes**: Remove the dev-only warning. Add a per-model budget editor
  so an operator can correct a discovered limit without a code change.

#### 41. `apps/web/components/dev/dev-panel.tsx` (Modify)

* **Type / Scope**: Dev panel.
* **Proposed Changes**: Add an Analytics tab reading §34: daily active accounts,
  first-compile rate, first-chat rate, 7-day retention, provider mix.

#### 42. `apps/web/lib/analytics.ts` (Create)

* **Type / Scope**: Client emitter.
* **Proposed Changes**: Buffers allowlisted events and flushes in batches. Never
  blocks a user action; drops the buffer on sign-out.

#### 43. `apps/web/.env.example` (Modify)

* **Type / Scope**: Configuration documentation.
* **Proposed Changes**: Add `SECRETS_KEY`, `AUTH_SECRET`, `AUTH_GITHUB_ID`,
  `AUTH_GITHUB_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_REQUIRE_AUTH`.

#### 44. `README.md` (Modify)

* **Type / Scope**: Product documentation.
* **Proposed Changes**: State that the hosted app requires an account and that
  projects remain in the browser. Replace the "local-first, no account" framing
  with the accurate version. Add the privacy and telemetry summary.

#### 45. `docs/privacy.md` (Create)

* **Type / Scope**: Policy draft.
* **Proposed Changes**: What is collected, why, retention (12 months for events),
  what is never collected (project content, prompts, keys), how to export and
  delete, and that no data is shared with third parties.

#### 46. `tests/e2e/first-message.spec.ts` (Create)

* **Type / Scope**: Playwright end-to-end test.
* **Proposed Changes**: Against a mock OpenAI-compatible server: a fresh project
  sends one message and receives a reply; a 413 response produces an inline error
  row with Retry; a compile failure leaves the previous PDF visible; killing the
  LaTeX API produces a service error rather than a blank pane.

#### 47. `tests/e2e/playwright.config.ts` (Create)

* **Type / Scope**: Test configuration.
* **Proposed Changes**: Start the web app and a stub LaTeX API, expose fixture
  projects, run headless in CI.

### Verification Plan

* **Compilation/Build**: `pnpm --filter @open-prism/web build` and
  `pnpm --filter @open-prism/latex-api build`.
* **Unit Tests**: `pnpm --filter @open-prism/web test` must stay green; the new
  suites in §2, §12, §28 and §32 add the coverage the reviewers found missing.
* **Static Analysis & Linting**: `pnpm exec biome check` on changed files, plus
  `pnpm --filter @open-prism/web typecheck`.
* **E2E/Integration**: `pnpm exec playwright test` with the spec in §46. The
  compile-failure and 413 cases are the acceptance gate for Track 1; they must
  fail before the change and pass after.
* **Manual checks**: kill `apps/latex-api` mid-compile and confirm the previous
  PDF stays visible; switch projects during a slow compile and confirm the result
  is discarded; delete a chat record from IndexedDB and confirm the thread shows
  a notice rather than silently emptying.
* **Track 2 acceptance**: sign in, connect a provider, confirm the key is not
  returned by any endpoint, confirm `DELETE /api/account` removes the row and its
  dependents, and confirm the dev panel shows the account in the daily count
  without listing it individually.
