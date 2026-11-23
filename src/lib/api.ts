import { getFreshIdToken } from './firebase';

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const idToken = await getFreshIdToken();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (idToken) {
    headers.set('Authorization', `Bearer ${idToken}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.error || `Request failed (${response.status})`) as Error & {
      errors?: Record<string, string>;
      status?: number;
    };
    err.errors = payload.errors;
    err.status = response.status;
    throw err;
  }

  return payload as T;
}
