/** OAuth uses a fixed callback origin; pending imports live in this browser's storage. */
import { appOrigin, sessionClient } from '../../../lib/server';
export async function GET() {
  try {
    const auth = await sessionClient();
    const { data, error } = await auth.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${appOrigin()}/auth/callback` },
    });
    if (error || !data.url)
      return Response.json(
        { error: 'Unable to start Google login.' },
        { status: 503 },
      );
    return Response.redirect(data.url);
  } catch {
    return Response.json(
      {
        error:
          'Authentication is not configured. See deployment documentation.',
      },
      { status: 503 },
    );
  }
}
