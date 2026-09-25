import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extract } from '../packages/shared/src/engine';
import { parsePage } from '../packages/shared/src/leetcode';
import { ExportSchema } from '../packages/shared/src/schema';
const raw = JSON.parse(
  readFileSync('tests/fixtures/google-thirty-days.page1.json', 'utf8'),
);
const context = {
  sourceUrl:
    'https://leetcode.com/company/google/?favoriteSlug=google-thirty-days',
  company: { slug: 'google', name: 'Google' },
  recency: { raw: 'google-thirty-days', label: '30 days', days: 30 },
};
let page = 0;
const result = await extract(
  {
    verified: true,
    identityVerified: true,
    currentContext: async () => context,
    readPage: async () => {
      if (page++) throw new Error('Only supplied first page available');
      return parsePage(raw, context, 0);
    },
  },
  context,
  new AbortController().signal,
);
result.warnings.push(
  'USER_SUPPLIED_RESPONSE_REPLAY: first page only; extractedAt is conversion time, not original network capture time. Not an extension live extraction.',
);
mkdirSync('examples', { recursive: true });
writeFileSync(
  'examples/google-thirty-days.supplied-page.partial.json',
  JSON.stringify(ExportSchema.parse(result), null, 2) + '\n',
);
console.log({
  extracted: result.extractedCount,
  total: result.expectedTotal,
  missingTopics: result.coverage.missingTopics,
  completeness: result.completeness,
});
