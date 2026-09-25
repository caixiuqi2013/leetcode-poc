import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parsePage,
  normalizeProblem,
  requestBody,
} from '../packages/shared/src/leetcode';
import { extract } from '../packages/shared/src/engine';
import { ProblemSchema, ExportSchema } from '../packages/shared/src/schema';
export const fixture = JSON.parse(
  readFileSync('tests/fixtures/google-thirty-days.page1.json', 'utf8'),
);
export const ctx = {
  sourceUrl:
    'https://leetcode.com/company/google/?favoriteSlug=google-thirty-days',
  company: { slug: 'google', name: 'Google' },
  recency: { raw: 'google-thirty-days', label: '30 days', days: 30 },
};
test('real sanitized response: 100 of 152, next skip=100, all rows valid', () => {
  const p = parsePage(fixture, ctx, 0);
  assert.equal(p.next, '100');
  assert.equal(p.expectedTotal, 152);
  assert.equal(p.terminal, false);
  assert.equal(p.rows.length, 100);
  p.rows.forEach((r) => ProblemSchema.parse(r));
  assert.equal(p.rows.filter((r: any) => !r.topics.length).length, 1);
});
test('real response: internal 2058 differs from frontend 1929; preserve raw frequency; no rank inferred', () => {
  const p: any = normalizeProblem(
    fixture.favoriteQuestionList.questions.find((q: any) => q.id === 2058),
  );
  assert.equal(p.leetcodeId, '2058');
  assert.equal(p.frontendId, '1929');
  assert.equal(p.frequency, 49.1);
  assert.equal(p.rank, null);
});
test('actual first page alone cannot become complete', async () => {
  let i = 0;
  const r = await extract(
    {
      verified: true,
      identityVerified: true,
      currentContext: async () => ctx,
      readPage: async () => {
        if (i++) throw new Error('second page unavailable');
        return parsePage(fixture, ctx, 0);
      },
    },
    ctx,
    new AbortController().signal,
  );
  assert.equal(r.completeness, 'partial');
  assert.equal(r.extractedCount, 100);
  assert.equal(r.expectedTotal, 152);
});
test('request uses observed operation, filters and page offsets; requests no user progress', () => {
  const b = requestBody('google-three-months', 100);
  assert.equal(b.variables.skip, 100);
  assert.equal(b.variables.limit, 100);
  assert.equal(b.variables.favoriteSlug, 'google-three-months');
  assert.equal(b.operationName, 'favoriteQuestionList');
  assert.ok(!b.query.includes('isInMyFavorites'));
  assert.ok(!b.query.includes('status'));
});
test('GraphQL errors including partial data are not accepted as valid pages', () => {
  assert.throws(() =>
    parsePage({ data: fixture, errors: [{ message: 'denied' }] }, ctx, 0),
  );
  assert.throws(() =>
    parsePage({ data: { favoriteQuestionList: null } }, ctx, 0),
  );
});
test('malformed, stuck or inconsistent pagination rejected', () => {
  for (const list of [
    { questions: [], totalLength: 2, hasMore: true },
    { questions: [], totalLength: '2', hasMore: false },
    {
      questions: fixture.favoriteQuestionList.questions,
      totalLength: 100,
      hasMore: true,
    },
  ])
    assert.throws(() => parsePage({ favoriteQuestionList: list }, ctx, 0));
});
test('normalizer whitelists data and marks malformed required fields invalid', () => {
  const q = fixture.favoriteQuestionList.questions[0];
  const p = normalizeProblem({
    ...q,
    status: 'SOLVED',
    isInMyFavorites: true,
    token: 'secret',
  });
  assert.ok(!JSON.stringify(p).includes('secret'));
  assert.equal(normalizeProblem({ ...q, id: 1.1 }), null);
  assert.equal(normalizeProblem({ ...q, title: null }), null);
});

test('new exports require explicit scope and reject claims of applying page filters', async () => {
  const result = await extract(
    {
      verified: true,
      identityVerified: true,
      currentContext: async () => ctx,
      readPage: async () => ({
        context: ctx,
        rows: [],
        expectedTotal: 0,
        next: null,
        terminal: true,
      }),
    },
    ctx,
    new AbortController().signal,
  );
  assert.equal(
    ExportSchema.safeParse({ ...result, scope: undefined }).success,
    false,
  );
  assert.equal(
    ExportSchema.safeParse({
      ...result,
      scope: { ...result.scope, pageFiltersApplied: true },
    }).success,
    false,
  );
});
