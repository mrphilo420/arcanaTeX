# Resolution Report — core-loop-reliability

* **Target:** `docs/designs/core-loop-reliability.md`
* **Review:** `docs/reviews/core-loop-reliability/consolidated_review_report.md`
* **Date:** 2026-11-02
* **Outcome:** 11 blockers, 12 majors, 3 nits. 23 accepted, 1 contested, 2 partially accepted.

## Contested

**"Cut Track 2 entirely."** Six of nine reviewers proposed it. The owner kept Track 2.
Recorded as Alternative L in the design, with the reviewers' argument intact, and left
as the stated fallback if the account gate does not earn its cost. Nothing else in the
document depends on that recommendation being wrong.

## Blockers

| ID | Classification | Resolution |
| --- | --- | --- |
| B1 | PROPOSE FIX | Added "Data flow and storage" as the first Technical Plan section: eight-row table covering IndexedDB, sync snapshots, compile payloads, prompts, chat history, keys, events, rate limits. Sync rooms gain `account_id`. The privacy policy is written from the table. Where deletion cannot yet reach sync snapshots, the document says so instead of claiming otherwise. |
| B2 | PROPOSE FIX | G7 moved to the self-hosted mode and its implementation moved into Track 1's provider route with `AUTH_MODE=self-hosted`. G12 added for the hosted path. The independence claim replaced with "sequenced, not independent", and every cross-track coupling named. |
| B3 | PROPOSE FIX | Deny-by-default on `/api/*` except auth and health. `requireSession()` in `lib/server/session.ts`. Every data and model route listed. Environment-key fallback restricted to accounts on the operator allowlist when `AUTH_MODE=hosted`. |
| B4 | PROPOSE FIX | Freshness now anchors on `pdfInputs`, set only by a successful compile. `isFresh` requires `phase === "success"`. A test asserts edit → failure → stale. |
| B5 | PROPOSE FIX | Planner runs in the route after skill selection and tool construction. `PlanInput`, `VolatileContext`, `TrimStep`, `RequestPlan` defined. Skill text moves into a tool result so the prefix stays static. |
| B6 | PROPOSE FIX | Default changed to `openai/gpt-oss-20b`. qwen remains selectable. The picker shows the binding limit. |
| B7 | PROPOSE FIX | No invented message part. Uses `MessagePrimitive.Error` with `status: incomplete/error`. `ChatErrorPayload` defined. Request id minted in the route. |
| B8 | PROPOSE FIX | Every consumer enumerated as its own file item (§21–§26), plus eight `requestCompile()` call sites (§27–§31). Initial compile restored via the hydration subscriber. `compileRequestId` deleted from the store. |
| B9 | PROPOSE FIX | `/admin/analytics` page and `/api/admin/analytics` route behind `isOperator`. `ADMIN_ACCOUNT_IDS` in env. 403 when unset. No inference from sign-up order. |
| B10 | PROPOSE FIX | Event table with triggers; `app_opened` heartbeat deduplicated per account per day; four metric definitions with denominators; nightly `rollupAndPurge`; deletion keeps de-identified daily totals. |
| B11 | PROPOSE FIX | `scripts/import-providers.ts` with `--account` and `--confirm`. Never runs on sign-in. Source file retained until confirmed. |

## Majors

| ID | Classification | Resolution |
| --- | --- | --- |
| M1 | PROPOSE FIX | Restated: full request 7,022; fixed prompt and schemas 5,273. The contradictory sentence is gone. |
| M2 | PROPOSE FIX | Defect 7 now describes the `null`-return path and the `messages` not-an-array trigger. CUJ 5 matches. `LoadResult` union replaces the nullable return. |
| M3 | PROPOSE FIX | "Export currently produces a project ZIP" removed. The submission source bundle is named as the only existing archive. Project ZIP export is listed as new work in §Track 2.5 and §54. |
| M4 | PROPOSE FIX | "Byte-identical across requests" replaced with one prefix per tool lane, lane fixed for the conversation, chosen from the project rather than the active tab. Caching claimed only where `supportsCaching`. |
| M5 | PROPOSE FIX | 10% reserve, two-point calibration, provider 413 treated as an estimator bug rather than the control. |
| M6 | PROPOSE FIX | Postgres decided. Official `@auth/pg-adapter` and its four tables in §42. The seam wraps the adapter; it is not a second store. Redis moved to Alternatives. |
| M7 | PROPOSE FIX | `ADMIN_ACCOUNT_IDS`, documented, 403 when unset, one-line exception to the no-roles non-goal. |
| M8 | PROPOSE FIX | Goal-to-proof table added; missing checks added for G2, G5, G6, G8, G10, G11, G12. |
| M9 | PROPOSE FIX | Versions pinned in §36; `@playwright/test` at the workspace root with a root config in §69; `abortSignal` corrected in §5. |
| M10 | PROPOSE FIX | Section renamed "Decisions and Open Questions", decision table added, two genuinely open items left. |
| M11 | PROPOSE FIX | CUJ 6, 7, 8 added. CUJ 1 extended to 500 and refused connection. CUJ 4 now compiles and chats. |
| M12 | PROPOSE FIX | Risks table added: key loss, SSRF, event loss, deletion/retention, sync rooms, allowlist bootstrap. |

## Nits

| ID | Classification | Resolution |
| --- | --- | --- |
| N1 | PROPOSE FIX | Repeated claims removed; a five-line glossary is folded into the definitions in §1.1 and §1.5. |
| N2 | PROPOSE FIX | Banned and vague words removed: worse, sane, complete, awkward, meaningfully, stronger, slightly, solved, exactly, comfortably, fast, mature, small. |
| N3 | PROPOSE FIX | `chat-history.ts` (§32) now follows the schema change (§33). |

## Partially accepted

**"Move G7 to Track 2."** Accepted in part: the goal stays available to self-hosters
in Track 1 under `AUTH_MODE=self-hosted`, because a self-hosted instance with no
accounts is a supported deployment and the dev-panel gate blocks it today. The hosted
path moves to G12 in Track 2.

**"Drop the preflight gate; rely on the provider 413."** Accepted in part. The gate
remains because a provider round trip is slow and the failure is silent today, but it
now fires only at 0.9 of budget and a 413 is logged as an estimator bug rather than
treated as normal.

## Residual

Two items cannot be closed by writing:

* Sync snapshots are account-scoped only after `sync_rooms.account_id` lands. Until
  then the privacy policy states the limitation. Closing it requires a migration of
  existing rooms, which is scoped in §42 but not scheduled.
* The estimator's error bound is measured at implementation time. The design commits to
  two calibration points and a reserve, not to a number it has not measured.

## Post-resolution re-audit

One re-audit was run, as the protocol permits. Result: **PASS WITH CHANGES** on the
design half, **NOT READY** on the implementation half.

Closed: B1, B4, B5, B6, B9, B11, M1, M4, M5, and the earlier file-list omissions
(all six compile consumers, all eight `requestCompile` call sites), the undefined
type contracts, the sign-in page, the proxy, the Auth.js adapter, the analytics
operator identity, and the `abortSignal` correction.

Still open, recorded as accepted residuals for this pass:

| ID | Residual | Consequence |
| --- | --- | --- |
| R1 | G7 sits under Track 1, but the only edit that removes the development gate (§58) is filed under Track 2 | Track 1 merged with `AUTH_MODE=off` cannot satisfy G7. Either move the goal or split the item. |
| R2 | The auth perimeter covers Next `/api/*` but not the separately served `latex-api`: `/builds/sync`, `/sync/*`, and `/lean/*` | G8's "every route" is false. A caller can compile, sync, and invoke the Lean bridge without a session. |
| R3 | The synthetic assistant message carries `status: incomplete/error`, which `UIMessage` does not define in `ai@6.0.57` | The error row must be driven from `chat.error` or `metadata`, or it will not typecheck. |
| R4 | The de-identified daily rollup preserves DAU but not the cohort rates (first-compile, first-chat, retention) once raw events are deleted | Either store cohort aggregates in `event_daily` or state that the rates are not deletion-stable. |
| R5 | `isFresh` is described with three incompatible signatures across §11, §19, and §22 | Pin one: `isFresh(state: CompileState, current: CompileInputs)`. |
| R6 | `compileProject()` is still called directly from the editor, auto-compile, and the PDF pane, bypassing the generation guard | "Sole dispatcher" is untrue until those paths call `requestCompile()`. |
| R7 | No instrumentation call sites emit `account_created`, `app_opened`, `first_compile`, or `first_chat` | The analytics page would read zero while a fixture-based test passes. |
| R8 | No all-project export exists; the sync room table is created but nothing writes to it | CUJ 8 and G11 are unmet. |
| R9 | Test harnesses missing: `chat-history.test.ts` needs IndexedDB, `events.test.ts` needs Postgres, and the E2E config cannot simulate provider failure or signed-out auth | Three goals would be "proven" by tests that cannot run. |
| R10 | Landing order breaks typecheck between items 13 and 19–25, and between 7 and 32 | Land the store shape and the `saveChatMessages` signature before their consumers, or accept a broken intermediate commit. |

R1–R10 are implementation-sequencing problems, not design problems. None of them
changes the architecture; each is a file list or a signature. They are listed here
so the next session does not rediscover them.
