import { z } from 'zod';
const text = z.string().trim().min(1).max(500);
export const ProblemSchema = z
  .object({
    leetcodeId: text.nullable(),
    frontendId: text.nullable(),
    title: text,
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    url: z
      .string()
      .url()
      .refine((v) =>
        /^https:\/\/leetcode\.com\/problems\/[a-z0-9-]+\/$/.test(v),
      ),
    difficulty: z.enum(['Easy', 'Medium', 'Hard']).nullable(),
    topics: z.array(text).max(100),
    rank: z.number().int().positive().nullable(),
    frequency: z.union([text, z.number().finite()]).nullable(),
  })
  .strict()
  .refine(
    (p) => new URL(p.url).pathname === `/problems/${p.slug}/`,
    'URL and slug disagree',
  );
export type Problem = z.infer<typeof ProblemSchema>;
export const ContextSchema = z
  .object({
    sourceUrl: z
      .string()
      .url()
      .refine((v) =>
        /^https:\/\/leetcode\.com\/company\/[a-z0-9-]+\/(?:\?favoriteSlug=[a-zA-Z0-9%-]+)?$/.test(
          v,
        ),
      ),
    company: z.object({ name: text.nullable(), slug: text }).strict(),
    recency: z
      .object({
        raw: text.nullable(),
        label: text.nullable(),
        days: z.number().int().positive().nullable(),
      })
      .strict(),
  })
  .strict();
export type Context = z.infer<typeof ContextSchema>;
export const ExtractionScopeSchema = z
  .object({
    kind: z.literal('company-recency'),
    pageFiltersApplied: z.literal(false),
    pageSortApplied: z.literal(false),
    sort: z.literal('CUSTOM_ASCENDING'),
  })
  .strict();
export const RECENCY_SCOPE = {
  kind: 'company-recency',
  pageFiltersApplied: false,
  pageSortApplied: false,
  sort: 'CUSTOM_ASCENDING',
} as const;
export const ExportSchema = ContextSchema.extend({
  schemaVersion: z.literal('1.0'),
  extractionId: z.string().uuid(),
  extractedAt: z.string().datetime(),
  extractorVersion: z.string().regex(/^0\.\d+\.\d+$/),
  scope: ExtractionScopeSchema.optional(),
  expectedTotal: z.number().int().nonnegative().nullable(),
  extractedCount: z.number().int().nonnegative(),
  completeness: z.enum(['complete', 'partial', 'unknown']),
  warnings: z.array(text),
  problems: z.array(ProblemSchema),
  coverage: z
    .object({
      missingRequired: z.number().int().nonnegative(),
      missingTopics: z.number().int().nonnegative(),
    })
    .strict(),
  evidence: z
    .object({
      sourceVerified: z.boolean(),
      identityVerified: z.boolean(),
      exhausted: z.boolean(),
      failed: z.boolean(),
    })
    .strict(),
})
  .strict()
  .superRefine((d, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (Number(d.extractorVersion.split('.')[1]) >= 4 && !d.scope)
      fail('Explicit extraction scope required');
    if (
      d.extractedCount !== d.problems.length ||
      new Set(d.problems.map((p) => p.slug)).size !== d.problems.length
    )
      fail('Count or uniqueness mismatch');
    const ids = d.problems.map((p) => p.leetcodeId).filter((v) => v !== null);
    if (new Set(ids).size !== ids.length) fail('Duplicate internal ID');
    if (
      d.coverage.missingTopics !==
      d.problems.filter((p) => !p.topics.length).length
    )
      fail('Topic coverage mismatch');
    if (
      d.completeness === 'complete' &&
      (d.warnings.length > 0 ||
        !d.evidence.sourceVerified ||
        !d.evidence.identityVerified ||
        !d.evidence.exhausted ||
        d.evidence.failed ||
        d.coverage.missingRequired ||
        d.expectedTotal !== d.extractedCount ||
        !d.recency.raw ||
        !d.recency.label ||
        !d.company.name)
    )
      fail('Insufficient evidence for complete');
  });
export type Extraction = z.infer<typeof ExportSchema>;
export function contextKey(c: Context) {
  return JSON.stringify(c);
}
// Only URL shape observed in browser inventory. Labels/days are deliberately not inferred.
export function contextFromUrl(raw: string): Context {
  const u = new URL(raw);
  const m = u.pathname.match(/^\/company\/([a-z0-9-]+)\/?$/);
  if (u.origin !== 'https://leetcode.com' || !m)
    throw new Error('Open a leetcode.com company page');
  const clean = new URL(`https://leetcode.com/company/${m[1]}/`);
  const favorite = u.searchParams.get('favoriteSlug');
  if (favorite) clean.searchParams.set('favoriteSlug', favorite);
  return ContextSchema.parse({
    sourceUrl: clean.href,
    company: { slug: m[1], name: null },
    recency: { raw: favorite, label: null, days: null },
  });
}
