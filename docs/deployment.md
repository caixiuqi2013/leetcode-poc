# Deployment preparation (not performed)

## Supabase

1. Create/select a project and review `supabase/migrations/001_leetbycompany.sql`.
   Apply it only when deployment/database changes are explicitly authorized.
2. Insert the owner and invited friends into `public.invited_emails` with lowercase
   verified Google email addresses, using an administrative database session.
   Do not expose an invitation-edit endpoint. Setting `active=false` revokes API access.
3. Enable Google as the intended authentication provider and configure Google's
   OAuth client with Supabase's callback URL. Disable unused authentication providers.
4. Configure the **Before User Created** Auth hook to call `public.before_user_created`.
   The migration grants only `supabase_auth_admin` execution. This blocks uninvited
   account creation; API membership checks independently block existing uninvited users.
5. Configure Supabase Site URL and redirect allowlist with the exact website URL and
   `/auth/callback`; include localhost only for development.
6. Set `apps/web/.env.local` using `.env.example`. The service role key must stay
   server-only. Browser clients use only the publishable key for authentication.

The migration assumes Supabase's `auth.users`, `anon`, `authenticated`, `service_role`
and `supabase_auth_admin` exist. Database tests create minimal local stand-ins.
RLS is enabled with default-deny policies; all practice data flows through authorized
server RPC projections. Do not add broad table grants to fix an authentication issue.

## Vercel

- Framework: Next.js; root directory: `apps/web`.
- Enable access to files outside the root directory so `packages/shared` resolves.
- Install from workspace root with `pnpm install --frozen-lockfile`.
- Build: `pnpm --filter @poc/web build` from root, or `pnpm build` from apps/web.
- Node 22+; set APP_URL to the exact HTTPS deployment origin.
- Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and the server-only
  SUPABASE_SERVICE_ROLE_KEY. Keep production credentials out of preview deployments
  unless those previews are explicitly trusted and separately configured.
- Verify the invitation hook, two-user isolation, OAuth callback and imports before
  inviting friends. No production deployment has been performed here.

## Extension release origin

```sh
LEETBYCOMPANY_WEB_ORIGIN=https://your-exact-site.example pnpm build
```

Use a single exact HTTPS origin. No wildcard Vercel preview domains. The development
fallback is explicitly `http://localhost:3000`. Chrome's manifest match ignores ports;
the worker additionally enforces exact origin/port and `/import`, top frame, matching
UUID and 24-hour expiry. Only one pending extension task capability is retained; a new build replaces it.
Website LocalStorage retains the task capability while reading and the validated
payload across login. Successful saving clears the payload. Clear site data on
shared devices when abandoning an unfinished build.

## Verification commands

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm build:web
```

For independent-connection transaction contention, use a **new disposable local**
PostgreSQL database with no existing roles/schema conflicts, then:

```sh
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/leetbycompany_test pnpm test:db
```

Tests reject non-local hosts. They create test roles, an auth schema, application
tables and fixtures. Never use a real application database. The default PGlite path
needs no server and skips only the independent-connection contention test.

## Reference documentation

- [Supabase Auth hooks](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Next.js cookies](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [Chrome external messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
