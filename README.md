# LeetByCompany

**Practice LeetCode by company.**

Repository: [caixiuqi2013/leet-by-company](https://github.com/caixiuqi2013/leet-by-company).

LeetByCompany combines a manually opened Chrome extension with a Next.js practice
website. Build the complete company + recency list you are authorized to view
with one click from the extension. Progress follows each problem across
companies, ranges, and historical list versions.

## Current delivery: 0.5.1

- React/TypeScript Manifest V3 extension with paginated extraction, cancellation,
  source-count validation, local checkpoints, JSON export and website handoff.
- Next.js/TypeScript/Tailwind website with automatic list building, Google OAuth routes,
  invitation checks, personal company navigation, topic/difficulty/completion
  filters, progress, version history and explicitly accepted shared updates.
- Supabase PostgreSQL migration with atomic imports, immutable snapshots,
  user-scoped idempotency and restricted server-only data access.

**This is an implemented local release, not a deployed service.** Configure
Supabase and Google OAuth before saving imports. The building page reports setup or login requirements clearly;
no mock persistence is presented as successful storage. See [validation](VALIDATION.md)
for tested behavior and outstanding live checks.

## Develop

Use Node 22+ (this session used Node 24) and pnpm. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm build:web
pnpm dev:web
```

`pnpm build` builds the extension. Tests consume that build. `pnpm test` includes
embedded PostgreSQL migration tests; the independent-connection contention test
requires a disposable localhost PostgreSQL server (see deployment documentation).

Copy `apps/web/.env.example` to `apps/web/.env.local`, then supply your own project
configuration. Never commit a service key. [Deployment guide](docs/deployment.md)
explains the migration, invitations, OAuth and Vercel setup. No remote migration
or production deployment was performed during implementation.

## Chrome extension

1. Open `chrome://extensions`, enable Developer mode, and Load unpacked from
   `apps/extension/dist` (or the delivered `chrome-extension` folder).
2. When upgrading, reload the extension and refresh your LeetCode page once.
3. Select a company and recency on `leetcode.com`. Open the extension manually.
4. Choose **Build list & start practicing**. The website opens immediately and shows
   progress while the extension reads the complete list. Keep the source tab open
   with the same company and recency; scrolling is not required.
5. The website saves the completed list and opens organized practice automatically.
   If sign-in is required, the pending list resumes after login. No file upload or
   second build click is needed. Export JSON remains available as an optional backup.

The default development build trusts **only `http://localhost:3000`**. For a deployed
site, rebuild with `LEETBYCOMPANY_WEB_ORIGIN=https://your-exact-host pnpm build`.
The Chrome manifest restricts the host and the worker additionally checks exact
origin, port, `/import`, top-level sender, random import ID and expiry. The extension
never opens automatically on company pages. No cookies or LeetCode credentials
are transferred.

## Source compatibility

The adapter reads the current favorite slug; it does not crawl companies or
construct arbitrary source lists. Supported canonical labels are 30 days,
3 months, 6 months, More than 6 months, and All. Month ranges have `days: null`.
Unknown ranges fail closed. `leetcode.cn` is out of scope.

All companies use heading/URL/visible-recency checks. Rendered company problem
links must also corroborate the current scope, but absent rows do not block
extraction. This is conservative: unusual name/slug aliases may return
`context-not-ready`. Do not interpret
this release as live verification of every company. Goldman Sachs and Amazon have
simulated regression coverage; live non-Google extraction remains pending.

Original order is preserved; array position is not source rank. Frequency is
uninterpreted source data. Missing topics display as **Uncategorized**. Counts
and completion summaries count distinct problems, even with overlapping topics.

## Data and version behavior

Complete imports create immutable snapshots and select that snapshot for the
importer. Only a newer `extractedAt` advances the shared pointer. Older imports
remain usable personally; other users do not change automatically. Equal-time
conflicting content returns a warning and leaves the existing shared winner.
“Update list” accepts an explicit newer snapshot, preserving progress and history.
“Not now” only dismisses the current view's prompt.

Schema 1.0 accepts extractor 0.x semantic versions, with explicit scope required
from 0.4 onward. Unknown major/schema versions are rejected. Existing 0.2 exports
remain readable. Client timestamps and evidence flags are not provenance proofs.
Partial/unknown exports may be downloaded for diagnosis but cannot be imported.

## Learn the implementation

- [Requirements](docs/requirements.md)
- [Architecture and database](docs/architecture.md)
- [API contract](docs/api.md)
- [Codebase guide](docs/codebase-guide.md)
- [Deployment and verification setup](docs/deployment.md)
- [Session handoff](handoff.md)
