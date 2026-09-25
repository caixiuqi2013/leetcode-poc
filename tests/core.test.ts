import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extract,
  Page,
  SourceAdapter,
  SourceError,
} from '../packages/shared/src/engine';
import {
  Context,
  ExportSchema,
  ProblemSchema,
  contextFromUrl,
} from '../packages/shared/src/schema';
import { recover, accept, Task } from '../apps/extension/src/state';
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/synthetic.json', import.meta.url), 'utf8'),
);
const ctx: Context = fixture.context;
const [a, b] = fixture.problems;
const signal = () => new AbortController().signal;
const page = (
  rows: unknown[],
  total: number | null,
  next: string | null = null,
): Page => ({
  context: ctx,
  rows,
  expectedTotal: total,
  next,
  terminal: next === null,
});
function source(pages: Page[]): SourceAdapter {
  let index = 0;
  return {
    verified: true,
    identityVerified: true,
    currentContext: async () => ctx,
    readPage: async () => {
      if (!pages[index])
        throw new SourceError('read-failed', 'Synthetic failure');
      return pages[index++];
    },
  };
}
test('synthetic conversion preserves distinct string IDs and raw frequency', () => {
  const p = ProblemSchema.parse(a);
  assert.equal(p.frontendId, '001');
  assert.equal(p.leetcodeId, 'internal-a');
  assert.equal(p.frequency, 'raw: high');
});
test('cross-page dedup preserves source order and counts topics separately', async () => {
  const r = await extract(
    source([page([a], 2, 'next'), page([a, b], 2)]),
    ctx,
    signal(),
  );
  assert.equal(r.completeness, 'complete');
  assert.deepEqual(
    r.problems.map((p) => p.slug),
    [a.slug, b.slug],
  );
  assert.equal(r.coverage.missingTopics, 1);
});
test('mid-pagination failure is partial', async () => {
  const r = await extract(source([page([a], 2, 'next')]), ctx, signal());
  assert.equal(r.completeness, 'partial');
  assert.equal(r.evidence.failed, true);
});
test('unknown total is never complete', async () => {
  assert.equal(
    (await extract(source([page([a], null)]), ctx, signal())).completeness,
    'unknown',
  );
});
test('verified empty set can be complete', async () => {
  const r = await extract(source([page([], 0)]), ctx, signal());
  assert.equal(r.completeness, 'complete');
  assert.equal(r.extractedCount, 0);
});
test('no access is an error, never an empty result', async () => {
  const s = source([]);
  s.readPage = async () => {
    throw new SourceError('no-access', 'Denied');
  };
  await assert.rejects(
    extract(s, ctx, signal()),
    (e: unknown) => e instanceof SourceError && e.code === 'no-access',
  );
});
test('not-loaded differs from genuine empty', async () => {
  const s = source([]);
  s.readPage = async () => {
    throw new SourceError('not-loaded', 'Wait');
  };
  await assert.rejects(extract(s, ctx, signal()), /Wait/);
});
test('invalid mandatory field excludes row and blocks complete', async () => {
  const r = await extract(
    source([page([{ ...a, title: '' }, b], 2)]),
    ctx,
    signal(),
  );
  assert.equal(r.coverage.missingRequired, 1);
  assert.equal(r.completeness, 'partial');
});
for (const field of ['company', 'recency'] as const)
  test(`${field} changes discard extraction`, async () => {
    let calls = 0;
    const s = source([page([a], 1)]);
    s.currentContext = async () =>
      ++calls === 1
        ? ctx
        : {
            ...ctx,
            [field]:
              field === 'company'
                ? { slug: 'other', name: 'Other' }
                : { raw: 'other', label: 'Other', days: null },
          };
    await assert.rejects(extract(s, ctx, signal()), /context-changed/);
  });
test('page context mismatch discards rows', async () => {
  await assert.rejects(
    extract(
      source([
        {
          ...page([a], 1),
          context: { ...ctx, recency: { raw: 'x', label: 'x', days: null } },
        },
      ]),
      ctx,
      signal(),
    ),
    /context-changed/,
  );
});
test('cancel after awaited read does not accept response', async () => {
  const controller = new AbortController();
  const s = source([]);
  s.readPage = async () => {
    controller.abort();
    return page([a], 1);
  };
  await assert.rejects(extract(s, ctx, controller.signal));
});
test('looping cursor cannot be complete', async () => {
  const r = await extract(
    source([page([a], 2, 'x'), page([a], 2, 'x')]),
    ctx,
    signal(),
  );
  assert.equal(r.completeness, 'partial');
});
test('changing total is partial', async () => {
  const r = await extract(
    source([page([a], 2, 'x'), page([b], 3)]),
    ctx,
    signal(),
  );
  assert.equal(r.completeness, 'partial');
});
test('unverified identity or source cannot extract', async () => {
  const s = source([page([], 0)]);
  s.identityVerified = false;
  await assert.rejects(extract(s, ctx, signal()), /verified/);
});
test('schema rejects false complete, extra credentials and bad links', async () => {
  const r = await extract(source([page([a], 1)]), ctx, signal());
  assert.equal(
    ExportSchema.safeParse({
      ...r,
      evidence: { ...r.evidence, exhausted: false },
    }).success,
    false,
  );
  assert.equal(
    ExportSchema.safeParse({ ...r, cookie: 'secret' }).success,
    false,
  );
  assert.equal(
    ProblemSchema.safeParse({ ...a, url: 'https://evil.example/' }).success,
    false,
  );
});
test('unknown recency labels cannot produce complete', async () => {
  const context = { ...ctx, recency: { ...ctx.recency, label: null } };
  const s = source([]);
  s.currentContext = async () => context;
  s.readPage = async () => ({ ...page([], 0), context });
  assert.notEqual(
    (await extract(s, context, signal())).completeness,
    'complete',
  );
});
test('URL observation strips unrelated query and does not guess days', () => {
  const c = contextFromUrl(
    'https://leetcode.com/company/google/?favoriteSlug=google-thirty-days&token=private#anything',
  );
  assert.equal(c.recency.days, null);
  assert.equal(c.recency.label, null);
  assert.ok(!c.sourceUrl.includes('private'));
  assert.throws(() =>
    contextFromUrl('https://leetcode.com.evil.example/company/google/'),
  );
});
const task: Task = {
  id: 'one',
  tabId: 1,
  context: ctx,
  status: 'running',
  updatedAt: 100,
  count: 0,
  message: 'test',
};
test('stale persisted task becomes retryable, finished result retained', () => {
  assert.equal(recover(task, 16000).status, 'interrupted');
  assert.equal(recover(task, 101).status, 'running');
  const done = { ...task, status: 'done' as const };
  assert.equal(recover(done, 99999), done);
});
test('late results after cancel or another task are rejected', () => {
  assert.equal(accept({ ...task, status: 'cancelled' }, 'one'), false);
  assert.equal(accept(task, 'two'), false);
  assert.equal(accept(task, 'one'), true);
});
