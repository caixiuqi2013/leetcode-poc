/** Server-only authentication and database access. Never trust body-supplied identity. */
import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new ApiError(503, 'configuration-required');
  return value;
}
export function appOrigin() {
  return new URL(required('APP_URL')).origin;
}
export async function sessionClient() {
  const jar = await cookies();
  return createServerClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (items) => {
          items.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        },
      },
    },
  );
}
export function adminClient() {
  return createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
export async function member() {
  const auth = await sessionClient();
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) throw new ApiError(401, 'authentication-required');
  const db = adminClient();
  const permission = await db.rpc('require_member', { p_user: data.user.id });
  if (permission.error) {
    if (permission.error.code === '42501')
      throw new ApiError(403, 'invitation-required');
    throw new ApiError(503, 'database-unavailable');
  }
  return { userId: data.user.id, db };
}
/** Same-origin mutation guard prevents cookie-authenticated cross-site writes. */
export function mutationOrigin(request: Request) {
  if (request.headers.get('origin') !== appOrigin())
    throw new ApiError(403, 'origin-rejected');
}
export async function rpc(
  db: ReturnType<typeof adminClient>,
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    if (error.message.includes('idempotency-conflict'))
      throw new ApiError(409, 'idempotency-conflict');
    if (error.message.includes('refresh-conflict'))
      throw new ApiError(409, 'refresh-conflict');
    if (error.code === '42501') throw new ApiError(403, 'access-denied');
    // Log only database classification, not imported data or credentials.
    console.error('Database RPC failed', name, error.code);
    throw new ApiError(503, 'database-unavailable');
  }
  return data;
}
