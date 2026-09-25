/** Upload boundary: compatibility, canonical identity and independently checked counts. */
import { ExportSchema, type Extraction } from './schema';
import { companyRecency } from './recency';
export function validateImport(input: unknown) {
  const data = ExportSchema.parse(input);
  const url = new URL(data.sourceUrl);
  const range = companyRecency(data.company.slug, data.recency.raw);
  if (
    !range ||
    url.pathname !== `/company/${data.company.slug}/` ||
    url.searchParams.get('favoriteSlug') !== data.recency.raw ||
    range.label !== data.recency.label ||
    range.days !== data.recency.days
  ) {
    throw new Error('invalid-dataset-identity');
  }
  if (
    data.completeness !== 'complete' ||
    data.expectedTotal !== data.problems.length ||
    data.coverage.missingRequired !== 0 ||
    data.problems.some((p) => !p.leetcodeId || !p.difficulty)
  ) {
    throw new Error('incomplete-import');
  }
  if (data.problems.length > 100000) throw new Error('import-too-large');
  return { data, recencyKey: range.key };
}
/** Equivalence excludes transport IDs, timestamps, producer version and client evidence.
 * Topic order is presentation data and preserved. Position is array order, not rank. */
export function normalizedContent(data: Extraction) {
  const { recencyKey } = validateImport(data);
  return {
    company: data.company,
    recencyKey,
    recency: data.recency,
    scope: data.scope ?? {
      kind: 'company-recency',
      pageFiltersApplied: false,
      pageSortApplied: false,
      sort: 'CUSTOM_ASCENDING',
    },
    problems: data.problems,
  };
}
