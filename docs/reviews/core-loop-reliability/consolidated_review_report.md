# Consolidated Goldfish Review — core-loop-reliability

* **Target:** `docs/designs/core-loop-reliability.md`
* **Date:** 2026-11-02
* **Method:** EGM consolidated preset. Five stages, nine fresh-context reviewers.
* **Ranges:** feature 1–553, implementation 554–902.

## Stage verdicts

| Stage | Reviewer | Verdict |
| --- | --- | --- |
| 5 Initial Zoom Out | zoom-out lens | **FAIL** |
| 6 Comprehension | comprehension test | **NOT CONTAINED** |
| 7 Critic | design | **FAIL** |
| 7 Critic | structural | **FAIL** |
| 7 Critic | style | PASS WITH CHANGES |
| 8 Intermediate Zoom Out | zoom-out lens | **FAIL** |
| 9 Implementation Readiness | readiness | **NOT READY** |

## What the reviewers agree on

Three findings recur independently across stages. They are not style opinions.

1. **The document's central privacy claim is false.** `apps/latex-api/src/sync.ts`
   persists whole project snapshots, including `files`, `projectName`, and
   `comments`, as plaintext JSON under `SYNC_DATA_DIR`. The design states twice
   that projects stay in the browser and the server holds no project content.
   The privacy policy, the export story, and the deletion cascade are all written
   from the false premise.

2. **Track 1 cannot ship independently.** G7 ("connect a provider without a
   development build") is filed under Track 1, but the only edit that delivers it
   (§39) is filed under Track 2 and scopes provider writes to an authenticated
   account. Track 1 also has to emit the events Track 2 reads. The independence
   claim is a fiction, and the reconciliation section says no contradiction
   exists.

3. **The auth gate covers pages, not the routes that cost money.** `middleware.ts`
   redirects `/project/*`. `/api/chat`, `/api/ai/fix`, `/api/ai/subagent`,
   `/api/compile`, `/api/code/run` and `/api/lean/*` have no session check, and
   `resolveChatModel` falls back to the operator's environment key. A signed-out
   caller can spend the operator's provider budget.

## Blockers

| ID | Finding | Change |
| --- | --- | --- |
| B1 | Privacy premise false: sync server stores plaintext project snapshots | Add a data-flow table covering compile payloads, sync snapshots, prompts, keys, events. Account-scope sync rooms so deletion reaches them. Rewrite §2.5, §35, §45 from the table. |
| B2 | Track 1/Track 2 coupling disguised as a seam | Move G7 to Track 2, or split §39 into a Track 1 edit (remove dev gate, file store) and a Track 2 edit (account scoping). Correct the independence claim either way. |
| B3 | Auth boundary stops at pages; operator keys spendable while signed out | Deny by default for `/api/*` except auth and health. One `requireSession()` used by every data route. Remove or explicitly scope the env-key fallback with a quota. |
| B4 | `isFresh` marks a failed compile as fresh | Capture `pdfInputs` only on success and compare current files to that. Accept the compile result, not the compile start, as the freshness anchor. |
| B5 | `planChatRequest` cannot own request size | Run it server-side after skill selection and tool construction. `MATHEMATICAL_PROVER_SKILL` alone is 10,682 chars and is appended in the route today. |
| B6 | Default stays on an uncached 8K model, so "Switch model" cannot help | Default to a cache-supported model, or remove "default" from CUJ 1 and state that the zero-config path is unsupported. |
| B7 | Error rendering is designed against primitives that do not exist | `ai@6.0.57` has no `error` UIMessage part; assistant-ui renders `MessagePrimitive.Error` from message status. Define `ChatErrorPayload`, attach it to a synthetic assistant message, render `MessagePrimitive.Error`. |
| B8 | Compile API consumers not enumerated | `pdfData`/`compileError`/`isCompiling` are read in six unlisted files; `requestCompile()` has 12 call sites in eight files; deleting the mount effect means a freshly opened project never compiles. |
| B9 | Analytics has no reachable surface | The dev panel returns `null` in production. Add an operator-gated page and an `ADMIN_ACCOUNT_IDS` variable; never infer "first account is admin". |
| B10 | Event model cannot produce the promised metrics | No daily heartbeat event, so DAU and retention undercount. Deletion cascades over events and rewrites history. No rollup job exists for the 12-month rule. |
| B11 | First-account key import hands operator keys to a stranger | Replace with an explicit operator command taking an account id; never import on sign-in; leave the source file until confirmed. |

## Majors

| ID | Finding | Change |
| --- | --- | --- |
| M1 | Contradiction: "prompt and schemas alone exceed 7,000" vs "5,273 before any document" | Restate: the full request measured 7,022; prompt and schemas account for 5,273. |
| M2 | Chat-history defect placed on the wrong branch | The `null` return is treated as empty; `messages` not being an array is the trigger, not a parse throw. Return `ok` / `missing` / `unreadable`. |
| M3 | "Export currently produces a project ZIP" is false | Only the submission source bundle exists. Define export as account record plus source bundle and rename accordingly. |
| M4 | "Byte-identical prefix" is impossible with per-file-kind tool gating | Either pin the tool group per conversation, or declare the prefix per-kind and delete the caching claim for mixed projects. |
| M5 | A ±5% estimate is 16× the 22-token overage | Reserve 10% headroom, calibrate on two requests, and treat the provider 413 as the control rather than the fallback. |
| M6 | `db.ts` is one implementation with a two-implementation story, and it is not an Auth.js adapter | Decide Q1. Adopt the official adapter schema (`users`, `accounts`, `sessions`, `verification_token`). Drop the Redis implementation from this pass or specify it. |
| M7 | Admin allowlist has no storage, bootstrap, or variable | Add `ADMIN_ACCOUNT_IDS`, document it, return 403 when unset, add one-line exception to the no-roles non-goal. |
| M8 | Verification plan does not prove G2, G5, G6, G8, G10, G11 | Add the six missing checks; add a goal-to-test table to the document. |
| M9 | Dependency and API mismatches | Pin `next-auth@5`, a Postgres driver, `@playwright/test` (not `playwright`) at the root; `streamText` takes `abortSignal`, not `signal`. |
| M10 | Open Questions is a decision log with internal contradictions | Rename to Decisions and Open Questions, add status, move Q1/Q2/Q3/Q5 to decided. |
| M11 | CUJs restate goals instead of exercising them | Add switch-project-mid-compile, keymap, and delete/export journeys. Extend CUJ 1 with a provider 500 and a network refusal. |
| M12 | NFRs omit the risks the plan creates | Add `SECRETS_KEY` rotation, SSRF via user-supplied base URL, fire-and-forget event loss, and the deletion/retention conflict. |

## Nits

| ID | Finding |
| --- | --- |
| N1 | Repetition: "projects stay in the browser" appears five times; Postgres/Redis four times. Add a five-line glossary (track, budget, headroom, freshness, run/generation). |
| N2 | Thirteen banned or vague adjectives and adverbs: worse, sane, complete, awkward, meaningfully, stronger, slightly, solved, exactly, comfortably, fast, mature, small. |
| N3 | Items 18 and 19 are out of order: `chat-history.ts` changes before `StoredChatHistory.version` is added. |

## Traceability

| Raw finding | Stage | Action |
| --- | --- | --- |
| Sync server persists project snapshots | 5, 8 | B1 |
| Track 2 is a separate bet | 5, 8 | B2 |
| Planner cannot own size (skills appended later) | 5, 7d, 8, 9 | B5 |
| Default model unchanged, Switch model is a dead end | 5, 7d, 8 | B6 |
| Credentials have no coherent owner | 5, 7c, 7d, 8, 9 | B2, B11 |
| NODE_ENV rollout breaks self-host | 5 | B2 |
| Dev panel excluded from production | 5, 7b, 9 | B9 |
| Preflight estimate as gate | 5, 7d | M5 |
| API routes unauthenticated, env fallback | 7d, 8, 9 | B3 |
| `isFresh` wrong anchor | 7b, 8 | B4 |
| No `error` part in installed SDK | 7d, 9 | B7 |
| Compile consumers unlisted | 6, 7d, 9 | B8 |
| `PlanInput`/`CompileEvent` undefined | 6, 9 | B5, B8 |
| Event store cannot compute G10 | 7d, 8, 9 | B10 |
| Token figure contradiction | 7e, 7c | M1 |
| History defect misdescribed | 7e | M2 |
| Export claim false | 7e | M3 |
| Prefix not byte-identical | 7d, 8, 9 | M4 |
| db.ts seam / adapter mismatch | 7d, 8, 9 | M6 |
| Open Questions contradictions | 7b | M10 |
| Verification gaps | 7b, 9 | M8 |
| Dependency pins, abortSignal | 9 | M9 |
| Repetition and banned words | 7b, 7e | N1, N2 |
| Item ordering | 9 | N3 |

## Recommendation

The document has two viable futures and one non-viable one.

**Non-viable:** ship it as written. Six of the nine reviewers found blockers in the
same three places: the privacy premise, the track boundary, and the auth
perimeter. Each is a correctness problem, not a polish problem.

**Viable, and recommended:** cut Track 2 into its own design. What remains is a
six-defect repair that fits in a handful of files with no new infrastructure: one
persisted error row, one compile reducer anchored on successful inputs, the
keymap, a non-destructive history load, and a request that fits the default model
by loading only the tool group the project needs. Every reviewer who proposed a
cut proposed this one.

**Viable, with more work:** keep both tracks and fix B1–B11 first. The work is
real but bounded: a data-flow table, an auth perimeter, an adapter choice, and an
event model with a heartbeat and a retention rule.

The single change that most improves the design is separating the repair from the
platform, because the repair is the actual problem and the platform is a bet that
has not been costed against the user benefit it removes.
