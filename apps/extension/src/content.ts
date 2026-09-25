import { z } from 'zod';
import {
  ContextSchema,
  contextKey,
  contextFromUrl,
} from '../../../packages/shared/src/schema';
import { extract, SourceError } from '../../../packages/shared/src/engine';
import { parsePage, requestBody } from '../../../packages/shared/src/leetcode';
import { readContext } from './dom';
import { waitForReady } from '../../../packages/shared/src/ready';
(() => {
  const scope = globalThis as unknown as Record<string, unknown>;
  if (scope.__companyPocV2) return;
  scope.__companyPocV2 = true;
  let probe: { id: string; controller: AbortController } | null = null;
  let active: { id: string; controller: AbortController } | null = null;
  const Start = z
    .object({
      type: z.literal('RUN'),
      id: z.string().uuid(),
      context: ContextSchema,
    })
    .strict();
  const notify = async (data: unknown) => {
    const answer = await chrome.runtime.sendMessage(data);
    if (!answer?.accepted) throw new Error('task-rejected');
  };
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message?.type === 'PROBE') {
      // Legacy read-only probe (also useful in unit tests); production supplies a task id.
      if (
        typeof message.id !== 'string' ||
        typeof message.sourceUrl !== 'string'
      ) {
        try {
          reply({ context: readContext() });
        } catch (e) {
          reply({
            error: e instanceof Error ? e.message : 'context-not-ready',
          });
        }
        return;
      }
      probe?.controller.abort();
      const controller = new AbortController();
      const current = { id: message.id, controller };
      probe = current;
      void waitForReady(() => {
        if (contextFromUrl(location.href).sourceUrl !== message.sourceUrl)
          throw new Error('context-changed');
        return readContext();
      }, controller.signal)
        .then(
          (context) => reply({ context }),
          (e) =>
            reply({
              error: e instanceof Error ? e.message : 'context-not-ready',
            }),
        )
        .finally(() => {
          if (probe === current) probe = null;
        });
      return true;
    }
    if (message?.type === 'CANCEL' && probe && message.id === probe.id) {
      probe.controller.abort(new Error('cancelled'));
      reply({ ok: true });
      return;
    }
    if (message?.type === 'CANCEL' && active && message.id === active.id) {
      active.controller.abort();
      reply({ ok: true });
      return;
    }
    const parsed = Start.safeParse(message);
    if (!parsed.success) return;
    if (active) {
      reply({ error: 'content-busy' });
      return;
    }
    const { id, context } = parsed.data;
    const controller = new AbortController();
    active = { id, controller };
    reply({ ok: true });
    void (async () => {
      let changed = false;
      let heartBusy = false;
      const assertScope = () => {
        try {
          if (contextKey(readContext()) !== contextKey(context))
            throw new Error();
        } catch {
          changed = true;
          controller.abort();
          throw new Error('context-changed');
        }
      };
      // Observe actual scope changes, not ordinary clicks (e.g. closing the popup).
      const checkScope = () => {
        if (controller.signal.aborted) return;
        try {
          assertScope();
        } catch {}
      };
      const observer = new MutationObserver(checkScope);
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['aria-selected', 'data-state'],
      });
      window.addEventListener('popstate', checkScope);
      const timer = setInterval(() => {
        try {
          assertScope();
        } catch {}
        if (heartBusy) return;
        heartBusy = true;
        void notify({ type: 'HEARTBEAT', id })
          .catch(() => controller.abort())
          .finally(() => (heartBusy = false));
      }, 3000);
      try {
        assertScope();
        const result = await extract(
          {
            verified: true,
            identityVerified: true,
            currentContext: async () => {
              assertScope();
              return readContext();
            },
            readPage: async (cursor, signal) => {
              assertScope();
              const skip = cursor === null ? 0 : Number(cursor);
              let response: Response;
              try {
                response = await fetch('https://leetcode.com/graphql/', {
                  method: 'POST',
                  credentials: 'same-origin',
                  redirect: 'error',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(requestBody(context.recency.raw!, skip)),
                  signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
                });
              } catch {
                signal.throwIfAborted();
                throw new SourceError('read-failed', 'Network or 15s timeout');
              }
              if (response.status === 401 || response.status === 403)
                throw new SourceError('no-access', 'Session/access rejected');
              if (response.status === 429)
                throw new SourceError(
                  'rate-limited',
                  'Rate limited; retry later',
                );
              if (!response.ok)
                throw new SourceError('read-failed', 'HTTP failure');
              const text = await response.text();
              if (text.length > 2000000)
                throw new SourceError('read-failed', 'Response too large');
              let body;
              try {
                body = JSON.parse(text);
              } catch {
                throw new SourceError(
                  'read-failed',
                  'Non-JSON response (login/challenge/not loaded)',
                );
              }
              assertScope();
              return parsePage(body, context, skip);
            },
          },
          context,
          controller.signal,
          async (_count, checkpoint) => {
            await notify({ type: 'PROGRESS', id, result: checkpoint });
          },
        );
        assertScope();
        await notify({ type: 'DONE', id, result });
      } catch (e) {
        await chrome.runtime
          .sendMessage({
            type: 'FAIL',
            id,
            code: changed
              ? 'context-changed'
              : controller.signal.aborted
                ? 'cancelled'
                : e instanceof SourceError
                  ? e.code
                  : 'read-failed',
          })
          .catch(() => {});
      } finally {
        clearInterval(timer);
        observer.disconnect();
        window.removeEventListener('popstate', checkScope);
        active = null;
      }
    })();
  });
})();
