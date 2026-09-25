/** Practice projections count distinct problem identities even across overlapping topics. */
import { z } from 'zod';
export const Filters = z
  .object({
    topic: z.string().max(500).optional(),
    difficulty: z.enum(['Easy', 'Medium', 'Hard']).optional(),
    completed: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type PracticeProblem = {
  problemId: string;
  title: string;
  url: string;
  leetcodeId: string;
  frontendId: string | null;
  position: number;
  difficulty: string;
  topics: string[];
  completed: boolean;
  rank: number | null;
  frequency: string | number | null;
};
export function summarize(problems: PracticeProblem[]) {
  const unique = [...new Map(problems.map((p) => [p.problemId, p])).values()];
  return {
    total: unique.length,
    completed: unique.filter((p) => p.completed).length,
    topics: [
      ...new Set(
        unique.flatMap((p) => (p.topics.length ? p.topics : ['Uncategorized'])),
      ),
    ].sort(),
  };
}
export function filterProblems(
  problems: PracticeProblem[],
  filters: z.infer<typeof Filters>,
) {
  const filtered = problems.filter(
    (p) =>
      (!filters.topic ||
        (p.topics.length ? p.topics : ['Uncategorized']).includes(
          filters.topic,
        )) &&
      (!filters.difficulty || p.difficulty === filters.difficulty) &&
      (!filters.completed || p.completed === (filters.completed === 'true')),
  );
  return {
    problems: filtered.slice(
      (filters.page - 1) * filters.limit,
      filters.page * filters.limit,
    ),
    filteredTotal: filtered.length,
    page: filters.page,
    limit: filters.limit,
    summary: summarize(problems),
  };
}
