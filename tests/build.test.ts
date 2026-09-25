import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
test('packaged MV3 files exist and permissions are minimal', () => {
  const root = 'apps/extension/dist/';
  const m = JSON.parse(readFileSync(root + 'manifest.json', 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions, ['activeTab', 'scripting', 'storage']);
  assert.equal(m.host_permissions, undefined);
  for (const file of [
    m.action.default_popup,
    m.background.service_worker,
    'content.js',
    'popup.js',
    'popup.css',
  ])
    assert.ok(existsSync(root + file), file);
  assert.ok(
    !readFileSync(root + 'popup.js', 'utf8').includes('Synthetic Problem'),
  );
});
