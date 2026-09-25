/** Local handoff capability: exact web origin + random ID + expiry, no credentials. */
import { z } from 'zod';
import { TaskSchema, recover } from './state';
import { validateImport } from '../../../packages/shared/src/import';
declare const __WEB_ORIGIN__: string;
const Pending = z
  .object({
    id: z.string().uuid(),
    expiresAt: z.number(),
    taskId: z.string().uuid(),
  })
  .strict();
const Message = z
  .object({
    type: z.literal('GET_PENDING_IMPORT'),
    importId: z.string().uuid(),
  })
  .strict();
export const WEB_ORIGIN = __WEB_ORIGIN__;
/** Open the building page before extraction starts; the source tab remains pinned. */
export async function beginBuild(taskId: string) {
  const pending = {
    id: crypto.randomUUID(),
    taskId,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
  await chrome.storage.local.set({ pendingImport: pending });
  const url = new URL('/import', WEB_ORIGIN);
  url.hash = new URLSearchParams({
    importId: pending.id,
    extensionId: chrome.runtime.id,
  }).toString();
  await chrome.tabs.create({ url: url.href });
}
export function installHandoff() {
  // Optional API guard allows legacy VM harnesses to exercise the extraction worker.
  chrome.runtime.onMessageExternal?.addListener((raw, sender, reply) => {
    const parsed = Message.safeParse(raw);
    let valid = false;
    try {
      const url = new URL(sender.url ?? '');
      valid =
        url.origin === WEB_ORIGIN &&
        url.pathname === '/import' &&
        sender.frameId === 0 &&
        !!sender.tab &&
        !sender.id;
    } catch {
      valid = false;
    }
    if (!valid || !parsed.success) {
      reply({ error: 'handoff-rejected' });
      return;
    }
    void chrome.storage.local
      .get(['pendingImport', 'task'])
      .then(async (stored) => {
        const pending = Pending.safeParse(stored.pendingImport);
        if (!pending.success || pending.data.expiresAt < Date.now()) {
          await chrome.storage.local.remove('pendingImport');
          reply({ error: 'pending-import-expired' });
          return;
        }
        if (pending.data.id !== parsed.data.importId) {
          reply({ error: 'handoff-rejected' });
          return;
        }
        const parsedTask = TaskSchema.safeParse(stored.task);
        if (!parsedTask.success || parsedTask.data.id !== pending.data.taskId) {
          reply({ error: 'build-replaced' });
          return;
        }
        const task = recover(parsedTask.data, Date.now());
        if (task.status === 'running') {
          reply({
            status: 'building',
            count: task.count,
            total: task.result?.expectedTotal ?? null,
            company: task.context.company.name ?? task.context.company.slug,
            recency: task.context.recency.label ?? task.context.recency.raw,
          });
          return;
        }
        if (task.status !== 'done') {
          reply({ error: `build-${task.status}` });
          return;
        }
        try {
          reply({
            status: 'ready',
            extraction: validateImport(task.result).data,
          });
        } catch {
          reply({ error: 'build-incomplete' });
        }
      })
      .catch(() => reply({ error: 'handoff-storage-failed' }));
    return true;
  });
}
