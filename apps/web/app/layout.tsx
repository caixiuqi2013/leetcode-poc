import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
export const metadata: Metadata = {
  title: 'LeetByCompany',
  description: 'Practice LeetCode by company.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link className="brand" href="/">
            Leet<span>ByCompany</span>
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/">My companies</Link>
            <Link href="/import">Add a list</Link>
            <a href="/auth/login">Sign in with Google</a>
          </nav>
        </header>
        <main className="shell">{children}</main>
        <footer className="site-footer">
          Practice LeetCode by company. Your lists, your pace.
        </footer>
      </body>
    </html>
  );
}
