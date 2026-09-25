/** Exchange the OAuth code, then enforce membership before opening the application. */
import {
  appOrigin,
  sessionClient,
  member,
  ApiError,
} from '../../../lib/server';
export async function GET(request: Request) {
  try {
    const code = new URL(request.url).searchParams.get('code');
    if (!code)
      return Response.json({ error: 'Missing login code.' }, { status: 400 });
    const auth = await sessionClient();
    const { error } = await auth.auth.exchangeCodeForSession(code);
    if (error)
      return Response.json(
        { error: 'Login failed. Please retry.' },
        { status: 401 },
      );
    try {
      await member();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 403) throw error;
      await auth.auth.signOut();
      return Response.json(
        { error: 'An active invitation is required.' },
        { status: 403 },
      );
    }
    return Response.redirect(`${appOrigin()}/import`);
  } catch {
    return Response.json(
      { error: 'Authentication service unavailable.' },
      { status: 503 },
    );
  }
}
