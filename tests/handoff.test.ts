import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
const extraction = JSON.parse(
  readFileSync('examples/google-thirty-days.live.complete.json', 'utf8'),
);
test('external handoff requires exact origin, top frame, matching UUID and unexpired payload', async () => {
  const result = await build({
    entryPoints: ['apps/extension/src/handoff.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'bridge',
    define: { __WEB_ORIGIN__: JSON.stringify('http://localhost:3000') },
  });
  let handler: any;
  let stored: any = {};
  let opened = '';
  const context: any = {
    URL,
    URLSearchParams,
    crypto,
    chrome: {
      runtime: {
        id: 'a'.repeat(32),
        onMessageExternal: { addListener: (f: any) => (handler = f) },
      },
      storage: {
        local: {
          get: async () => stored,
          set: async (v: any) => {
            Object.assign(stored, v);
          },
          remove: async () => {
            stored = {};
          },
        },
      },
      tabs: {
        create: async ({ url }: any) => {
          opened = url;
        },
      },
    },
  };
  runInNewContext(result.outputFiles[0].text, context);
  context.bridge.installHandoff();
  const taskId = crypto.randomUUID();
  stored.task = {
    id: taskId,
    tabId: 7,
    context: {
      sourceUrl: extraction.sourceUrl,
      company: extraction.company,
      recency: extraction.recency,
    },
    status: 'running',
    updatedAt: Date.now(),
    message: 'Reading',
    count: 0,
  };
  await context.bridge.beginBuild(taskId);
  assert.equal(new URL(opened).origin, 'http://localhost:3000');
  assert.ok(!opened.includes(extraction.extractionId));
  const message = {
    type: 'GET_PENDING_IMPORT',
    importId: stored.pendingImport.id,
  };
  const sender = {
    url: 'http://localhost:3000/import',
    frameId: 0,
    tab: { id: 1 },
  };
  const send = (m: any, s: any) =>
    new Promise<any>((resolve) => handler(m, s, resolve));
  assert.equal((await send(message, sender)).status, 'building');
  stored.task.count = 100;
  assert.equal((await send(message, sender)).count, 100);
  stored.task.status = 'done';
  stored.task.result = extraction;
  assert.equal(
    (await send(message, sender)).extraction.extractionId,
    extraction.extractionId,
  );
  stored.task.status = 'cancelled';
  assert.equal((await send(message, sender)).error, 'build-cancelled');
  stored.task.status = 'running';
  stored.task.updatedAt = 0;
  assert.equal((await send(message, sender)).error, 'build-interrupted');
  stored.task.status = 'done';
  stored.task.id = crypto.randomUUID();
  assert.equal((await send(message, sender)).error, 'build-replaced');
  stored.task.id = taskId;
  for (const s of [
    { ...sender, url: 'http://localhost:3001/import' },
    { ...sender, url: 'https://evil.example/import' },
    { ...sender, frameId: 1 },
    { ...sender, id: 'other-extension' },
    { ...sender, url: 'http://localhost:3000/other' },
  ])
    assert.equal((await send(message, s)).error, 'handoff-rejected');
  assert.equal(
    (await send({ ...message, importId: crypto.randomUUID() }, sender)).error,
    'handoff-rejected',
  );
  stored.pendingImport.expiresAt = 0;
  assert.equal((await send(message, sender)).error, 'pending-import-expired');
});
