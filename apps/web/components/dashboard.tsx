'use client';
/** Dashboard shows only personally imported company datasets. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, errorText } from '../lib/client';
type Company = {
  slug: string;
  name: string;
  recencies: {
    key: string;
    listId: string;
    total: number;
    completed: number;
  }[];
};
export default function Dashboard() {
  const [companies, setCompanies] = useState<Company[] | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    api('/api/me/companies')
      .then(setCompanies)
      .catch((e) => setError(errorText(e)));
  }, []);
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Your interview preparation</p>
        <h1>
          One company.
          <br />A focused practice plan.
        </h1>
        <p className="muted">
          Import the company lists that matter to you. Practice by topic, track
          your progress, and choose when to update your lists.
        </p>
      </section>
      {error ? (
        <div className="notice error" role="alert">
          <p>
            {error === 'authentication-required'
              ? 'Sign in with your invited Google account to see your lists.'
              : error === 'configuration-required'
                ? 'The server needs Supabase configuration. Imports and progress are not available yet.'
                : error}
          </p>
          <a className="button" href="/auth/login">
            Sign in with Google
          </a>
        </div>
      ) : companies === null ? (
        <p role="status">Loading your companies…</p>
      ) : companies.length === 0 ? (
        <div className="empty">
          <h2>Your first company starts here</h2>
          <p>
            Open a LeetCode company page and choose “Build list & start
            practicing” in the extension.
          </p>
          <Link className="button" href="/import">
            Build your first list
          </Link>
        </div>
      ) : (
        <div className="grid">
          {companies.map((c) => (
            <Link className="card" key={c.slug} href={`/company/${c.slug}`}>
              <p className="eyebrow">{c.recencies.length} imported ranges</p>
              <h2>{c.name}</h2>
              <p className="muted">
                Choose a recency range and continue practicing →
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
