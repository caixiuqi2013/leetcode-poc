'use client';
/** The extension starts the work; this page shows progress, saves, then opens practice. */
import { useEffect, useState } from 'react';
import { validateImport } from '../../../packages/shared/src/import';
import { api, errorText } from '../lib/client';
import {
  resumeBuild,
  receiveBuild,
  payloadKey,
  capabilityKey,
  buildError,
  type CapabilityValue,
  type BuildProgress,
} from '../lib/build-flow';
function readExtension(capability: CapabilityValue): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!window.chrome?.runtime?.sendMessage) {
      reject(new Error('bridge-unavailable'));
      return;
    }
    const timer = setTimeout(
      () => reject(new Error('bridge-unavailable')),
      15000,
    );
    try {
      window.chrome.runtime.sendMessage(
        capability.extensionId,
        { type: 'GET_PENDING_IMPORT', importId: capability.importId },
        (response: unknown) => {
          clearTimeout(timer);
          if (window.chrome.runtime.lastError)
            reject(new Error('bridge-unavailable'));
          else resolve(response);
        },
      );
    } catch {
      clearTimeout(timer);
      reject(new Error('bridge-unavailable'));
    }
  });
}
export default function Importer() {
  const [progress, setProgress] = useState<BuildProgress | null>({
      phase: 'reading',
      count: 0,
      total: null,
    }),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setProgress({ phase: 'reading', count: 0, total: null });
    void (async () => {
      try {
        const pending = resumeBuild(location.hash, localStorage);
        if (location.hash) history.replaceState(null, '', '/import');
        let data = pending.data;
        if (pending.capability)
          data = await receiveBuild(
            pending.capability,
            readExtension,
            controller.signal,
            setProgress,
          );
        if (!data) {
          setProgress(null);
          return;
        }
        controller.signal.throwIfAborted();
        localStorage.setItem(payloadKey, JSON.stringify(data));
        localStorage.removeItem(capabilityKey);
        setProgress({
          phase: 'saving',
          count: data.problems.length,
          total: data.problems.length,
          company: data.company.name ?? data.company.slug,
          recency: data.recency.label,
        });
        const result = await api('/api/imports', {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({
            extraction: data,
            idempotencyKey: data.extractionId,
          }),
        });
        controller.signal.throwIfAborted();
        if (result.warnings?.length)
          sessionStorage.setItem(
            'leetbycompany.importNotice',
            JSON.stringify({
              company: data.company.slug,
              message: result.warnings.join(' '),
            }),
          );
        if (localStorage.getItem(payloadKey) === JSON.stringify(data))
          localStorage.removeItem(payloadKey);
        setProgress({
          phase: 'opening',
          count: data.problems.length,
          total: data.problems.length,
        });
        location.replace(
          `/company/${data.company.slug}?recency=${validateImport(data).recencyKey}`,
        );
      } catch (e) {
        if (!controller.signal.aborted) setError(errorText(e));
      }
    })();
    return () => controller.abort();
  }, [attempt]);
  return (
    <section className="build-page">
      <p className="eyebrow">Your next practice session</p>
      <h1>
        {error
          ? 'Let’s finish your list.'
          : progress
            ? 'Building your practice list.'
            : 'Start with a company you want to practice.'}
      </h1>
      <p className="muted">
        {progress?.company
          ? `${progress.company} · ${progress.recency ?? 'Selected recency'}`
          : 'LeetByCompany organizes your selected company list for you.'}
      </p>
      {error ? (
        <div className="notice error" role="alert">
          <p>{buildError(error)}</p>
          <div className="actions">
            {error === 'authentication-required' ? (
              <a className="button" href="/auth/login">
                Sign in with Google
              </a>
            ) : (
              <button onClick={() => setAttempt((x) => x + 1)}>
                Try again
              </button>
            )}
          </div>
        </div>
      ) : progress ? (
        <div
          className="card build-status"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="build-spinner" aria-hidden="true" />
          <h2>
            {progress.phase === 'reading'
              ? 'Gathering your problems…'
              : progress.phase === 'saving'
                ? 'Organizing and saving your list…'
                : 'Opening your practice list…'}
          </h2>
          <p>
            {progress.phase === 'reading'
              ? progress.count
                ? `${progress.count}${progress.total !== null ? ` of ${progress.total}` : ''} problems read`
                : 'Connecting to your LeetCode page. Larger lists may take a little longer.'
              : 'We’re getting your topics and progress ready.'}
          </p>
          {progress.phase === 'reading' &&
            progress.total !== null &&
            progress.total > 0 && (
              <progress
                aria-label="Problems read"
                value={progress.count}
                max={progress.total}
              />
            )}
          <p className="muted">
            You’ll be taken to your list automatically. Keep the LeetCode tab
            open and its company and recency unchanged.
          </p>
        </div>
      ) : (
        <div className="card">
          <h2>One click from LeetCode</h2>
          <ol>
            <li>Open your company page on LeetCode and choose a recency.</li>
            <li>Open the LeetByCompany extension.</li>
            <li>
              Click <strong>Build list &amp; start practicing</strong>.
            </li>
          </ol>
          <p>
            We’ll bring you here, organize the problems, and open your practice
            list automatically.
          </p>
          <a
            className="button"
            href="https://leetcode.com/company/"
            target="_blank"
            rel="noreferrer"
          >
            Open LeetCode
          </a>
        </div>
      )}
    </section>
  );
}
