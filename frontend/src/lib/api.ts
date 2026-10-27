export const desktop = location.pathname === '/desktop';
// Run once, before React mounts. StrictMode must not consume fragments twice.
const fragment = new URLSearchParams(location.hash.slice(1));
export const initialPairingToken = desktop ? null : fragment.get('pair');
if (desktop && fragment.has('admin')) sessionStorage.setItem('relay_admin', fragment.get('admin')!);
if (location.hash) history.replaceState(null, '', location.pathname);

export class RequestError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    signal: AbortSignal.timeout(8000),
    headers: { ...(desktop ? { Authorization: `Bearer ${sessionStorage.getItem('relay_admin') ?? ''}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new RequestError(data.error ?? 'Hoso could not complete that request.', response.status);
  return data as T;
}
export function message(error: unknown, fallback: string) { return error instanceof RequestError ? error.message : fallback; }
export const sessionEndpoint = desktop ? '/api/admin/session' : '/api/session';
