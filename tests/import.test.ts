import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareImport } from '../apps/web/lib/import-service';
import { validateImport } from '../packages/shared/src/import';
import { ExportSchema, RECENCY_SCOPE } from '../packages/shared/src/schema';
import {
  summarize,
  filterProblems,
  type PracticeProblem,
} from '../apps/web/lib/practice';
const original = JSON.parse(
  readFileSync('examples/google-thirty-days.live.complete.json', 'utf8'),
);
test('real 0.2 export and explicitly synthesized 0.4 compatibility; null rank and missing topics', () => {
  const data = validateImport(original).data;
  assert.equal(data.problems.length, 152);
  assert.equal(data.problems.filter((p) => !p.topics.length).length, 1);
  assert.ok(data.problems.every((p) => p.rank === null));
  assert.equal(
    validateImport({
      ...original,
      extractorVersion: '0.4.0',
      scope: RECENCY_SCOPE,
    }).data.problems.length,
    152,
  );
  assert.equal(
    ExportSchema.safeParse({ ...original, extractorVersion: '1.0.0' }).success,
    false,
  );
});
test('normalized content excludes transport metadata but includes order, frequency and rank', () => {
  const a = prepareImport(original, original.extractionId);
  const b = {
    ...original,
    extractionId: crypto.randomUUID(),
    extractedAt: '2026-09-25T00:00:00.000Z',
  };
  assert.equal(
    a.p_content_hash,
    prepareImport(b, b.extractionId).p_content_hash,
  );
  assert.notEqual(
    a.p_request_hash,
    prepareImport(b, b.extractionId).p_request_hash,
  );
  const reordered = { ...original, problems: [...original.problems].reverse() };
  assert.notEqual(
    a.p_content_hash,
    prepareImport(reordered, reordered.extractionId).p_content_hash,
  );
});
test('reject partial, wrong identities, duplicate IDs, forged coverage and foreign URLs', () => {
  for (const data of [
    { ...original, completeness: 'partial' },
    { ...original, company: { ...original.company, slug: 'amazon' } },
    { ...original, coverage: { missingRequired: 0, missingTopics: 0 } },
    {
      ...original,
      problems: [original.problems[0], ...original.problems.slice(0, -1)],
    },
    {
      ...original,
      sourceUrl: original.sourceUrl.replace('leetcode.com', 'leetcode.cn'),
    },
  ])
    assert.throws(() => validateImport(data));
  assert.throws(() => prepareImport(original, crypto.randomUUID()));
});
test('overlapping topics count distinct problems and empty topics are Uncategorized', () => {
  const rows = [
    {
      problemId: 'a',
      topics: ['Array', 'Hash Table'],
      completed: true,
      difficulty: 'Easy',
    },
    { problemId: 'b', topics: [], completed: false, difficulty: 'Hard' },
  ] as PracticeProblem[];
  assert.deepEqual(summarize(rows), {
    total: 2,
    completed: 1,
    topics: ['Array', 'Hash Table', 'Uncategorized'],
  });
  assert.equal(
    filterProblems(rows, { topic: 'Uncategorized', page: 1, limit: 50 })
      .filteredTotal,
    1,
  );
});
