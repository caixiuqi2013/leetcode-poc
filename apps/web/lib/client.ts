/** JSON API client: surface failures; never turn them into empty successful results. */
export async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error?.code ?? body.error ?? 'Request failed');
  return body;
}
export function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error';
}
