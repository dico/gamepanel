const BASE = '';

export class ApiError extends Error {
  constructor(public status: number, public body: any) {
    super(body?.message || `HTTP ${status}`);
  }
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};

  // Only set Content-Type if there's a body
  if (opts.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers: { ...headers, ...opts.headers as Record<string, string> },
    ...opts,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body);
  }

  return res.json();
}

export const GET = <T = any>(path: string) => api<T>(path);
export const POST = <T = any>(path: string, body?: any) =>
  api<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
export const PATCH = <T = any>(path: string, body: any) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const DELETE = <T = any>(path: string) =>
  api<T>(path, { method: 'DELETE' });
