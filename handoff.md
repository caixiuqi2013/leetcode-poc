# Session handoff

- Date: 2026-09-25
- Branch: codex/leet-by-company (prior implementation branch: codex/leetcode-poc)
- Baseline commit: eaf8892. Fetched origin/main 8c93d56; initial file trees matched.
- Working tree was clean at start. All current changes belong to this implementation;
  they remain uncommitted and have not been pushed. No remote migrations or deployment.

## Completed implementation

- A: AGENTS.md, Prettier/ESLint, readable TypeScript, English requirements,
  architecture/API/codebase/deployment guides. Formatting and behavior changes are
  combined in the working diff; unchanged provenance JSON fixtures were restored.
- B: LeetByCompany branding and English extension messages, release 0.5.0.
- C: Company-independent recency parser and DOM scope validation. Every company
  uses heading/URL/visible-recency agreement; rendered source links corroborate
  scope when present. No Google-only conditional remains. Unusual heading/slug
  aliases still fail closed rather than guessing identities.
- D: Next.js/TypeScript/Tailwind dashboard, real JSON preview, company recencies,
  topic/difficulty/completion filters, Uncategorized and distinct totals.
- E: Supabase Google OAuth routes, verified-session invitation checks, migration,
  server-only RPCs, immutable snapshots, atomic import and per-user progress.
- F: Explicit target refresh, newer-version prompt, view-only dismissal, current
  progress in historical versions, conflict warnings and personal version history.
- G: Restricted external Chrome messaging with origin/path/frame/ID/expiry checks;
  one local staged import, retained website pending payload across login redirects.

## Verification actually executed

- pnpm format and pnpm format:check: passed.
- pnpm lint and pnpm typecheck: passed.
- pnpm build: extension 0.5.0 built.
- pnpm test: 86 tests, 85 passed, zero failed, one explicitly skipped.
  TEST-RESULTS.txt contains this session's output.
- pnpm build:web: production compilation, TypeScript and route generation passed.
- Database tests execute the migration on PGlite (embedded PostgreSQL). They cover
  rollback, ownership, idempotency, timestamp conflicts, immutable snapshots,
  progress across companies/history, refresh/no downgrade and invitation revocation.
- Native initdb attempted; sandbox denied shared-memory allocation. The optional
  independent-connection lock-contention test remains skipped, not passed.
- Real local in-app browser upload of checked-in 0.2 export: 152 problems, one
  Uncategorized; pending import survived reload. Narrow layout visually inspected.
- Chrome Goldman Sachs page opened but DOM inspection timed out. No live non-Google
  extraction or extension-to-site handshake was verified this session.

## External dependencies and limitations

- Supabase project URL/keys, Google OAuth settings, invitation rows and production
  origin are not configured. No authenticated end-to-end persistence claim.
- User reports all Google ranges work; historical live artifact is version 0.2.0.
  Mentioned Google_30Days.json version 0.4.0 was not supplied/found. Tests use an
  explicitly synthesized 0.4 metadata variant for compatibility only.
- All canonical source recencies are recognized, unknown ranges rejected. Aliased
  company headings may need additional observed identity evidence.
- Newer shared winner eligibility is checked at refresh; stale offers conflict.
- Filtering currently loads the authorized snapshot before in-memory pagination.
- No outstanding product decisions. Deployment/configuration needs owner action.

## Next steps

1. Review working diff and docs/deployment.md. Configure a local/staging Supabase
   project and Google OAuth when authorized; never paste service keys into chat.
2. Apply reviewed migration only when explicitly requested; seed invited emails.
3. Verify two invited users and one uninvited user through the real website.
4. Verify Goldman Sachs and another company in Chrome, and the extension handoff.
5. Run TEST_DATABASE_URL against a disposable localhost server for real contention.
6. Review/commit changes; publish/deploy only when requested. Rebuild the extension
   with the exact trusted HTTPS website origin before distributing a hosted build.

## Latest update: one-click build flow (0.5.1)

- User superseded the manual-upload/dual-button UX: only Build list & start practicing
  is needed in the extension. Existing practice rendering stays intact.
- worker.ts creates/pins the source task, opens the website, then runs extraction.
  handoff.ts exposes task-bound progress/ready/error states to the trusted origin.
- importer.tsx now polls, shows progress, automatically saves and opens the list.
  build-flow.ts retains the capability or ready payload across reload/login.
  New links supersede old pending payloads. Setup errors are now human-readable.
- Separate Extract problems, Retry and web file-picker/build confirmation removed.
  Optional JSON backup remains in extension details; API import contract unchanged.
- Current run: lint, typecheck, extension build passed; 90 tests passed, 1 skipped.
  Next.js production build and format:check passed. After localhost permission
  was granted, the production server started on port 3000. Browser reload verified
  removal of the file picker/second build button, retention of the user's Microsoft
  pending list, and the readable account/database setup error. Narrow layout checked.
- Changes remain uncommitted, layered on the prior session's uncommitted work.
  No database migrations, deployment, or push performed. Supabase setup remains
  the blocker for a live authenticated automatic-save demonstration.

## Repository rename and publication checkpoint: 2026-09-25

- User requested committing today's implementation and renaming the local and
  GitHub repositories to leet-by-company. GitHub rename is verified by stable
  repository ID 1375172750; local root is now outputs/leet-by-company.
- Origin is https://github.com/caixiuqi2013/leet-by-company.git. Root package name
  and README link match. Original local branch/history remains preserved.
- Publishing uses the connected GitHub app because the local Git credential was
  rejected. The release commit extends origin/main; local release branch will
  be synchronized to the same verified commit and tree after publication.
- Latest checks: format:check, lint, typecheck, extension build and Next.js
  production build passed. Tests: 90 passed, 1 skipped, 0 failed.
- No secret-pattern matches found in commit candidates; only .env.example is
  eligible for commit. Supabase remains unconfigured; no deployment or migration.
- Next step remains Supabase/Google setup and authenticated end-to-end validation.
