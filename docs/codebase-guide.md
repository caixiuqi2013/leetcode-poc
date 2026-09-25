# Codebase guide

Read `packages/shared/src/schema.ts` first. It defines an extraction independently
of Chrome or the website. Then follow these flows.

## Extract

1. `apps/extension/src/popup.tsx` renders status and sends BUILD_LIST.
2. `worker.ts` creates a persisted task, injects `content.ts`, and pins the document.
3. `dom.ts` verifies source identity; `ready.ts` allows the SPA up to ten seconds.
4. `leetcode.ts` builds the observed GraphQL request and normalizes source fields.
5. `engine.ts` paginates, checks context before/after requests, deduplicates, persists
   partial checkpoints and decides completeness. It does not scroll the page.
6. `state.ts` handles task recovery. The popup exports validated JSON.

Why check context repeatedly? Navigation can occur while a request is in flight.
The response must not enter a list whose company or recency has since changed.

## Import

1. `handoff.ts` stages a task-bound capability and opens the website before extraction starts.
2. `components/importer.tsx` polls build progress through `lib/build-flow.ts`.
   Ready payloads are validated and retained across login, saved automatically and
   opened in the existing practice view. No file-picker or second confirmation is shown.
3. `app/api/[[...path]]/route.ts` authenticates, checks request shape and routes imports.
4. `lib/import-service.ts` validates through shared `import.ts`, computes stable
   content/request hashes and invokes one RPC through `lib/server.ts`.
5. `supabase/migrations/001_leetbycompany.sql` implements the transaction. Read
   `import_list` in order: locks → retry lookup → snapshot → shared comparison →
   personal selection → history → receipt. Any SQL error rolls back the whole call.

## Practice and progress

`components/dashboard.tsx` loads personal companies, not a public catalog.
`components/practice.tsx` selects a recency and renders an authorized list.
`lib/practice.ts` supplies distinct totals and filters. The table preserves source
position and renders Uncategorized when topics are empty. Checkbox changes send an
explicit desired state to `set_progress`; they never toggle blind database state.

## Refresh and history

`read_list` compares the selected personal snapshot to the shared winner.
The UI stores “Not now” in React state only. “Update list” posts the exact offered
snapshot ID. `refresh_list` checks ownership, dataset, freshness and target eligibility,
then records the previous/current selections through version history. Historical
reads overlay today's `user_progress`; reading history is not selecting a new current
version. A direct older import is intentionally allowed to select an older snapshot.

## Authentication

`auth/login` starts Google OAuth with a fixed callback origin. `auth/callback`
exchanges the code and checks invitations. Every API independently calls `member()`
so access is enforced even when a client skips the UI. The browser receives no
service credentials. SQL tables and privileged RPCs deny browser roles entirely.

## Tests

- Existing core/source/content/worker tests protect pagination and cancellation.
- `import.test.ts` checks compatibility, normalization and overlapping topic counts.
- `database.test.ts` executes migration/functions on embedded PostgreSQL, including
  rollback and access failures. Optional localhost PostgreSQL tests real contention.
- `handoff.test.ts` exercises hostile origins, frames, IDs and expired capabilities.
- `VALIDATION.md` distinguishes these tests from browser observations and user reports.
