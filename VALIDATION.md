# Current update: one-click building, 0.5.1

The extension now starts extraction and opens the website with one Build list action.
The website polls real task progress, automatically saves validated complete data,
resumes across login and opens the existing organized practice page. File-upload UI
and the separate Extract problems action have been removed; JSON backup remains.

Current checks: formatting, lint, TypeScript, extension and Next.js production builds passed. 91 tests: 90 passed,
zero failed, one independent-connection PostgreSQL test still explicitly skipped.
New tests cover opening the website before RUN, pinned source context, task progress,
failed/cancelled/replaced/expired builds, validated readiness, reload/login retention,
and understandable setup/authentication errors. These use controlled browser/Chrome
boundaries; they do not claim a live extension-to-Supabase run.

The production server was started on localhost:3000. Browser verification confirmed
that the upload and second build controls are removed, the existing Microsoft pending
list survives reload, and missing setup produces a readable recovery message.

Supabase configuration remains absent. Automatic server save/navigation is implemented
but cannot be verified live until authentication and database setup are complete.

---

# LeetByCompany validation

## Current session: 2026-09-25, release 0.5.0

These results are distinct from historical POC results. No production deployment,
remote migration or configured Google/Supabase login was performed.

### Executed locally

- `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm build`: passed in the latest run.
- `pnpm test`: 86 tests, 85 passed, 0 failed, 1 explicitly skipped.
- `pnpm build:web`: Next.js production compilation, TypeScript and route generation passed.
- `pnpm test:db`: integrated in the full suite; actual SQL migration/transactions execute
  on embedded PostgreSQL (PGlite), not a fake in-memory business-logic implementation.
- Native `initdb` was attempted but sandbox shared-memory allocation was denied.
  Independent-connection lock contention is therefore skipped. Queued simultaneous
  imports in PGlite pass but do not establish cross-process lock behavior.

Tests cover the original 68 extraction scenarios, canonical/import validation,
simulated Goldman Sachs/Amazon context detection, same-user idempotency conflicts,
equal-time content conflicts, older/newer imports, transaction rollback, immutable
snapshots, personal pointer isolation, explicit refresh, history with current progress,
unauthorized reads/progress/RPCs and hostile extension handoff messages.

### Browser observations this session

The local Next.js production server returned HTTP 200. Using the in-app browser,
selected the real checked-in 0.2.0 export through the file picker. The import preview
showed Google / 30 days, 152 distinct problems and 1 Uncategorized problem. Reloading
the page preserved the pending import. The narrow-screen layout was visually inspected.
This is real local preview verification, not a successful authenticated server import.

Chrome opened a Goldman Sachs / 6 months tab, but attempts to read that tab timed out.
No non-Google source DOM or live extraction was verified this session. Tests simulate
the observed Google page structure and supplied Goldman Sachs route. General support
is guarded by runtime heading, visible recency and rendered-link checks; it is not a
claim of successful extraction for every company or name/slug alias.

### Still unverified

- Real 0.4.0 `Google_30Days.json` mentioned in the request was not attached/found.
  Compatibility is checked with a clearly synthesized 0.4 metadata variant of the
  real 0.2 export, not claimed as a second real export.
- Live representative non-Google extraction and Chrome external handoff.
- Google OAuth, Supabase REST/RPC grants in a configured project, invitation hook
  execution by Supabase Auth, two-user browser workflows and Vercel deployment.
- Independent PostgreSQL connection contention; optional local-server test is included.
- New extension live worker suspension and popup lifecycle (simulated tests pass).

## Historical source evidence (not rerun live)

The user supplied a real `favoriteQuestionList` request and first-page response:
100 questions, totalLength 152, hasMore true, Google / 30 days. The sanitized fixture
retains IDs, title, slug, difficulty, frequency, topics and pagination only.
Internal ID 2058 differs from frontend number 1929. Frequency units are unknown;
no source rank field exists. One first-page problem has no topics.

The checked-in `examples/google-thirty-days.live.complete.json` is a real 0.2.0
user export with 152 unique questions, missingRequired 0, missingTopics 1 and null
ranks. Its original bytes remain unchanged; `LIVE-VALIDATION.json` records the hash
and earlier cross-checks. The first 100 match the supplied response; first/middle/last
IDs 1/162/122 matched previously observed DOM positions 1/77/152.

Earlier browser observations confirmed all five Google dropdown/URL mappings.
0.2.1 fixed SPA scope handling by using live tab URL plus pinned document ID rather
than treating sender.url as current SPA state. 0.3.0 added all Google ranges. 0.4.0
removed the manual-scroll/full-DOM requirement and made whole-recency semantics
explicit. The user now reports all supported Google recencies work reliably.
These user reports are separate from this session's local tests.

The old offline `supplied-page.partial.json` is only a 100/152 transformed sample;
it is not a complete extraction and is correctly rejected for website import.
