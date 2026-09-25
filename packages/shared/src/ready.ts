/** Wait for the selected scope to render, without changing the page or scrolling. */
export async function waitForReady<T>(
  read: () => T,
  signal: AbortSignal,
  options: { timeoutMs?: number; pollMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + (options.timeoutMs ?? 10000);
  while (true) {
    signal.throwIfAborted();
    try {
      return read();
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== 'context-not-ready' ||
        Date.now() >= deadline
      )
        throw error;
    }
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(
        () => {
          signal.removeEventListener('abort', abort);
          resolve();
        },
        Math.min(options.pollMs ?? 200, Math.max(0, deadline - Date.now())),
      );
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }
}
