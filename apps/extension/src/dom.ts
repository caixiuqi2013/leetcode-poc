/** Verify visible company and recency against URL identity before any request. */
import {
  ContextSchema,
  contextFromUrl,
} from '../../../packages/shared/src/schema';
import {
  RECENCIES,
  companyRecency,
} from '../../../packages/shared/src/recency';
export function readContext() {
  const context = contextFromUrl(location.href);
  const recency = companyRecency(context.company.slug, context.recency.raw);
  if (!recency) throw new Error('unsupported-scope');
  const headings = [...document.querySelectorAll('h1')];
  const name = headings[0]?.textContent?.trim();
  const labels = [...document.querySelectorAll('[role="combobox"]')]
    .map((element) => element.textContent?.trim())
    .filter((label) =>
      Object.values(RECENCIES).some((range) => range.label === label),
    );
  if (
    headings.length !== 1 ||
    !name ||
    !labels.includes(recency.label) ||
    labels.some((label) => label !== recency.label && label !== 'All')
  ) {
    throw new Error('context-not-ready');
  }
  // The URL, heading and visible recency must agree for every company.
  // If rows are rendered, their source links must corroborate the same scope.
  // No rendered rows is valid: page filters or lazy rendering may hide them.
  const links = [...document.querySelectorAll('a[href*="envType=company"]')];
  const matching = links.every((link) => {
    const url = new URL((link as HTMLAnchorElement).href, location.href);
    return (
      url.origin === 'https://leetcode.com' &&
      url.pathname.startsWith('/problems/') &&
      url.searchParams.get('envId') === context.company.slug &&
      url.searchParams.get('favoriteSlug') === context.recency.raw
    );
  });
  const headingSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (headingSlug !== context.company.slug || !matching)
    throw new Error('context-not-ready');
  return ContextSchema.parse({
    ...context,
    company: { ...context.company, name },
    recency: { ...context.recency, label: recency.label, days: recency.days },
  });
}
