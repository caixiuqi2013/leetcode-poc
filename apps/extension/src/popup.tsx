import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Context, ExportSchema } from '../../../packages/shared/src/schema';
import { Task } from './state';
import './style.css';
function App() {
  const [task, setTask] = useState<Task | null>(null),
    [context, setContext] = useState<Context | null>(null),
    [error, setError] = useState('');
  async function command(type: string) {
    try {
      const r = await chrome.runtime.sendMessage({ type });
      setTask(r.task ?? null);
      setContext(r.context ?? null);
      setError(r.error ?? '');
    } catch {
      setError('Extension worker unavailable. Reopen the popup.');
    }
  }
  useEffect(() => {
    void command('GET');
    const timer = setInterval(() => void command('GET'), 2000);
    return () => clearInterval(timer);
  }, []);
  const result = task?.result;
  const current = context;
  function download() {
    const parsed = ExportSchema.safeParse(result);
    if (!parsed.success) {
      setError('Export failed schema validation.');
      return;
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(parsed.data, null, 2)], {
        type: 'application/json',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `leetcode-${parsed.data.extractionId}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <main>
      <header>
        <span>LEETBYCOMPANY · 0.5.1</span>
        <h1>LeetByCompany</h1>
      </header>
      <p>Practice LeetCode by company.</p>
      <aside>
        Extract the complete selected company and recency list without
        scrolling. Additional page search, filters, and sorting are ignored.
        Keep the company and recency unchanged while extracting.
      </aside>
      <dl>
        <dt>Company</dt>
        <dd>
          {current?.company.name ?? current?.company.slug ?? 'Not identified'}
          {current && !current.company.name ? ' (URL slug)' : ''}
        </dd>
        <dt>Recency</dt>
        <dd>
          {current?.recency.label ?? current?.recency.raw ?? 'Unknown'}
          {current && !current.recency.label
            ? ' (unverified source value)'
            : ''}
        </dd>
        <dt>Scope</dt>
        <dd>Complete company + recency (ignores additional page filters)</dd>
        <dt>Status</dt>
        <dd>{task?.status ?? 'idle'}</dd>
        <dt>Source total</dt>
        <dd>{result?.expectedTotal ?? 'Unknown'}</dd>
        <dt>Unique problems</dt>
        <dd>{result?.extractedCount ?? task?.count ?? 0}</dd>
        <dt>Missing required fields</dt>
        <dd>{result?.coverage.missingRequired ?? 'Not checked'}</dd>
        <dt>Missing topics</dt>
        <dd>{result?.coverage.missingTopics ?? 'Not checked'}</dd>
        <dt>Completeness</dt>
        <dd>{result?.completeness ?? 'Not checked'}</dd>
      </dl>
      {task && <p role="status">{task.message}</p>}
      {task && (
        <small>
          Last task: {task.context.company.slug} /{' '}
          {task.context.recency.raw ?? 'Unknown'}. Results belong to this scope.
        </small>
      )}
      {error && <p role="alert">{error}</p>}
      {result?.warnings.map((w, i) => (
        <p key={i}>{w}</p>
      ))}
      <div className="actions">
        <button
          disabled={!context || task?.status === 'running'}
          onClick={() => void command('BUILD_LIST')}
        >
          {task?.status === 'running'
            ? 'Building your list…'
            : 'Build list & start practicing'}
        </button>
        {task?.status === 'running' && (
          <button onClick={() => void command('CANCEL')}>Cancel</button>
        )}
      </div>
      <details>
        <summary>Export a backup</summary>
        <button
          disabled={!result || task?.status === 'running'}
          onClick={download}
        >
          Export JSON
        </button>
      </details>
      <h2>Preview</h2>
      {result?.problems.slice(0, 5).map((p) => (
        <article key={p.slug}>
          <a href={p.url} target="_blank" rel="noreferrer">
            {p.frontendId} {p.title}
          </a>
          <p>
            {p.difficulty ?? 'Unknown difficulty'} ·{' '}
            {p.topics.join(', ') || 'Uncategorized'}
          </p>
        </article>
      )) ?? (
        <p className="muted">
          No extraction yet. Open a company page, choose a recency, and build
          your list.
        </p>
      )}
      <footer>
        Building a list sends its problems to your practice account. LeetCode
        credentials and personal progress are never transferred.
      </footer>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
