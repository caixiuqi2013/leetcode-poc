import { z } from 'zod';
import { Context } from './schema';
import { Page, SourceError } from './engine';
// Fields/operation/variables from the user-supplied request. Personal fields omitted.
export const QUERY = `query favoriteQuestionList($favoriteSlug: String!, $filtersV2: QuestionFilterInput, $searchKeyword: String, $sortBy: QuestionSortByInput, $limit: Int, $skip: Int, $version: String = "v2") {
 favoriteQuestionList(favoriteSlug: $favoriteSlug, filtersV2: $filtersV2, searchKeyword: $searchKeyword, sortBy: $sortBy, limit: $limit, skip: $skip, version: $version) {
  questions { difficulty id questionFrontendId title titleSlug frequency topicTags { name slug } }
  totalLength hasMore
 }
}`;
export function requestBody(favoriteSlug: string, skip: number) {
  if (
    !/^[a-z0-9-]+$/.test(favoriteSlug) ||
    !Number.isSafeInteger(skip) ||
    skip < 0
  )
    throw new Error('Invalid request');
  const filtersV2 = {
    filterCombineType: 'ALL',
    statusFilter: { questionStatuses: [], operator: 'IS' },
    difficultyFilter: { difficulties: [], operator: 'IS' },
    languageFilter: { languageSlugs: [], operator: 'IS' },
    topicFilter: { topicSlugs: [], operator: 'IS' },
    acceptanceFilter: {},
    frequencyFilter: {},
    frontendIdFilter: {},
    lastSubmittedFilter: {},
    publishedFilter: {},
    companyFilter: { companySlugs: [], operator: 'IS' },
    positionFilter: { positionSlugs: [], operator: 'IS' },
    positionLevelFilter: { positionLevelSlugs: [], operator: 'IS' },
    contestPointFilter: { contestPoints: [], operator: 'IS' },
    premiumFilter: { premiumStatus: [], operator: 'IS' },
  };
  return {
    query: QUERY,
    variables: {
      skip,
      limit: 100,
      favoriteSlug,
      filtersV2,
      searchKeyword: '',
      sortBy: { sortField: 'CUSTOM', sortOrder: 'ASCENDING' },
    },
    operationName: 'favoriteQuestionList',
  };
}
const RawProblem = z.object({
  id: z.union([
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    z.string().regex(/^\d+$/),
  ]),
  questionFrontendId: z.string().nullable().optional(),
  title: z.string(),
  titleSlug: z.string(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).nullable().optional(),
  frequency: z.union([z.number().finite(), z.string()]).nullable().optional(),
  topicTags: z
    .array(z.object({ name: z.string(), slug: z.string() }))
    .nullable()
    .optional(),
});
export function normalizeProblem(raw: unknown): unknown {
  const parsed = RawProblem.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  return {
    leetcodeId: String(p.id),
    frontendId: p.questionFrontendId ?? null,
    title: p.title,
    slug: p.titleSlug,
    url: `https://leetcode.com/problems/${p.titleSlug}/`,
    difficulty: p.difficulty
      ? ({ EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' } as const)[
          p.difficulty
        ]
      : null,
    topics: [...new Set((p.topicTags ?? []).map((t) => t.name))],
    rank: null,
    frequency: p.frequency ?? null,
  };
}
const Result = z.object({
  favoriteQuestionList: z.object({
    questions: z.array(z.unknown()).max(100),
    totalLength: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }),
});
export function parsePage(body: unknown, context: Context, skip: number): Page {
  if (typeof body !== 'object' || !body)
    throw new SourceError('read-failed', 'Invalid response');
  const envelope = body as Record<string, unknown>;
  if (Array.isArray(envelope.errors) && envelope.errors.length)
    throw new SourceError('read-failed', 'GraphQL errors; no result accepted');
  const parsed = Result.safeParse(
    'data' in envelope ? envelope.data : envelope,
  );
  if (!parsed.success)
    throw new SourceError(
      'read-failed',
      'Response schema changed or list unavailable',
    );
  const d = parsed.data.favoriteQuestionList;
  if (d.hasMore && !d.questions.length)
    throw new SourceError('read-failed', 'Empty page with hasMore');
  if (
    skip + d.questions.length > d.totalLength ||
    (d.hasMore && skip + d.questions.length >= d.totalLength)
  )
    throw new SourceError('read-failed', 'Inconsistent pagination');
  return {
    context,
    rows: d.questions.map(normalizeProblem),
    expectedTotal: d.totalLength,
    next: d.hasMore ? String(skip + d.questions.length) : null,
    terminal: !d.hasMore,
  };
}
