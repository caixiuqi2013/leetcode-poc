/** Authenticated API boundary. Both import entry points invoke this same transaction. */
import { z } from 'zod';
import { ApiError, member, mutationOrigin, rpc } from '../../../lib/server';
import { prepareImport } from '../../../lib/import-service';
import { Filters, filterProblems, summarize } from '../../../lib/practice';
const uuid = z.string().uuid();
const ImportBody = z
  .object({ extraction: z.unknown(), idempotencyKey: uuid })
  .strict();
async function jsonBody(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApiError(415, 'json-required');
  // Bound streamed bytes rather than trusting a caller-controlled Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'invalid-json');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_000_000) {
      await reader.cancel();
      throw new ApiError(413, 'import-too-large');
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'invalid-json');
  }
}
async function handle(request: Request) {
  try {
    if (request.method !== 'GET') mutationOrigin(request);
    const { userId, db } = await member();
    const url = new URL(request.url);
    const path = url.pathname.slice(5).split('/');
    const call = (name: string, args: Record<string, unknown> = {}) =>
      rpc(db, name, { p_user: userId, ...args });
    let result;
    if (request.method === 'POST' && path.join('/') === 'imports') {
      const body = ImportBody.parse(await jsonBody(request));
      result = await call(
        'import_list',
        prepareImport(body.extraction, body.idempotencyKey),
      );
    } else if (request.method === 'GET' && path.join('/') === 'me/companies')
      result = await call('my_companies');
    else if (path[0] === 'me' && path[1] === 'lists') {
      if (path.length === 2 && request.method === 'GET') {
        const query = z
          .object({
            company: z.string().regex(/^[a-z0-9-]+$/),
            recency: z.string().min(1),
          })
          .strict()
          .parse(Object.fromEntries(url.searchParams));
        const companies = await call('my_companies');
        const list = companies
          .find((c: any) => c.slug === query.company)
          ?.recencies.find((r: any) => r.key === query.recency);
        if (!list) throw new ApiError(404, 'not-found');
        result = await call('read_list', { p_list: list.listId });
        result.summary = summarize(result.problems);
      } else {
        const listId = uuid.parse(path[2]);
        if (
          request.method === 'POST' &&
          path[3] === 'refresh' &&
          path.length === 4
        ) {
          const body = z
            .object({ targetSnapshotId: uuid })
            .strict()
            .parse(await jsonBody(request));
          result = await call('refresh_list', {
            p_list: listId,
            p_target: body.targetSnapshotId,
          });
        } else if (
          request.method === 'GET' &&
          path[3] === 'problems' &&
          path.length === 4
        ) {
          const filters = Filters.parse(Object.fromEntries(url.searchParams));
          const list = await call('read_list', { p_list: listId });
          result = filterProblems(list.problems, filters);
        } else if (
          request.method === 'GET' &&
          path[3] === 'versions' &&
          (path.length === 4 || path.length === 5)
        ) {
          const list = await call('read_list', {
            p_list: listId,
            p_snapshot: path[4] ? uuid.parse(path[4]) : null,
          });
          result = path[4]
            ? { ...list, summary: summarize(list.problems) }
            : list.versions;
        } else throw new ApiError(404, 'not-found');
      }
    } else if (
      request.method === 'PUT' &&
      path[0] === 'me' &&
      path[1] === 'progress' &&
      path.length === 3
    ) {
      const body = z
        .object({ completed: z.boolean() })
        .strict()
        .parse(await jsonBody(request));
      result = await call('set_progress', {
        p_problem: uuid.parse(path[2]),
        p_completed: body.completed,
      });
    } else throw new ApiError(404, 'not-found');
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const validation =
      error instanceof z.ZodError ||
      (error instanceof Error &&
        [
          'invalid-dataset-identity',
          'incomplete-import',
          'import-too-large',
          'idempotency-key-mismatch',
        ].includes(error.message));
    const status =
      error instanceof ApiError ? error.status : validation ? 422 : 500;
    return Response.json(
      {
        error: {
          code:
            error instanceof ApiError
              ? error.code
              : validation
                ? 'invalid-input'
                : 'internal-error',
        },
      },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
