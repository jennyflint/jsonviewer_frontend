export interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public requestId?: string,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  for (const part of document.cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function requestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const DEFAULT_TIMEOUT_MS = 30_000;

export interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Do not trigger the global 401 handler (used by the boot-time `me` call). */
  quiet401?: boolean;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = (opts.method ?? 'GET').toUpperCase();
  const rid = requestId();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-ID': rid,
    ...opts.headers,
  };
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (UNSAFE.has(method)) {
    const csrf = readCookie('csrftoken');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  let url = '/api' + path;
  if (opts.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query))
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    const s = qs.toString();
    if (s) url += '?' + s;
  }

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener('abort', onAbort, { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body, credentials: 'include', signal: ctrl.signal });
  } catch (e) {
    if (opts.signal?.aborted && !timedOut)
      throw e instanceof DOMException ? e : new DOMException('Aborted', 'AbortError');
    throw new ApiError(0, 'network_error', timedOut ? 'Request timed out' : 'Network error', undefined, rid);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }

  const respRid = res.headers.get('X-Request-ID') ?? rid;
  if (!res.ok) {
    let parsed: ApiErrorBody = {};
    try {
      parsed = (await res.json()) as ApiErrorBody;
    } catch {
      /* non-JSON error body */
    }
    const retry = Number(res.headers.get('Retry-After'));
    const err = new ApiError(
      res.status,
      parsed.error?.code ?? (res.status === 429 ? 'rate_limited' : 'internal_error'),
      parsed.error?.message ?? res.statusText ?? 'Request failed',
      parsed.error?.details,
      respRid,
      Number.isFinite(retry) && retry > 0 ? retry : undefined,
    );
    if (res.status === 401 && err.code === 'auth_required' && !opts.quiet401) unauthorizedHandler?.();
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
