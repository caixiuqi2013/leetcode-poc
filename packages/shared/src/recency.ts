/** Canonical source ranges. Months retain calendar semantics, never fixed days. */
export const RECENCIES: Readonly<
  Record<string, { label: string; days: number | null }>
> = {
  'thirty-days': { label: '30 days', days: 30 },
  'three-months': { label: '3 months', days: null },
  'six-months': { label: '6 months', days: null },
  'more-than-six-months': { label: 'More than 6 months', days: null },
  all: { label: 'All', days: null },
};
/** Parse an observed favorite slug; never construct a source request from a label. */
export function companyRecency(company: string, raw: string | null) {
  if (!raw?.startsWith(`${company}-`)) return null;
  const key = raw.slice(company.length + 1);
  return Object.hasOwn(RECENCIES, key) ? { key, ...RECENCIES[key] } : null;
}
