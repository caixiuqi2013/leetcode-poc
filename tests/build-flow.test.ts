import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resumeBuild,
  receiveBuild,
  buildError,
  payloadKey,
  capabilityKey,
} from '../apps/web/lib/build-flow';
const extraction = JSON.parse(
  readFileSync('examples/google-thirty-days.live.complete.json', 'utf8'),
);
const capability = {
  importId: crypto.randomUUID(),
  extensionId: 'a'.repeat(32),
};
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
  };
}
test('new build replaces stale staged data, survives reload and resumes after login', () => {
  const s = storage();
  s.setItem(payloadKey, JSON.stringify(extraction));
  assert.equal(
    resumeBuild('#' + new URLSearchParams(capability), s).data,
    null,
  );
  assert.equal(s.getItem(payloadKey), null);
  assert.deepEqual(resumeBuild('', s).capability, capability);
  s.setItem(payloadKey, JSON.stringify(extraction));
  s.removeItem(capabilityKey);
  assert.equal(resumeBuild('', s).data?.extractionId, extraction.extractionId);
});
test('large build reports real progress until complete without an additional action', async () => {
  const updates: any[] = [];
  let reads = 0;
  const data = await receiveBuild(
    capability,
    async () =>
      ++reads < 3
        ? {
            status: 'building',
            count: reads * 50,
            total: 152,
            company: 'Google',
            recency: '30 days',
          }
        : { status: 'ready', extraction },
    new AbortController().signal,
    (p) => updates.push(p),
    async () => {},
  );
  assert.deepEqual(
    updates.map((p) => p.count),
    [50, 100],
  );
  assert.equal(data.problems.length, 152);
  assert.equal(reads, 3);
});
test('cancelled, partial, malformed or disconnected builds cannot be imported', async () => {
  for (const response of [
    { error: 'build-cancelled' },
    { status: 'ready', extraction: { ...extraction, completeness: 'partial' } },
    { status: 'building', count: -1 },
  ]) {
    await assert.rejects(
      receiveBuild(
        capability,
        async () => response,
        new AbortController().signal,
        () => {},
        async () => {},
      ),
    );
  }
  const c = new AbortController();
  c.abort();
  let read = false;
  await assert.rejects(
    receiveBuild(
      capability,
      async () => {
        read = true;
        return {};
      },
      c.signal,
      () => {},
    ),
  );
  assert.equal(read, false);
});
test('setup and login messages explain recovery rather than exposing machine codes', () => {
  assert.match(buildError('configuration-required'), /site owner/);
  assert.match(buildError('authentication-required'), /automatically/);
});
