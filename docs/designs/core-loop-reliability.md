# arcanaTeX: core-loop reliability, accounts, and first-party telemetry

* **Author:** mrphilo420
* **Status:** Revised after review
* **Date:** 2026-11-02
* **Predecessor:** `concepts_brief.md`, `docs/prism-study.md`
* **Review:** `docs/reviews/core-loop-reliability/consolidated_review_report.md`

## Overview

arcanaTeX has more features than Prism and a worse first run. On a fresh install
with the default model, the first chat message is rejected before the model sees
it, and the failure renders no assistant message at all.

The measured request is 7,022 tokens against a 7,000 input-token-per-minute
limit. The server system prompt, the client context, and the eighteen tool
schemas account for 5,273 of those tokens before any document text is included.

This design covers two tracks.

**Track 1 — repair.** Size the request to the selected model, show failures
inline, keep the last good PDF, fix the compile state races, restore a workable
editor keymap, and stop a storage error from deleting chat history. No new
infrastructure.

**Track 2 — account and telemetry.** Require an account to use the hosted app,
store per-user provider settings encrypted on the server, and record product
events that the operator reads as aggregate counts. Projects stay in the browser.

The two tracks are sequenced, not independent. Track 1 ships and can be reverted
on its own. Track 2 edits several Track 1 files and cannot ship before them.

Server-side project storage and multi-device access remain out of scope. The
existing sync service already stores snapshots, and this design accounts for that
in §Technical Plan rather than claiming the server holds nothing.

## The Problem

Seven defects, each traced to a reproduction or a code path.

1. **The first message fails by construction.** Default model is
   `qwen/qwen3.8-27b` on Groq's on-demand tier: 7,000 input tokens per minute.
   The full request measures 7,022 tokens, of which 5,273 are the fixed prompt
   and tool schemas.
2. **The failure is invisible.** The route returns HTTP 200 with an SSE error
   chunk. The thread renders no assistant row. The only signal is a toast that
   auto-dismisses.
3. **The error message is wrong.** It says the editor context "was compacted
   automatically." Nothing was compacted, and retrying cannot help.
4. **Compile destroys the last good PDF.** `setCompileError` sets `pdfData: null`.
5. **A compile can land in the wrong project.** `latestRun` is a module global;
   opening another project neither bumps it nor cancels the run.
6. **`Enter` compiles instead of inserting a newline** in `.tex` files.
7. **A failed chat-history load deletes the conversation.** `loadChatMessages`
   returns `null` both when no record exists and when `stored.messages` is not an
   array. The provider treats both as empty history, marks the project loaded,
   and calls `setMessages([])`; 600 ms later the autosave calls
   `saveChatMessages([])`, which deletes the record.

Separately, the multi-provider layer has twelve presets and five API dialects,
but every route that writes provider configuration is gated by
`isDevPanelRouteEnabled()`, which is false in production unless
`DEV_PANEL_ENABLED=1`. There is also no way to tell whether anyone uses the
product, because nothing is recorded.

Evidence for defects 1–4 comes from a live run recorded in
`docs/prism-study.md` and `concepts_brief.md`. Defects 5–7 come from reading the
code paths named in each item.

## Goals

Track 1:

* G1. Sending one message on a fresh install produces an assistant reply or an
  error row inside the thread, on every path: budget exceeded, provider 4xx/5xx,
  network refusal, and stream abort.
* G2. Before a chat request leaves the browser, the operator log records the
  provider, model, estimated input tokens, the model's per-minute input budget,
  and the difference between them. A request whose estimate exceeds the budget
  is not sent.
* G3. A failed, cancelled, or aborted compile leaves the previous PDF visible and
  marked out of date.
* G4. A compile started in one project can never write its result into another.
* G5. `Enter` inserts a newline in LaTeX files; `Mod-Enter` compiles.
* G6. A chat-history load that fails or returns unreadable data never deletes
  stored messages.
* G7. On a self-hosted instance, a provider can be connected without a
  development build.

Track 2:

* G8. The hosted app requires an account for every route except the landing page,
  auth routes, and a health check. A signed-out request to any data or model
  route returns 401.
* G9. Provider credentials are stored per account, encrypted at rest, and never
  returned in full to the browser.
* G10. The operator can see daily active accounts, first-compile rate, first-chat
  rate, and 7-day retention. Each metric is defined in the document with a
  denominator and a window.
* G11. A user can delete their account and every record that identifies them, and
  can export their account data and project source.
* G12. A user can connect a provider from a settings page without a development
  build.

## Non-Goals

* Server-side project storage, multi-device access, and conflict resolution.
* Live multi-user collaboration.
* Prism's full compile taxonomy, retry/backoff policy, and abort plumbing.
* A chat state machine. The runtime already owns chat state.
* texlab or any language server.
* Ad targeting, third-party analytics SDKs, or sharing identifiers with ad
  partners.
* Team accounts, roles, or permissions. One account equals one user. The single
  exception is an operator allowlist used to read analytics, which is a flag, not
  a role system.
* Billing.

## Decisions and Open Questions

Decided:

| Question | Decision | Where |
| --- | --- | --- |
| Budget target | Bring your own provider; each request sized to the selected model | §1.3 |
| Credential storage | Per-user, encrypted at rest | §2.3 |
| What the account owns | Credentials, settings, and telemetry. Projects stay local | §2.2 |
| Telemetry scope | First-party product analytics. No identifiers shared | §2.4 |
| Durable store | Postgres | §2.2 |
| Sign-in | GitHub OAuth with database sessions | §2.1 |
| Key encryption | AES-256-GCM with AAD binding and a key version | §2.3 |
| Export shape | Account record plus source bundle. There is no project ZIP today | §2.5 |
| Event schema | Fixed allowlist of names and property keys | §2.4 |

Open:

* **Q1. Operator bootstrap.** The first operator has to be identified before any
  analytics exist. The plan uses `ADMIN_ACCOUNT_IDS`, which the operator sets
  before opening sign-ups. No mechanism infers "first account is admin".
* **Q2. Event retention owner.** The 12-month rule needs a scheduled job. Whether
  that runs in the Next app, in `latex-api`, or as a database cron is decided at
  implementation time and does not change any interface.

## Critical User Journeys

### CUJ 1: First message on a fresh install

* **Given**: A new account, no provider connected, the default model selected,
  and an instance with no operator `GROQ_API_KEY`.
* **When**: The user opens a project and sends a message.
* **Then**: The request is measured. A request that fits produces a reply. A
  request that does not, or a provider 413, or a provider 500, or a refused
  connection, produces an assistant row naming the cause, with Connect provider
  and Retry actions. No path ends with only a user bubble.

### CUJ 2: Connect a provider

* **Given**: A signed-in user with no paid provider.
* **When**: They open Settings → Providers, choose a preset, paste a key, and
  save.
* **Then**: The key is validated against the provider's model list, the models
  appear in the picker grouped by provider with their binding limit, and the key
  is not readable again in full.

### CUJ 3: A compile fails mid-session

* **Given**: A project that compiled successfully a minute ago.
* **When**: An edit introduces an unmatched environment and auto-compile runs.
* **Then**: The previous PDF stays visible with an out-of-date marker, the new
  error appears once in the diagnostics list, Download is disabled with a
  Compile now action, and the compile button offers retry. No modal, no blank
  pane.

### CUJ 4: Sign up, work, and be counted

* **Given**: A visitor on the landing page.
* **When**: They create an account, create a project, compile once, and send one
  message.
* **Then**: `account_created`, `app_opened`, `first_compile`, and `first_chat`
  are recorded, and the operator dashboard shows the account in the daily count
  and in the first-compile and first-chat cohorts. No project content is sent.

### CUJ 5: Load unreadable chat history

* **Given**: A stored chat record whose `messages` field is not an array.
* **When**: The project opens.
* **Then**: The thread is empty, a persistent notice says history could not be
  loaded, the stored record is left untouched, and autosave is disabled for that
  project until the user chooses Retry or Discard.

### CUJ 6: Switch projects during a compile

* **Given**: A slow compile running in project A.
* **When**: The user opens project B.
* **Then**: A's result is discarded. B shows its own state and its own PDF. No
  PDF from A ever appears in B.

### CUJ 7: Editor keys

* **Given**: The caret inside a `.tex` file.
* **When**: The user presses `Enter`, then `Mod-Enter`.
* **Then**: `Enter` inserts a newline; `Mod-Enter` starts a compile.

### CUJ 8: Delete and export

* **Given**: An account with projects in one browser, one connected provider, and
  recorded events.
* **When**: The user exports, then deletes the account.
* **Then**: Export produces the account record and a source bundle of every
  project. Deletion removes the account, sessions, credentials, events, and any
  sync room owned by the account, and the user is signed out.

## Technical Plan

### Data flow and storage

The claim that the server holds no project content is false today. The sync
service persists whole snapshots. This table is the source of truth for the
privacy policy, export, and deletion.

| Data | Where it lives | Retention | Reaches deletion |
| --- | --- | --- | --- |
| Project files (editor) | Browser IndexedDB | Until the user deletes the project | User deletes locally |
| Sync snapshots | `latex-api` `SYNC_DATA_DIR`, plaintext JSON | Until the room is deleted | **Must be account-scoped** so deletion reaches it |
| Compile payloads | Temp directory per request | Deleted in `finally` | Nothing to delete |
| Chat prompts and replies | Provider, transient | Provider policy | Nothing stored locally |
| Chat history | Browser IndexedDB | Until project deleted | User deletes locally |
| Provider keys | Postgres, AES-GCM ciphertext | Until removed | Cascade |
| Events | Postgres | 12 months raw, then de-identified rollup | Raw cascade; rollup has no account id |
| Rate-limit counters | Upstash Redis | Minutes | Expiry |

Two consequences follow. Sync rooms gain an `account_id` so deletion can reach
them; until that lands, the privacy policy states that sync snapshots are stored
on the server and are not covered by account deletion. The second is a truthful
limitation, not something this pass resolves.

### Track 1.1 — One request planner, server-side

Three layers currently decide what enters a request: the client context hook
builds a system string, the route concatenates a second system string and appends
skill text, and a blanket 3,500-character truncation cuts every message string
including tool results. Nothing counts.

Replace all three with one function that runs in the route, after skill selection
and tool construction, so the plan describes the request that is actually sent.

```ts
interface ModelBudget {
  contextWindow: number;
  maxOutput: number;
  inputTokensPerMinute?: number;
  supportsTools: boolean;
  supportsCaching: boolean;
}

type ToolGroup = "base" | "latex" | "lean" | "research" | "proof";

interface VolatileContext {
  projectName: string;
  fileList: string;
  activeFilePath: string;
  activeFileExcerpt: string;
  selection?: { text: string; startLine: number; endLine: number };
  leanSummaries?: string;
}

interface PlanInput {
  model: ModelBudget;
  mode: "chat" | "paper-review" | "proofread" | "prover";
  activeFileKind: FileKind;
  hasLeanFiles: boolean;
  volatile: VolatileContext;
  history: UIMessage[];
  tools: ToolSet;          // the full registry, before gating
}

type TrimStep =
  | { step: "skills-to-tool-result"; chars: number }
  | { step: "guides-by-mode"; chars: number }
  | { step: "tools-by-group"; chars: number }
  | { step: "history"; chars: number }
  | { step: "active-file"; chars: number };

interface RequestPlan {
  system: string;
  messages: UIMessage[];
  tools: ToolSet;
  toolGroup: ToolGroup;
  estimatedInputTokens: number;
  budget: ModelBudget;
  headroom: number;        // budget - estimatedInputTokens
  trimmed: TrimStep[];
}
```

Trim order is fixed and logged: skill text moves into a tool result, mode guides
are dropped unless the mode needs them, tool groups are narrowed, history is cut,
and the active-file excerpt is cut last because it is what the user is asking
about.

The estimate is a character-based heuristic with a separate weight for JSON
schema strings. It is calibrated against two measured requests, not one, and the
observed error is recorded in the module. It is not a tokenizer; the design
accepts that error in exchange for running without a tokenizer dependency.

The gate uses a 10% reserve: a request is sent when
`estimatedInputTokens <= 0.9 * budget.inputTokensPerMinute`. A provider 413 is
treated as an estimator bug and logged as such; it is not the primary control.

### Track 1.2 — A cacheable prefix per tool lane

The static prefix is the server system prompt, the always-on rules, the skill
text for the current mode, and the serialized tool schemas. It cannot be
byte-identical across requests while tools are also gated by file kind, so the
design is explicit: **there is one prefix per lane, and the lane is fixed for the
life of a conversation.**

The lane is chosen from the project, not the active tab: `lean` when the project
contains `.lean` files, `latex` otherwise, with `research` and `proof` groups
added by the mode. Switching the active tab inside a conversation does not change
the lane, so the prefix stays stable and a turn that proposed a Lean patch keeps
the tools needed to apply it.

Provider-side caching is only claimed for models whose budget record says
`supportsCaching: true`. For other models the prefix is still stable, which costs
nothing and makes the request reproducible.

### Track 1.3 — Model capability records and a fitting default

`ChatModelSelection` gains `budget: ModelBudget`. Sources, in priority order:
operator override, discovered provider metadata, conservative default (8k input,
no tools, no caching).

The default changes to `openai/gpt-oss-20b`, which supports prompt caching on the
current provider. `qwen/qwen3.8-27b` remains selectable. The picker shows the
binding limit, not the context window, and marks a model that cannot serve the
current lane.

### Track 1.4 — Errors as message status

`ai@6.0.57` has no `error` UIMessage part. assistant-ui renders errors from
message status through `MessagePrimitive.Error`. The design uses that primitive
and does not invent a part.

On any stream error, `chat-runtime-provider.tsx` appends a synthetic assistant
message with `status: { type: "incomplete", reason: "error" }` and attaches:

```ts
interface ChatErrorPayload {
  code: "budget" | "provider" | "network" | "aborted" | "unknown";
  message: string;
  requestId: string;
  retryable: boolean;
}
```

`error-message.tsx` renders `MessagePrimitive.Error` with Retry (calls
`regenerate()`), Connect provider or Switch model, and a collapsible detail block
showing the request id. The request id is minted in the route and returned in the
error payload and in `x-request-id`.

`chat.error` keeps its toast only for failures that happen outside a turn.

### Track 1.5 — Compile reducer anchored on success

```ts
type CompilePhase = "idle" | "compiling" | "success" | "error" | "cancelled";
type CompileErrorKind = "latex" | "service" | "network" | "cancelled" | "unknown";

interface CompileInputs {
  files: ProjectFile[];
  mainFileId: string;
  compiler: LatexCompiler;
}

interface CompileState {
  phase: CompilePhase;
  run?: { projectId: string | null; runId: number };
  pdf?: Uint8Array;
  pdfInputs?: CompileInputs;     // set only on success
  error?: { kind: CompileErrorKind; message: string };
  startedAt?: number;
  finishedAt?: number;
}

type CompileEvent =
  | { type: "start"; projectId: string | null; runId: number }
  | { type: "success"; projectId: string | null; runId: number; pdf: Uint8Array; inputs: CompileInputs }
  | { type: "failure"; projectId: string | null; runId: number; kind: CompileErrorKind; message: string }
  | { type: "cancel"; projectId: string | null; runId: number }
  | { type: "contentChanged" }
  | { type: "reset" };
```

Freshness is derived from **the inputs of the last successful compile**, never
from the inputs captured at start:

```ts
const isFresh =
  state.phase === "success" &&
  state.pdfInputs !== undefined &&
  state.pdfInputs.files === current.files &&
  state.pdfInputs.mainFileId === current.mainFileId &&
  state.pdfInputs.compiler === current.compiler;
```

That definition is what makes a failed compile leave the PDF marked out of date.
Reference equality on `files` is correct because the store replaces the array on
every edit and on hydration.

`compile-project.ts` is the only dispatcher. `requestCompile()` stays as the
command surface and bumps a single `compileGeneration`; one subscriber in
`compile-project.ts` compiles when it changes and once on first hydration. The
mount effect and the `compileRequestId` effect in `pdf-preview.tsx` are deleted,
and `compileRequestId` is deleted from the store.

`cancelled` has a real path: `compileLatexWithLog` takes an optional
`AbortSignal`, and an `AbortError` maps to `cancelled`. Without that, the state is
removed.

### Track 1.6 — Keymap and history safety

`Enter` inserts a newline in LaTeX files; `Mod-Enter` compiles. The default
document text that teaches the old convention is updated in the same commit.

`loadChatMessages` returns a discriminated result:

```ts
type LoadResult =
  | { status: "ok"; messages: UIMessage[] }
  | { status: "missing" }
  | { status: "unreadable"; reason: string };
```

The provider marks the project loaded only for `ok` and `missing`. For
`unreadable` it keeps the thread empty, shows the notice, and disables autosave
until the user acts. `saveChatMessages` takes an explicit `confirmedLoad: boolean`
and refuses to delete when it is false.

`StoredChatHistory` gains an optional `version`; unknown parts are downgraded to
text on read.

### Track 2.1 — Identity and the auth perimeter

Auth.js v5 with the GitHub provider and the official Postgres adapter. Database
sessions, because deletion and revocation must be immediate. The adapter supplies
`users`, `accounts` (OAuth links), `sessions`, and `verification_token`; the
application tables start separate from those names.

Route protection is deny-by-default:

* `proxy.ts` (not `middleware.ts`, which Next 16 deprecates) redirects `/project/*`
  to `/sign-in` and runs on the Node runtime so it can read a session.
* `requireSession()` is called by every route under `/api/*` except
  `/api/auth/*` and `/api/health`.
* That includes `/api/chat`, `/api/ai/fix`, `/api/ai/subagent`, `/api/ai/models`,
  `/api/compile`, `/api/code/run`, and `/api/lean/*`.
* `resolveChatModel` receives an `accountId`. When auth is required, the
  environment-key fallback applies only to accounts on the operator allowlist, so
  a signed-out caller can never spend the operator's budget.

`app/sign-in/page.tsx` is a page, not a component. `sign-in-gate.tsx` is the
presentational piece it renders.

### Track 2.2 — Postgres behind a thin seam

Postgres, decided. The seam at `lib/server/db.ts` wraps the Auth.js adapter and
the application repositories (`providerCredentials`, `events`, `syncRooms`).

The seam exists to keep SQL out of routes, not to support a second store. The
Redis alternative is recorded in Alternatives and is not implemented.

Serverless connection pooling uses the deployment platform's pooled connection
string; the driver is pinned.

### Track 2.3 — Credential encryption with a key version

AES-256-GCM:

* `SECRETS_KEY` is 32 bytes base64, required at boot; the app refuses to start
  without it.
* Random 12-byte IV per record.
* AAD binds ciphertext to `accountId` + `providerId`, so a row copied to another
  account fails to decrypt.
* `key_version` is stored beside the ciphertext. Rotation adds a new key, keeps
  the old one for decryption, and re-encrypts lazily on read.
* The browser receives `hasApiKey` and the last four characters only.

Losing `SECRETS_KEY` makes every stored credential unreadable. That is stated in
the runbook; recovery is re-entering provider keys.

### Track 2.4 — Events that can actually produce the metrics

```text
events(id uuid primary key, account_id, name, properties jsonb, occurred_at, day date)
```

`id` is a client-generated UUID; ingest uses `on conflict (id) do nothing`, which
makes batching idempotent.

Event names, with their trigger:

| Event | Trigger | Used for |
| --- | --- | --- |
| `account_created` | Sign-up completes | Cohort start |
| `app_opened` | First authenticated load per account per UTC day, deduplicated server-side | DAU, retention |
| `project_created` | A project is created | Activation |
| `first_compile` | First successful compile for the account, once | First-compile rate |
| `first_chat` | First completed assistant turn for the account, once | First-chat rate |
| `provider_connected` | A provider is saved | Setup funnel |
| `compile_failed` | A compile returns an error | Quality |
| `chat_failed` | A turn ends in an error payload | Quality |
| `feature_opened` | A workspace panel is opened | Feature use |

Property keys are a fixed allowlist: `model`, `provider`, `error_code`,
`file_kind`, `feature`, `duration_bucket`. Unknown keys are dropped at ingest.
Never recorded: project names, file names, file contents, prompts, completions,
provider keys, IP addresses.

Metric definitions, so the queries are writable:

* **DAU** — distinct `account_id` with an `app_opened` event on the UTC day.
* **First-compile rate** — accounts with `first_compile` within 7 days of
  `account_created`, divided by accounts created in that 7-day cohort.
* **First-chat rate** — the same with `first_chat`.
* **7-day retention** — accounts with any event on UTC day 7 after
  `account_created`, divided by the day-0 cohort.

Deletion policy: raw events cascade with the account. A nightly job writes
de-identified daily counts (no `account_id`) into `event_daily`, and the same job
purges raw events older than 12 months. Historical totals therefore survive
deletion; individual rows do not. This is stated in the privacy policy.

Ingest: at most 20 events or 5 seconds, whichever comes first. One retry after
2 seconds; after that the batch is dropped and `events_dropped_total` increments.
The client queue is capped at 100 and drops the oldest first.

### Track 2.5 — Consent, export, deletion

No third-party sharing and no tracking cookies, so the requirement is a privacy
policy and a notice at sign-up, not a consent banner.

* `DELETE /api/account` removes the account, sessions, credentials, events, and
  any sync room with a matching `account_id`, then clears the cookie.
* `GET /api/account/export` returns the account record and provider metadata.
* Project source is exported from the browser. Today the only archive the app
  produces is the submission source bundle; this design adds a project ZIP export
  and names it as such.

### Track 2.6 — Operator analytics

`ADMIN_ACCOUNT_IDS` is a comma-separated environment variable of stable account
ids. `isOperator(session)` checks it. When it is unset, the analytics route
returns 403 and nobody is an operator; the design never infers an operator from
sign-up order.

`/admin/analytics` is a server-rendered page behind `isOperator`. It does not use
the dev panel, which production builds exclude.

## Alternatives Considered

### A. Browser-held provider keys

* **Pros:** No server-side secret storage, no key management, no account needed
  for the key.
* **Cons:** Readable by any script on the origin; no per-user keys on a shared
  deployment; keys do not follow the user.
* **Rejected:** The owner chose per-user server storage.

### B. Upstash Redis as the primary store

* **Pros:** Already configured; zero new infrastructure; fast for accounts and
  credentials.
* **Cons:** Retention and funnel queries need sorted sets and manual unique
  counting; no relational integrity; adding Auth.js's adapter would be bespoke.
* **Rejected:** Postgres, because the Auth.js adapter and the metric queries both
  assume SQL. Recorded here because it is the fallback if Postgres cannot be
  provisioned.

### C. A real tokenizer instead of a character estimate

* **Pros:** Exact counts per provider; no drift.
* **Cons:** Per-family tokenizers, megabytes of bundle, WASM in some runtimes.
* **Rejected:** Two-point calibration plus a 10% reserve plus the provider 413 as
  the control. Revisit if estimator errors start reaching users.

### D. xstate, or a separate store for compile state

* **Pros:** Explicit statechart; smaller `document-store`.
* **Cons:** Compile state is reset atomically with files in four places; a second
  store adds a second reset path and a window where project A's PDF renders under
  project B.
* **Rejected:** A pure reducer plus one field keeps the atomic reset and runs in
  the node-only test setup.

### E. Port Prism's compile taxonomy wholesale

* **Pros:** Matches the reference; less design work.
* **Cons:** Imports `NoURL`, `DownloadFailed`, `NotConnected`, and a retry model
  with no retry mechanism.
* **Rejected:** The app has no download, URL, or sandbox lifecycle.

### F. A chat state machine

* **Pros:** Symmetry with compile.
* **Cons:** `useChat` and `useAISDKRuntime` already own this state.
* **Rejected:** The defect is a missing error row, not a missing state model.

### G. JWT sessions

* **Pros:** No session table, no per-request read.
* **Cons:** Revocation needs a denylist; deletion cannot invalidate an issued
  token before expiry.
* **Rejected:** Database sessions, required by G11.

### H. Email magic link sign-in

* **Pros:** No identity-provider dependency; works for any user.
* **Cons:** Transactional email, deliverability, link expiry. None exists today.
* **Rejected for this pass:** GitHub OAuth needs no new infrastructure.

### I. Third-party analytics

* **Pros:** Mature funnels and retention curves.
* **Cons:** Sends identifiers to a processor; contradicts the first-party
  decision; adds consent obligations.
* **Rejected:** First-party events.

### J. Guest-first with a claimable account

* **Pros:** No sign-up wall before first value.
* **Cons:** Two identity states to test; an ownership rule on claim.
* **Rejected for this pass:** The owner wants the account at entry. Retained as
  the fallback if the gate reduces activation.

### K. Change the default model and stop there

* **Pros:** The measured failure is 22 tokens over the limit. Switching to a
  cached model with real headroom, or truncating the tool list by hand, fixes the
  reported defect in one day with no new module.
* **Cons:** Does not survive a user-selected model, a review or prover mode, or a
  large project. The next change to a tool or a guide re-breaks it silently.
* **Rejected as the whole fix:** Adopted as the first step inside Track 1.3. The
  planner exists because the failure recurs every time the prompt or tool set
  changes, not because the first instance is hard.

### L. Cut Track 2 entirely

* **Pros:** Reviewers converged on it; the repair is the actual problem; the
  account adds a wall with no user-visible benefit while projects stay local.
* **Cons:** The owner wants accounts and telemetry, and the credential work needs
  a per-user boundary eventually.
* **Rejected by the owner:** Recorded because six of nine reviewers proposed it,
  and it stays the fallback if Track 2 does not earn its cost.

## Non-Functional Requirements

**Security.** Keys encrypted per record with AAD binding and a key version.
Sessions revocable server-side. Deny-by-default on `/api/*`. No client-supplied
account identifier. The compile service runs in a temp directory; with projects
local, a malicious `.tex` file reaches only that user's compile.

**Risks and mitigations.**

| Risk | Mitigation |
| --- | --- |
| `SECRETS_KEY` lost | Credentials unreadable; runbook says re-enter keys. Rotation keeps old versions. |
| SSRF through a user-supplied provider `baseUrl` | Allowlist of hosts per preset; custom URLs restricted to public addresses; no redirects followed. |
| Event loss undercounts metrics | `events_dropped_total` counted and surfaced; the dashboard labels days with gaps. |
| Deletion rewrites history | Raw events cascade; de-identified daily rollup preserves totals. Policy states this. |
| Sync snapshots outlive account deletion | Rooms gain `account_id`; until then the policy states the limitation. |
| Operator allowlist unset | Analytics returns 403; no inference from sign-up order. |

**Performance.** Planning adds no network call. The reducer is synchronous. Event
ingest is batched and never blocks a user action.

**Rollout.** `AUTH_MODE` is `hosted`, `self-hosted`, or `off`, set server-side and
read by `proxy.ts` and every route. It does not default from `NODE_ENV`, so
`pnpm build && pnpm start` stays a valid self-host. Track 1 merges with
`AUTH_MODE=off` and can be reverted alone. Track 2 merges with `AUTH_MODE=hosted`.

## Reconciliation with the Brief

Decisions the brief left open, resolved in this document:

| Brief | Resolution | Reversal cost |
| --- | --- | --- |
| Q1 durable store | Postgres | One implementation file |
| Q2 sign-in | GitHub OAuth | One provider entry |
| Q3 key encryption | AES-256-GCM, application-level, versioned | One module |
| Q5 export shape | Account record plus source bundle; project ZIP is new | One route |
| Credentials only vs projects | Credentials and telemetry; projects stay local | Architectural |

Additions the brief did not raise:

* **Operator allowlist** (§2.6) — once every visitor has an account, the dev
  panel is reachable by every account.
* **Download disabled while stale** (§1.5) — a marker alone does not stop someone
  submitting an older document.
* **Sync rooms account-scoped** (§Data flow) — the brief assumed the server held
  nothing; it does.

No contradiction with a decision the brief had already made.

## Detailed Implementation Plan

### Track 1 — files

#### 1. `apps/web/lib/ai/request-budget.ts` (Create)

* Export `ModelBudget`, `VolatileContext`, `PlanInput`, `TrimStep`, `RequestPlan`,
  `estimateTokens()`, `planChatRequest()`. Owns the trim order, the lane choice,
  and the calibration constant. Server-side only.

#### 2. `apps/web/lib/ai/request-budget.test.ts` (Create)

* Trim steps in isolation and combination; a `.tex` lane never contains Lean tool
  names; calibration within the recorded error on two held-out requests; the 10%
  reserve rejects at 0.91 of budget.

#### 3. `apps/web/lib/chat-models.ts` (Modify)

* Add `budget: ModelBudget` to `ChatModelSelection` and to
  `groqModelSelections()`; set the default to `openai/gpt-oss-20b`; give each Groq
  model its real 8K/200K limits.

#### 4. `apps/web/lib/ai/llm-providers.ts` (Modify)

* Persist per-model budget overrides; include them in `getChatModelSelections()`;
  replace the `contextWindow: "provider"` literals at the selection sites. Accept
  an `accountId` in the store signatures; in Track 1 the account is `null` and the
  file store is used.

#### 5. `apps/web/app/api/chat/route.ts` (Modify)

* Mint a request id, select the skill and tool group, call `planChatRequest()`
  after both, emit `chat.preflight`, return `context_budget_exceeded` when the
  estimate exceeds 0.9 of budget, pass `abortSignal: req.signal` to `streamText`,
  and return the request id in `x-request-id` and the error payload. Delete
  `truncateDeep`.

#### 6. `apps/web/hooks/use-document-context.ts` (Modify)

* Emit `VolatileContext` into the transport body instead of a system string.
  Register once; do not re-register on content changes. Move
  `CODE_EXECUTION_GUIDE` and `PROOF_GOLF_GUIDE` into the planner's mode guides.

#### 7. `apps/web/components/chat-runtime-provider.tsx` (Modify)

* Send `volatileContext` in the transport body. Convert stream errors into a
  synthetic assistant message with `status: incomplete/error` and a
  `ChatErrorPayload`. Track `loadSucceeded`; pass `confirmedLoad` to saves.

#### 8. `apps/web/components/assistant-ui/error-message.tsx` (Create)

* Renders `MessagePrimitive.Error` with `ChatErrorPayload` actions: Retry,
  Connect provider or Switch model, and a details block with the request id.

#### 9. `apps/web/components/assistant-ui/thread.tsx` (Modify)

* Wrap with `MessagePrimitive.Error` and render the new component.

#### 10. `apps/web/components/workspace/editor/ai-drawer.tsx` (Modify)

* Same as §9.

#### 11. `apps/web/lib/compile-machine.ts` (Create)

* `CompileState`, `CompileEvent`, `compileReducer`, `initialCompileState()`,
  `isFresh(state, current)`. Pure; no store import.

#### 12. `apps/web/lib/compile-machine.test.ts` (Create)

* Transition table including: edit then failure leaves the PDF stale; success
  then edit leaves it stale; project switch discards a result; cancel path.

#### 13. `apps/web/stores/document-store.ts` (Modify)

* Replace `pdfData`, `compileError`, `isCompiling`, and `compileRequestId` with
  `compile: CompileState` and `compileGeneration`. Use `initialCompileState()` in
  the initializer, `hydrateProject`, `applyRemoteSnapshot`, `importProject`, and
  `deleteFile`. Update `DEFAULT_TEX_CONTENT` for the new keymap. Keep
  `requestCompile()` as the command that bumps the generation.

#### 14. `apps/web/lib/compile-project.ts` (Modify)

* Sole dispatcher. Subscribe to `compileGeneration`; compile on change and once
  after hydration. Capture `{projectId, runId, inputs}`; apply a result only when
  both identifiers match.

#### 15. `apps/web/lib/latex-compiler.ts` (Modify)

* Accept an optional `AbortSignal` and pass it to `fetch`. Map `AbortError` to a
  cancelled result.

#### 16. `apps/web/lib/compile-errors.ts` (Modify)

* Keep `describeUpstreamFailure` returning a string; add
  `classifyCompileError(error): {kind, message}`. Map connection refusal and
  non-JSON bodies to `service`, abort to `cancelled`, LaTeX log to `latex`.

#### 17. `apps/web/lib/compile-errors.test.ts` (Modify)

* Update the seven string assertions for the new classifier and add the kind
  mapping cases.

#### 18. `apps/web/app/api/compile/route.ts` (Modify)

* Emit `{kind, message, log}`; classify `ECONNREFUSED`, non-JSON, 5xx and abort;
  forward the request id.

#### 19. `apps/web/components/workspace/preview/pdf-preview.tsx` (Modify)

* Delete the mount effect and the `compileRequestId` effect. Render the PDF
  before the error banner. Show the out-of-date marker from `isFresh()`. Disable
  Download while stale, with Compile now.

#### 20. `apps/web/components/workspace/editor/latex-editor.tsx` (Modify)

* `Enter` inserts a newline; `Mod-Enter` compiles; `Shift-Enter` stays newline.
  Update the toolbar tooltip.

#### 21. `apps/web/components/workspace/project-inspector.tsx` (Modify)

* Read `compile.pdf`, `compile.error?.message`, `compile.phase`.

#### 22. `apps/web/components/workspace/submission-panel.tsx` (Modify)

* Replace `pdfData && !compileError` with `isFresh(compile, files)`; pass
  `compile.error?.message ?? null` to `analyzeSubmission`; disable Submit while
  stale.

#### 23. `apps/web/components/workspace/editor/research-tools.tsx` (Modify)

* Read `compile.pdf` instead of `pdfData`.

#### 24. `apps/web/components/dev/dev-panel.tsx` (Modify)

* Replace `pdfData`, `compileError`, and `setCompileError` reads at the listed
  lines with the reducer state.

#### 25. `apps/web/hooks/use-auto-compile.ts` (Modify)

* Read `compile.phase === "compiling"` instead of `isCompiling`; stop reading
  `compileRequestId`.

#### 26. `apps/web/lib/submission.ts` (Modify)

* Accept the compile error through the new signature; no direct store access.

#### 27. `apps/web/components/workspace/beamer-panel.tsx` (Modify)

* Two `requestCompile()` call sites keep working through the generation; no
  change beyond the import if the signature is unchanged.

#### 28. `apps/web/components/workspace/literature-panel.tsx` (Modify)

* Same as §27.

#### 29. `apps/web/components/workspace/tikz-studio.tsx` (Modify)

* Same as §27.

#### 30. `apps/web/components/workspace/patch-preview-dialog.tsx` (Modify)

* Same as §27.

#### 31. `apps/web/components/assistant-ui/merge-changes-card.tsx` (Modify)

* Same as §27.

#### 32. `apps/web/lib/projects/chat-history.ts` (Modify)

* `LoadResult` union; `saveChatMessages(projectId, messages, confirmedLoad)`.

#### 33. `apps/web/lib/storage/schema.ts` (Modify)

* Add optional `version` to `StoredChatHistory`. No `DB_VERSION` bump.

#### 34. `apps/web/lib/projects/chat-history.test.ts` (Create)

* Unreadable record is not deleted; missing record deletes nothing; `ok` round
  trips; `confirmedLoad: false` never deletes.

#### 35. `apps/web/components/workspace/sidebar.tsx` (Modify)

* Update the `loadChatMessages` call site to the new result shape.

### Track 2 — files

#### 36. `apps/web/package.json` (Modify)

* Pin `next-auth@5`, `@auth/pg-adapter`, `pg`. Add `@playwright/test` at the
  workspace root, not `playwright`.

#### 37. `apps/web/auth.ts` (Create)

* GitHub provider, `@auth/pg-adapter`, database sessions, callbacks attaching
  `accountId`.

#### 38. `apps/web/app/api/auth/[...nextauth]/route.ts` (Create)

* Export the Auth.js handlers.

#### 39. `apps/web/proxy.ts` (Create)

* Next 16 proxy on the Node runtime. Redirect `/project/*` when `AUTH_MODE` is
  `hosted`. Deny `/api/*` except auth and health.

#### 40. `apps/web/lib/server/session.ts` (Create)

* `requireSession()` returning `{ accountId }` or a 401 response; `isOperator()`.

#### 41. `apps/web/lib/server/db.ts` (Create)

* Wraps the Auth.js adapter plus `providerCredentials`, `events`, `eventDaily`,
  `syncRooms`.

#### 42. `apps/web/lib/server/db/schema.sql` (Create)

* Auth.js tables (`users`, `accounts`, `sessions`, `verification_token`) plus
  `app_accounts`, `provider_credentials`, `events`, `event_daily`, `sync_rooms`.
  Indexes on `events(day)`, `events(account_id, name)`, `events(id)`.

#### 43. `apps/web/lib/server/db/postgres.ts` (Create)

* Implements §41, including the four metric queries defined in §2.4.

#### 44. `apps/web/lib/server/crypto.ts` (Create)

* AES-256-GCM with IV, AAD, and `key_version`; boot check on `SECRETS_KEY`.

#### 45. `apps/web/lib/server/crypto.test.ts` (Create)

* Round trip, tamper detection, wrong AAD, missing key, rotation across versions.

#### 46. `apps/web/lib/server/accounts.ts` (Create)

* Create, read, delete with cascade; returns what was removed.

#### 47. `apps/web/lib/server/credentials.ts` (Create)

* Encrypted write; decrypt only inside the chat route; list returns
  `hasApiKey` and last four.

#### 48. `apps/web/lib/server/events.ts` (Create)

* Name and property allowlists; `record()`; `aggregate()`; nightly
  `rollupAndPurge()`.

#### 49. `apps/web/lib/server/events.test.ts` (Create)

* Unknown names rejected; unknown properties dropped; idempotent by id; rollup
  preserves totals after raw deletion.

#### 50. `apps/web/app/api/events/route.ts` (Create)

* Authenticated batch ingest, 50 events max, rate limited, returns 202.

#### 51. `apps/web/app/admin/analytics/page.tsx` (Create)

* Server-rendered dashboard behind `isOperator`. Shows DAU, first-compile,
  first-chat, retention, with denominators visible.

#### 52. `apps/web/app/api/admin/analytics/route.ts` (Create)

* Aggregates for §51; 403 when the allowlist is unset.

#### 53. `apps/web/app/api/account/route.ts` (Create)

* `DELETE` cascade including sync rooms, then clear the cookie.

#### 54. `apps/web/app/api/account/export/route.ts` (Create)

* Account record and provider metadata as JSON; points to the client export for
  project source.

#### 55. `apps/web/app/sign-in/page.tsx` (Create)

* Page route rendering the gate.

#### 56. `apps/web/components/auth/sign-in-gate.tsx` (Create)

* Presentational sign-in with one provider button and policy links.

#### 57. `apps/web/app/layout.tsx` (Modify)

* Wrap in the session provider.

#### 58. `apps/web/app/api/dev/llm-providers/route.ts` (Modify)

* Remove the dev gate. Require `requireSession()`; scope to the account. In
  `self-hosted` mode, allow the file store for the single operator account.

#### 59. `apps/web/components/dev/llm-providers-panel.tsx` (Modify)

* Remove the dev-only warning; add a per-model budget editor.

#### 60. `apps/web/lib/analytics.ts` (Create)

* Client emitter with the allowlist, batching, queue cap, and sign-out flush.

#### 61. `apps/web/lib/ai/llm-providers.ts` (Modify)

* Resolve credentials per `accountId`; no env fallback for accounts outside the
  operator allowlist when `AUTH_MODE` is `hosted`.

#### 62. `apps/web/scripts/import-providers.ts` (Create)

* One-shot operator command taking `--account`. Encrypts the file's providers
  under that account and leaves the source file in place until `--confirm`.

#### 63. `apps/web/.env.example` (Modify)

* `SECRETS_KEY`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`,
  `DATABASE_URL`, `AUTH_MODE`, `ADMIN_ACCOUNT_IDS`.

#### 64. `README.md` (Modify)

* State that the hosted app requires an account, that projects remain in the
  browser, and that sync snapshots are stored on the server. Add the privacy and
  telemetry summary. Document `AUTH_MODE=self-hosted`.

#### 65. `docs/privacy.md` (Create)

* Written from the data-flow table: what is stored, where, for how long, what is
  never collected, how to export and delete, and the sync-snapshot limitation.

#### 66. `tests/e2e/first-message.spec.ts` (Create)

* Fresh project reply; 413 inline error with Retry; provider 500; refused
  connection; compile failure keeps the PDF; signed-out `/api/chat` returns 401.

#### 67. `tests/e2e/compile-state.spec.ts` (Create)

* Switch projects mid-compile; edit then fail marks the PDF stale; Download
  disabled while stale.

#### 68. `tests/e2e/keymap.spec.ts` (Create)

* `Enter` newline, `Mod-Enter` compiles.

#### 69. `playwright.config.ts` (Create at workspace root)

* Starts the web app and a stub LaTeX API; `test:e2e` script.

### Verification Plan

Goal coverage. Every goal has a named check.

| Goal | Proof |
| --- | --- |
| G1 | `first-message.spec.ts`: reply, 413, 500, refused connection all end in an assistant row |
| G2 | `request-budget.test.ts` plus an assertion on the `chat.preflight` fields in the route test |
| G3 | `compile-machine.test.ts` stale-after-failure; `compile-state.spec.ts` |
| G4 | `compile-machine.test.ts` project switch; `compile-state.spec.ts` |
| G5 | `keymap.spec.ts` |
| G6 | `chat-history.test.ts` unreadable record survives |
| G7 | Self-host manual: connect a provider with `AUTH_MODE=self-hosted` and no dev build |
| G8 | `first-message.spec.ts` signed-out 401; manual signed-out page sweep |
| G9 | `crypto.test.ts`; API response inspection |
| G10 | Page test on `/admin/analytics` with fixture events; metric definitions in §2.4 |
| G11 | Export and delete acceptance in `docs/privacy.md` run-through |
| G12 | Sign-in, connect provider, key not returned |

* **Compilation/Build**: `pnpm --filter @open-prism/web build`,
  `pnpm --filter @open-prism/latex-api build`.
* **Unit Tests**: `pnpm --filter @open-prism/web test`.
* **Static Analysis**: `pnpm exec biome check`, `pnpm --filter @open-prism/web typecheck`.
* **E2E**: `pnpm exec playwright test` with the three specs.
* **Manual**: kill `latex-api` mid-compile; switch projects mid-compile; delete a
  chat record in IndexedDB; set `ADMIN_ACCOUNT_IDS` empty and confirm 403.

--------------------------------------------------------------------------------

*Drafted with EGM. Revised after a five-stage Goldfish review.*
