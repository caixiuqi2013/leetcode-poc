# Working rules

Read handoff.md at session start, then verify it against git status, branch,
recent commits, README, package scripts, source, and validation records.
Preserve unrelated changes. Continue this repository rather than replacing it.

Use English for UI, identifiers, comments, documentation, and diagrams.
Keep extraction manually invoked and company + recency scoped. Never transfer
LeetCode credentials. Do not infer topics, frequency units, or source rank.
Validate external boundaries; preserve cancellation, pagination and identity checks.

Every API must derive identity from a verified session and enforce invitations.
Keep imports transactional, snapshots immutable, progress independent of lists,
and shared updates explicitly accepted by each eligible user.
Never deploy or apply remote migrations without an explicit request.

Run format:check, lint, typecheck, build, and tests for relevant changes.
Extension tests consume dist: build before testing. Database tests must use a
local disposable database. Distinguish local tests, browser observations, and
user-reported validation. Never describe mocks as live verification.

Update handoff.md after milestones, before waiting for input, and before the
final response. Record commands actually run, blockers, next steps, and changes.
