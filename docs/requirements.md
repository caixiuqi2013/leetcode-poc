# Confirmed requirements

LeetByCompany: Practice LeetCode by company. All UI and implementation documentation
are English. Continue the existing repository; never replace the extraction pipeline.

## Extraction

User-authorized leetcode.com pages only. No automatic crawling, no automatic popup,
no LeetCode credential transfer. Extract the complete selected company + recency,
ignoring page search/filters/sort. Preserve source order, internal and frontend IDs,
raw frequency, nullable source rank and empty topics. Do not infer topics or units.
Validate source responses, uniqueness/counts, pagination and context cancellation.
Company and recency identities require page evidence; unsupported shapes fail closed.

## Personal practice

Google login with server-enforced invitations. Shared physical tables, user-owned
lists and global per-user/per-problem completion. Users see only datasets personally
imported, then may accept newer shared versions of those same datasets. One company
card, imported recencies inside the company view. Topic, difficulty and completion
filters; overlapping topics do not inflate totals. Empty topics are Uncategorized.
Historical views use current completion, not past completion snapshots.

## Import and versioning

The current user request supersedes the original manual-upload UI requirement:
the extension's single Build list action starts extraction and opens the website
immediately. The website displays real progress, saves via the validated import
API, and opens the existing organized list automatically. There is no separate
Extract problems or JSON upload step. The import API and optional JSON backup
remain supported. Pending builds survive reload/login; auth/setup failures are
explicit and never presented as successful persistence. Each accepted
extraction has an immutable snapshot, import receipt and personal history entry.
The shared pointer is the latest complete extracted set, never a historical union.
Freshness uses extractedAt within company + canonical recency; importedAt is separate.
Older imports can select older personal versions without changing shared freshness.
Equal timestamp/equivalent content does not compete; conflicting content is saved
with an explicit warning while preserving the existing shared winner.

Content equivalence includes canonical company/recency identity, display labels,
scope, and ordered normalized problem fields (including topics order, rank and
frequency). It excludes extractionId, producer version, timestamps and client
validation evidence. Request idempotency separately hashes the entire validated
payload: same user + extractionId + same payload returns the original receipt;
a different payload conflicts.

New shared versions never silently update another user's personal pointer.
Refresh requires an explicit target, ownership, matching dataset, a strictly newer
timestamp and the current shared winner. Stale offers conflict rather than silently
substituting a new target. Repeating an accepted refresh is a no-op. “Not now” only
changes view state. Progress is never created or removed merely by importing.

## Release boundaries

No production deployment or remote migrations authorized. No product decisions
remain unresolved. External configuration and live validation are still required:
Supabase/Google OAuth, exact production origin, owner/friend allowlist, missing real
0.4.0 Google_30Days.json, and live representative non-Google extraction.
