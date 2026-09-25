# API contract

All endpoints require a verified Supabase session and active invitation. Mutations
require `Origin` equal to configured `APP_URL` and `Content-Type: application/json`.
Responses are JSON with `Cache-Control: no-store`. UUID inputs are validated.
No endpoint accepts `user_id`. Request bodies are limited to 16 MB.

| Method and path                                        | Request                                                               | Response                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------- |
| POST `/api/imports`                                    | `{extraction: ExtractionV1, idempotencyKey: extraction.extractionId}` | `{importId,snapshotId,listId,sharedOutcome,warnings}`    |
| GET `/api/me/companies`                                | None                                                                  | `[{slug,name,recencies:[{key,listId,total,completed}]}]` |
| GET `/api/me/lists?company=google&recency=thirty-days` | Exact company and canonical key                                       | Authorized list projection below                         |
| GET `/api/me/lists/{listId}/problems`                  | Optional `topic`, `difficulty=Easy                                    | Medium                                                   | Hard`, `completed=true | false`, `page>=1`, `limit=1..100` | `{problems,filteredTotal,page,limit,summary}` |
| GET `/api/me/lists/{listId}/versions`                  | None                                                                  | `[{snapshotId,selectedAt,selectionSource,extractedAt}]`  |
| GET `/api/me/lists/{listId}/versions/{snapshotId}`     | Previously selected snapshot                                          | List projection with current completion                  |
| POST `/api/me/lists/{listId}/refresh`                  | `{targetSnapshotId}`                                                  | `{snapshotId,changed}`                                   |
| PUT `/api/me/progress/{problemId}`                     | `{completed:boolean}`                                                 | `{problemId,completed}`                                  |

List projection: `{listId,company:{slug,name},recencyKey,snapshotId,currentSnapshotId,
extractedAt,problems,versions,newerVersion,summary}`. `newerVersion` is null or
`{snapshotId,extractedAt}`. Summary is `{total,completed,topics}` with distinct totals.
Problem projection: `{problemId,leetcodeId,frontendId,position,title,slug,url,difficulty,
topics,frequency,rank,completed}`. Position starts at one; rank may remain null.

`sharedOutcome`: `updated`, `older`, `equivalent`, or `version-conflict`.
Version conflicts are successful preserved imports with warnings, not failed
transactions. Idempotency conflicts return HTTP 409 and write nothing.
Repeating the same successful import returns its original receipt and does not
reselect an older version if the user has subsequently refreshed.

The export contract lives in `packages/shared/src/schema.ts`; import-specific
canonical identity/completeness rules live in `packages/shared/src/import.ts`.
Counts, uniqueness, topics coverage, evidence consistency and required fields are
rechecked. Complete flags alone are insufficient; evidence is not provenance proof.
Schema 1.0 / extractor 0.x are supported; 0.4+ requires explicit full-list scope.

Errors: `{error:{code}}`.

| HTTP | Codes                                                     |
| ---- | --------------------------------------------------------- |
| 400  | `invalid-json`                                            |
| 401  | `authentication-required`                                 |
| 403  | `invitation-required`, `access-denied`, `origin-rejected` |
| 404  | `not-found`                                               |
| 409  | `idempotency-conflict`, `refresh-conflict`                |
| 413  | `import-too-large`                                        |
| 415  | `json-required`                                           |
| 422  | `invalid-input`                                           |
| 503  | `configuration-required`, `database-unavailable`          |
| 500  | `internal-error`                                          |

OAuth routes are `/auth/login` and `/auth/callback`. The callback always returns to
`/import`; pending payloads remain local across the redirect. If no payload exists,
users can navigate to My companies. Invalid or uninvited sessions cannot access data.
