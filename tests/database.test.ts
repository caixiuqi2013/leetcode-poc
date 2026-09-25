/** Actual PostgreSQL SQL execution. Default: embedded PGlite; optional local server
 * enables independent connections for lock-contention tests. Never point at production. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { prepareImport } from '../apps/web/lib/import-service';
let db: any;
const external = process.env.TEST_DATABASE_URL;
const users = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
];
const sample = JSON.parse(
  readFileSync('examples/google-thirty-days.live.complete.json', 'utf8'),
);
function payload(time: string, change = false) {
  const problems = sample.problems.slice(0, 2).map((p: any) => ({
    ...p,
    title: change ? `${p.title} updated` : p.title,
  }));
  return {
    ...structuredClone(sample),
    extractionId: crypto.randomUUID(),
    extractedAt: time,
    problems,
    expectedTotal: 2,
    extractedCount: 2,
    coverage: { missingRequired: 0, missingTopics: 0 },
  };
}
async function query(sql: string, args: unknown[] = []) {
  return db.query(sql, args);
}
async function scalar(sql: string, args: unknown[] = []) {
  return (await query(sql, args)).rows[0].value;
}
async function imported(user: string, data: any, connection = db) {
  const p = prepareImport(data, data.extractionId);
  return (
    await connection.query(
      'select public.import_list($1,$2,$3,$4,$5) as value',
      [user, p.p_payload, p.p_key, p.p_content_hash, p.p_request_hash],
    )
  ).rows[0].value;
}
let first: any, second: any, problem: string;
before(async () => {
  if (external) {
    const u = new URL(external);
    if (!['127.0.0.1', 'localhost'].includes(u.hostname))
      throw new Error('Tests require a disposable localhost database.');
    db = new pg.Client({ connectionString: external });
    await db.connect();
  } else db = new PGlite();
  // Test-only Supabase role and auth.users stand-ins. Application migration is unchanged
  // except pgcrypto, which PGlite does not ship; gen_random_uuid is PostgreSQL core.
  await db.exec?.('select 1');
  const bootstrap = `create role anon;create role authenticated;create role service_role;create role supabase_auth_admin;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);`;
  if (external) await query(bootstrap);
  else await db.exec(bootstrap);
  let migration = readFileSync(
    'supabase/migrations/001_leetbycompany.sql',
    'utf8',
  );
  if (!external)
    migration = migration.replace(
      'create extension if not exists pgcrypto;',
      '',
    );
  if (external) await query(migration);
  else await db.exec(migration);
  for (let i = 0; i < users.length; i++) {
    await query('insert into auth.users values($1,$2,now())', [
      users[i],
      `user${i}@example.test`,
    ]);
    if (i < 2)
      await query('insert into public.invited_emails(email) values($1)', [
        `user${i}@example.test`,
      ]);
  }
});
after(async () => {
  if (external) await db.end();
  else await db.close();
});
test('atomic import, user-scoped idempotency and private lists', async () => {
  const data = payload('2026-09-01T00:00:00.000Z');
  first = await imported(users[0], data);
  assert.equal(first.sharedOutcome, 'updated');
  assert.deepEqual(await imported(users[0], data), first);
  await assert.rejects(
    imported(users[0], {
      ...data,
      problems: [
        { ...data.problems[0], title: 'Conflicting' },
        data.problems[1],
      ],
    }),
    /idempotency-conflict/,
  );
  assert.equal(
    await scalar('select count(*)::int as value from public.import_snapshots'),
    1,
  );
  assert.equal(
    (await scalar('select public.my_companies($1) as value', [users[1]]))
      .length,
    0,
  );
  const list = await scalar('select public.read_list($1,$2) as value', [
    users[0],
    first.listId,
  ]);
  problem = list.problems[0].problemId;
  await assert.rejects(
    query('select public.read_list($1,$2)', [users[1], first.listId]),
    /not-found/,
  );
  await assert.rejects(
    query('select public.set_progress($1,$2,true)', [users[1], problem]),
    /not-found/,
  );
  await assert.rejects(imported(users[2], data), /invitation-required/);
});
test('new shared import leaves first user untouched; explicit refresh preserves progress/history', async () => {
  await query('select public.set_progress($1,$2,true)', [users[0], problem]);
  second = await imported(users[1], payload('2026-09-02T00:00:00.000Z', true));
  let list = await scalar('select public.read_list($1,$2) as value', [
    users[0],
    first.listId,
  ]);
  assert.equal(list.snapshotId, first.snapshotId);
  assert.equal(list.newerVersion.snapshotId, second.snapshotId);
  await query('select public.refresh_list($1,$2,$3)', [
    users[0],
    first.listId,
    second.snapshotId,
  ]);
  await query('select public.refresh_list($1,$2,$3)', [
    users[0],
    first.listId,
    second.snapshotId,
  ]);
  list = await scalar('select public.read_list($1,$2) as value', [
    users[0],
    first.listId,
  ]);
  assert.equal(list.versions.length, 2);
  assert.equal(list.problems[0].completed, true);
  const history = await scalar('select public.read_list($1,$2,$3) as value', [
    users[0],
    first.listId,
    first.snapshotId,
  ]);
  assert.equal(history.problems[0].completed, true);
  assert.notEqual(history.problems[0].title, list.problems[0].title);
  await assert.rejects(
    query('select public.refresh_list($1,$2,$3)', [
      users[0],
      first.listId,
      first.snapshotId,
    ]),
    /refresh-conflict/,
  );
  await assert.rejects(
    query('select public.read_list($1,$2,$3)', [
      users[1],
      second.listId,
      first.snapshotId,
    ]),
    /not-found/,
  );
});
test('older import selects personal history without rolling back shared winner; equal conflicts retained', async () => {
  const old = await imported(users[0], payload('2026-08-01T00:00:00.000Z'));
  assert.equal(old.sharedOutcome, 'older');
  let list = await scalar('select public.read_list($1,$2) as value', [
    users[0],
    first.listId,
  ]);
  assert.equal(list.snapshotId, old.snapshotId);
  assert.equal(list.newerVersion.snapshotId, second.snapshotId);
  const conflict = await imported(
    users[0],
    payload('2026-09-02T00:00:00.000Z'),
  );
  assert.equal(conflict.sharedOutcome, 'version-conflict');
  assert.equal(conflict.warnings.length, 1);
  const equivalent = await imported(
    users[1],
    payload('2026-09-02T00:00:00.000Z', true),
  );
  assert.equal(equivalent.sharedOutcome, 'equivalent');
  assert.equal(
    await scalar(
      'select latest_snapshot_id as value from public.company_datasets',
    ),
    second.snapshotId,
  );
  list = await scalar('select public.read_list($1,$2) as value', [
    users[0],
    first.listId,
  ]);
  assert.equal(list.problems[0].completed, true);
});
test('a database constraint error rolls back snapshot, company, dataset, list and history', async () => {
  const before = await scalar(
    'select count(*)::int as value from public.import_snapshots',
  );
  const bad = payload('2026-09-03T00:00:00.000Z');
  bad.company = { name: 'Rollback', slug: 'rollback' };
  bad.sourceUrl =
    'https://leetcode.com/company/rollback/?favoriteSlug=rollback-thirty-days';
  bad.recency.raw = 'rollback-thirty-days';
  const p = prepareImport(bad, bad.extractionId);
  p.p_payload.problems[1].leetcodeId = p.p_payload.problems[0].leetcodeId;
  await assert.rejects(
    query('select public.import_list($1,$2,$3,$4,$5)', [
      users[0],
      p.p_payload,
      p.p_key,
      p.p_content_hash,
      p.p_request_hash,
    ]),
    /duplicate key/,
  );
  assert.equal(
    await scalar('select count(*)::int as value from public.import_snapshots'),
    before,
  );
  assert.equal(
    await scalar(
      "select count(*)::int as value from public.companies where slug='rollback'",
    ),
    0,
  );
});
test('direct browser roles cannot enumerate shared data, spoof RPC identity or edit pointers', async () => {
  for (const role of ['anon', 'authenticated']) {
    await query(`set role ${role}`);
    for (const sql of [
      'select * from public.import_snapshots',
      'select * from public.user_progress',
      'update public.company_datasets set latest_snapshot_id=null',
      `select public.my_companies('${users[0]}')`,
    ])
      await assert.rejects(query(sql), /permission denied/);
    await query('reset role');
  }
  await query('set role service_role');
  assert.ok(
    (await scalar('select public.my_companies($1) as value', [users[0]]))
      .length,
  );
  await query('reset role');
  await assert.rejects(
    query("update public.import_snapshots set content_hash='changed'"),
    /immutable-snapshot/,
  );
});
test('simultaneously submitted imports keep newest extractedAt (embedded execution is serialized)', async () => {
  await Promise.all([
    imported(users[0], payload('2026-09-10T00:00:00.000Z')),
    imported(users[1], payload('2026-09-09T00:00:00.000Z')),
  ]);
  assert.equal(
    new Date(
      await scalar(
        'select extracted_at as value from public.import_snapshots where id=(select latest_snapshot_id from public.company_datasets)',
      ),
    ).toISOString(),
    '2026-09-10T00:00:00.000Z',
  );
});
test(
  'independent-connection lock contention prevents stale overwrite',
  { skip: !external },
  async () => {
    const a = new pg.Client({ connectionString: external }),
      b = new pg.Client({ connectionString: external });
    await a.connect();
    await b.connect();
    try {
      await Promise.all([
        imported(users[0], payload('2026-09-12T00:00:00.000Z'), a),
        imported(users[1], payload('2026-09-11T00:00:00.000Z'), b),
      ]);
      assert.equal(
        new Date(
          await scalar(
            'select extracted_at as value from public.import_snapshots where id=(select latest_snapshot_id from public.company_datasets)',
          ),
        ).toISOString(),
        '2026-09-12T00:00:00.000Z',
      );
    } finally {
      await a.end();
      await b.end();
    }
  },
);

test('completion is shared across imported companies; foreign dataset snapshots cannot be selected', async () => {
  const data = payload('2026-09-15T00:00:00.000Z');
  data.company = { name: 'Amazon', slug: 'amazon' };
  data.sourceUrl =
    'https://leetcode.com/company/amazon/?favoriteSlug=amazon-thirty-days';
  data.recency.raw = 'amazon-thirty-days';
  const other = await imported(users[0], data);
  const list = await scalar('select public.read_list($1,$2) as value', [
    users[0],
    other.listId,
  ]);
  assert.equal(list.problems[0].problemId, problem);
  assert.equal(list.problems[0].completed, true);
  await assert.rejects(
    query('select public.refresh_list($1,$2,$3)', [
      users[0],
      first.listId,
      other.snapshotId,
    ]),
    /refresh-conflict/,
  );
  await assert.rejects(
    query('update public.user_lists set current_snapshot_id=$1 where id=$2', [
      other.snapshotId,
      first.listId,
    ]),
    /foreign key/,
  );
  await query('select public.set_progress($1,$2,false)', [users[0], problem]);
  const historical = await scalar(
    'select public.read_list($1,$2,$3) as value',
    [users[0], first.listId, first.snapshotId],
  );
  assert.equal(historical.problems[0].completed, false);
});

test('removing an invitation revokes reads and writes for an existing account', async () => {
  await query(
    "update public.invited_emails set active=false where email='user1@example.test'",
  );
  await assert.rejects(
    query('select public.my_companies($1)', [users[1]]),
    /invitation-required/,
  );
  await assert.rejects(
    query('select public.set_progress($1,$2,true)', [users[1], problem]),
    /invitation-required/,
  );
  const rejected = await scalar(
    'select public.before_user_created(\'{"user":{"email":"stranger@example.test"}}\') as value',
  );
  assert.equal(rejected.error.http_code, 403);
});
