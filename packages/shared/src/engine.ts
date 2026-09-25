import {
  Context,
  contextKey,
  ExportSchema,
  Extraction,
  Problem,
  ProblemSchema,
  RECENCY_SCOPE,
} from './schema';
export type Page = {
  context: Context;
  rows: unknown[];
  expectedTotal: number | null;
  next: string | null;
  terminal: boolean;
};
export interface SourceAdapter {
  verified: boolean;
  identityVerified: boolean;
  currentContext(): Promise<Context>;
  readPage(cursor: string | null, signal: AbortSignal): Promise<Page>;
}
export class SourceError extends Error {
  constructor(
    public code:
      | 'source-unverified'
      | 'no-access'
      | 'not-loaded'
      | 'read-failed'
      | 'rate-limited',
    message: string,
  ) {
    super(message);
  }
}
export async function extract(
  adapter: SourceAdapter,
  context: Context,
  signal: AbortSignal,
  progress: (
    count: number,
    checkpoint: Extraction,
  ) => Promise<void> = async () => {},
): Promise<Extraction> {
  const runId = crypto.randomUUID();
  const rows = new Map<string, Problem>();
  const slugs = new Set<string>();
  const warnings: string[] = [];
  let missing = 0,
    total: number | null = null;
  let exhausted = false,
    failed = false,
    cursor: string | null = null;
  const cursors = new Set<string>();
  const assertContext = async () => {
    signal.throwIfAborted();
    if (contextKey(await adapter.currentContext()) !== contextKey(context))
      throw new Error('context-changed');
  };
  if (!adapter.verified || !adapter.identityVerified)
    throw new SourceError(
      'source-unverified',
      'Source and stable identity must be verified before extraction',
    );
  try {
    for (let pageIndex = 0; pageIndex < 1000; pageIndex++) {
      await assertContext();
      const page = await adapter.readPage(cursor, signal);
      await assertContext();
      if (contextKey(page.context) !== contextKey(context))
        throw new Error('context-changed');
      if (page.expectedTotal !== null) {
        if (!Number.isInteger(page.expectedTotal) || page.expectedTotal < 0)
          throw new Error('invalid-total');
        if (total !== null && total !== page.expectedTotal)
          throw new Error('total-changed');
        total = page.expectedTotal;
      }
      for (const raw of page.rows) {
        const p = ProblemSchema.safeParse(raw);
        if (!p.success) {
          missing++;
          continue;
        }
        const key = p.data.leetcodeId ?? p.data.slug;
        if (!rows.has(key) && !slugs.has(p.data.slug)) {
          rows.set(key, p.data);
          slugs.add(p.data.slug);
        } else if (JSON.stringify(rows.get(key)) !== JSON.stringify(p.data))
          warnings.push('Duplicate identity has conflicting fields');
      }
      await progress(
        rows.size,
        ExportSchema.parse({
          ...context,
          schemaVersion: '1.0',
          extractionId: runId,
          extractedAt: new Date().toISOString(),
          extractorVersion: '0.5.1',
          scope: RECENCY_SCOPE,
          expectedTotal: total,
          extractedCount: rows.size,
          completeness: 'partial',
          warnings: [
            'Extraction in progress; API pagination not yet exhausted',
          ],
          problems: [...rows.values()],
          coverage: {
            missingRequired: missing,
            missingTopics: [...rows.values()].filter((p) => !p.topics.length)
              .length,
          },
          evidence: {
            sourceVerified: true,
            identityVerified: true,
            exhausted: false,
            failed: false,
          },
        }),
      );
      if (page.terminal && page.next === null) {
        exhausted = true;
        break;
      }
      if (!page.next || cursors.has(page.next))
        throw new Error('pagination-stalled');
      cursors.add(page.next);
      cursor = page.next;
    }
    await assertContext();
  } catch (e) {
    if (
      signal.aborted ||
      (e instanceof Error && e.message === 'context-changed')
    )
      throw e;
    if (!rows.size) throw e;
    failed = true;
    warnings.push(
      e instanceof SourceError ? e.code : 'Page read failed; retry extraction',
    );
  }
  if (!exhausted) warnings.push('Pagination not proven exhausted');
  if (total === null) warnings.push('Source total unknown');
  if (total !== null && total !== rows.size)
    warnings.push('Unique count differs from source total');
  if (missing) warnings.push('Invalid rows excluded');
  const problems = [...rows.values()];
  const complete =
    exhausted &&
    !failed &&
    missing === 0 &&
    total === rows.size &&
    warnings.length === 0 &&
    !!context.company.name &&
    !!context.recency.label &&
    !!context.recency.raw;
  return ExportSchema.parse({
    ...context,
    schemaVersion: '1.0',
    extractionId: runId,
    extractedAt: new Date().toISOString(),
    extractorVersion: '0.5.1',
    scope: RECENCY_SCOPE,
    expectedTotal: total,
    extractedCount: problems.length,
    completeness: complete
      ? 'complete'
      : failed || missing || total !== null
        ? 'partial'
        : 'unknown',
    warnings,
    problems,
    coverage: {
      missingRequired: missing,
      missingTopics: problems.filter((p) => !p.topics.length).length,
    },
    evidence: {
      sourceVerified: adapter.verified,
      identityVerified: adapter.identityVerified,
      exhausted,
      failed,
    },
  });
}
