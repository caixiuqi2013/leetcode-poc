import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { contextFromUrl } from '../packages/shared/src/schema';
import { extract } from '../packages/shared/src/engine';
const url =
  'https://leetcode.com/company/google/?favoriteSlug=google-thirty-days';
const context = {
  ...contextFromUrl(url),
  company: { slug: 'google', name: 'Google' },
  recency: { raw: 'google-thirty-days', label: '30 days', days: 30 },
};
const bundle = readFileSync('apps/extension/dist/worker.js', 'utf8');
type Listener = (message: any, sender: any, reply: (v: any) => void) => unknown;
const documentId = 'document-one';
function pageContext(pageUrl: string) {
  const c = contextFromUrl(pageUrl);
  const labels: Record<string, string> = {
    'google-thirty-days': '30 days',
    'google-three-months': '3 months',
    'google-six-months': '6 months',
    'google-more-than-six-months': 'More than 6 months',
    'google-all': 'All',
  };
  return {
    ...c,
    company: { slug: 'google', name: 'Google' },
    recency: {
      raw: c.recency.raw,
      label: labels[c.recency.raw!],
      days: c.recency.raw === 'google-thirty-days' ? 30 : null,
    },
  };
}
function harness(
  storage: Record<string, any> = {},
  probe?: () => Promise<any>,
) {
  let tabUrl = url;
  let liveDocumentId = documentId;
  let listener: Listener = () => {};
  let update: (id: number, change: unknown) => void = () => {};
  const messages: any[] = [];
  const chrome = {
    runtime: {
      id: 'test',
      getURL: (p: string) => 'chrome-extension://test/' + p,
      onMessage: { addListener: (f: Listener) => (listener = f) },
    },
    storage: {
      local: {
        get: async () => structuredClone(storage),
        set: async (v: object) => Object.assign(storage, structuredClone(v)),
      },
    },
    scripting: {
      executeScript: async () => [{ frameId: 0, documentId: liveDocumentId }],
    },
    tabs: {
      create: async ({ url }: any) => {
        messages.push({ type: 'OPEN_WEBSITE', url });
        return { id: 2 };
      },
      query: async () => [{ id: 1, url: tabUrl }],
      get: async () => ({ id: 1, url: tabUrl }),
      sendMessage: async (_id: number, m: any, options?: any) => {
        messages.push({ ...m, options });
        return m.type === 'PROBE'
          ? probe
            ? probe()
            : { context: pageContext(tabUrl) }
          : { ok: true };
      },
      onUpdated: { addListener: (f: typeof update) => (update = f) },
      onRemoved: { addListener: () => {} },
    },
  };
  runInNewContext(bundle, {
    chrome,
    crypto,
    URL,
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout,
  });
  return {
    storage,
    update,
    messages,
    setUrl: (v: string) => (tabUrl = v),
    setDocument: (v: string) => (liveDocumentId = v),
    request: (type: string) =>
      new Promise<any>((resolve) =>
        listener(
          { type },
          { id: 'test', url: 'chrome-extension://test/popup.html' },
          resolve,
        ),
      ),
    event: (
      event: any,
      tabId = 1,
      senderOverrides: Record<string, unknown> = {},
    ) =>
      new Promise<any>((resolve) =>
        listener(
          event,
          {
            id: 'test',
            url,
            origin: 'https://leetcode.com',
            tab: { id: tabId },
            frameId: 0,
            documentId,
            ...senderOverrides,
          },
          resolve,
        ),
      ),
    listener,
  };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
test('worker starts content job and persists completed result across reopening', async () => {
  const h = harness();
  await h.request('START');
  await tick();
  assert.ok(h.messages.some((m) => m.type === 'RUN'));
  const result = await extract(
    {
      verified: true,
      identityVerified: true,
      currentContext: async () => context,
      readPage: async () => ({
        context,
        rows: [],
        expectedTotal: 0,
        next: null,
        terminal: true,
      }),
    },
    context,
    new AbortController().signal,
  );
  await h.event({ type: 'DONE', id: h.storage.task.id, result });
  assert.equal(h.storage.task.status, 'done');
  const reopened = harness(h.storage);
  assert.equal(
    (await reopened.request('GET')).task.result.completeness,
    'complete',
  );
});
test('webpage commands rejected', () => {
  const h = harness();
  let replied = false;
  h.listener({ type: 'START' }, { id: 'test', url }, () => (replied = true));
  assert.equal(replied, false);
});
test('cancel survives delayed probe and RUN is never sent', async () => {
  let finish: (v: any) => void = () => {};
  const h = harness({}, () => new Promise((resolve) => (finish = resolve)));
  await h.request('START');
  await tick();
  await h.request('CANCEL');
  finish({ context });
  await tick();
  assert.equal(h.storage.task.status, 'cancelled');
  assert.ok(!h.messages.some((m) => m.type === 'RUN'));
});
test('stale persisted task becomes interrupted after restart', async () => {
  const h = harness({
    task: {
      id: crypto.randomUUID(),
      tabId: 1,
      context,
      status: 'running',
      updatedAt: 0,
      message: 'working',
      count: 0,
    },
  });
  assert.equal((await h.request('GET')).task.status, 'interrupted');
});
test('navigation clears results and late events cannot resurrect a cancelled task', async () => {
  const h = harness();
  await h.request('START');
  await tick();
  const id = h.storage.task.id;
  h.update(1, { url: 'https://leetcode.com/company/other/' });
  await tick();
  assert.equal(h.storage.task.status, 'cancelled');
  assert.equal((await h.event({ type: 'HEARTBEAT', id })).accepted, false);
});
test('wrong-tab and old-task events rejected; valid heartbeat survives worker recreation', async () => {
  const h = harness();
  await h.request('START');
  await tick();
  const id = h.storage.task.id;
  assert.equal((await h.event({ type: 'HEARTBEAT', id }, 9)).accepted, false);
  assert.equal(
    (await h.event({ type: 'HEARTBEAT', id: crypto.randomUUID() })).accepted,
    false,
  );
  assert.equal(
    (await harness(h.storage).event({ type: 'HEARTBEAT', id })).accepted,
    true,
  );
});
test('unsupported scope is blocked', async () => {
  const h = harness({}, async () => ({ error: 'unsupported-scope' }));
  await h.request('START');
  await tick();
  assert.equal(h.storage.task.status, 'blocked');
});

async function completedResult(current: ReturnType<typeof pageContext>) {
  return extract(
    {
      verified: true,
      identityVerified: true,
      currentContext: async () => current,
      readPage: async () => ({
        context: current,
        rows: [],
        expectedTotal: 0,
        next: null,
        terminal: true,
      }),
    },
    current,
    new AbortController().signal,
  );
}
test('SPA regression: all five recencies then back to 30 days despite stale sender.url', async () => {
  const h = harness();
  for (const favorite of [
    'google-thirty-days',
    'google-three-months',
    'google-six-months',
    'google-more-than-six-months',
    'google-all',
    'google-thirty-days',
  ]) {
    const next = `https://leetcode.com/company/google/?favoriteSlug=${favorite}`;
    h.setUrl(next);
    h.update(1, { url: next });
    await tick();
    await h.request('START');
    await tick();
    const id = h.storage.task.id;
    assert.equal(
      (await h.event({ type: 'HEARTBEAT', id })).accepted,
      true,
      `heartbeat for ${favorite}`,
    );
    const result = await completedResult(pageContext(next));
    assert.equal(
      (await h.event({ type: 'DONE', id, result })).accepted,
      true,
      `result for ${favorite}`,
    );
    assert.equal(h.storage.task.status, 'done');
    assert.equal(h.storage.task.context.recency.raw, favorite);
  }
});
test('live scope change cancels even if sender.url still matches the old task', async () => {
  const h = harness();
  await h.request('START');
  await tick();
  const id = h.storage.task.id;
  h.setUrl(
    'https://leetcode.com/company/google/?favoriteSlug=google-three-months',
  );
  assert.equal((await h.event({ type: 'HEARTBEAT', id })).accepted, false);
  assert.equal(h.storage.task.status, 'cancelled');
  assert.equal(h.storage.task.result, undefined);
});
test('wrong document, iframe and origin rejected without cancelling valid task', async () => {
  const h = harness();
  await h.request('START');
  await tick();
  const id = h.storage.task.id;
  for (const overrides of [
    { documentId: 'old-document' },
    { documentId: undefined },
    { frameId: 1 },
    { url: 'https://evil.example/' },
    { origin: 'https://evil.example' },
  ])
    assert.equal(
      (await h.event({ type: 'HEARTBEAT', id }, 1, overrides)).accepted,
      false,
    );
  assert.equal(h.storage.task.status, 'running');
  assert.equal((await h.event({ type: 'HEARTBEAT', id })).accepted, true);
  assert.ok(
    h.messages
      .filter((m) => m.type === 'PROBE' || m.type === 'RUN')
      .every((m) => m.options.documentId === documentId),
  );
});
test('result for another recency cannot be accepted after SPA switch', async () => {
  const h = harness();
  const next =
    'https://leetcode.com/company/google/?favoriteSlug=google-three-months';
  h.setUrl(next);
  await h.request('START');
  await tick();
  const id = h.storage.task.id;
  assert.equal(
    (
      await h.event({
        type: 'DONE',
        id,
        result: await completedResult(context),
      })
    ).accepted,
    false,
  );
  assert.equal(h.storage.task.status, 'running');
  assert.equal(
    (
      await h.event({
        type: 'DONE',
        id,
        result: await completedResult(pageContext(next)),
      })
    ).accepted,
    true,
  );
});

test('one click opens building page before RUN and pins the original source task', async () => {
  const h = harness();
  const response = await h.request('BUILD_LIST');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(response.task.tabId, 1);
  assert.equal(h.storage.pendingImport.taskId, response.task.id);
  const open = h.messages.findIndex((m) => m.type === 'OPEN_WEBSITE');
  const run = h.messages.findIndex((m) => m.type === 'RUN');
  assert.ok(open >= 0 && run > open);
  assert.equal(new URL(h.messages[open].url).pathname, '/import');
  assert.equal(h.messages[run].context.sourceUrl, url);
});
