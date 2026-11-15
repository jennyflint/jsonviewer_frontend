import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request, setUnauthorizedHandler, readCookie } from './client';
import { api, loginUrl } from './endpoints';

const ok = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  document.cookie = 'csrftoken=tok123; path=/';
});
afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
  document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [
    string,
    RequestInit & { headers: Record<string, string> },
  ];
  return { url, init, headers: init.headers };
};

describe('api client', () => {
  it('sends credentials, Accept, a request id and no CSRF on GET', async () => {
    fetchMock.mockResolvedValue(ok({ user: null }));
    await request('/auth/me');
    const { url, init, headers } = lastCall();
    expect(url).toBe('/api/auth/me');
    expect(init.credentials).toBe('include');
    expect(headers.Accept).toBe('application/json');
    expect(headers['X-Request-ID']).toMatch(/.{8,}/);
    expect(headers['X-CSRF-Token']).toBeUndefined();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('adds the CSRF header on %s', async (method) => {
    fetchMock.mockResolvedValue(ok({}));
    await request('/x', { method, body: method === 'DELETE' ? undefined : { a: 1 } });
    expect(lastCall().headers['X-CSRF-Token']).toBe('tok123');
  });

  it('serializes JSON bodies and query strings, skipping empty values', async () => {
    fetchMock.mockResolvedValue(ok({}));
    await request('/history', {
      method: 'POST',
      body: { a: 1 },
      query: { q: 'x y', empty: '', n: undefined, limit: 5 },
    });
    const { url, init, headers } = lastCall();
    expect(url).toBe('/api/history?q=x+y&limit=5');
    expect(init.body).toBe('{"a":1}');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('returns undefined for 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(request('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('parses the error envelope into ApiError', async () => {
    fetchMock.mockResolvedValue(
      ok({ error: { code: 'blocked_destination', message: 'nope', details: { host: 'x' } } }, 422, {
        'X-Request-ID': 'rid-1',
      }),
    );
    const e = await request('/fetch', { method: 'POST', body: {} }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({
      status: 422,
      code: 'blocked_destination',
      message: 'nope',
      details: { host: 'x' },
      requestId: 'rid-1',
    });
  });

  it('handles non-JSON error bodies', async () => {
    fetchMock.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }));
    const e = await request('/x').catch((x) => x);
    expect(e).toMatchObject({ status: 502, code: 'internal_error' });
  });

  it('exposes Retry-After on 429', async () => {
    fetchMock.mockResolvedValue(
      ok({ error: { code: 'rate_limited', message: 'slow', details: null } }, 429, { 'Retry-After': '17' }),
    );
    const e = await request('/x').catch((x) => x);
    expect(e).toMatchObject({ status: 429, code: 'rate_limited', retryAfter: 17 });
  });

  it('maps network failures to network_error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const e = await request('/x').catch((x) => x);
    expect(e).toMatchObject({ status: 0, code: 'network_error' });
  });

  it('calls the unauthorized handler on 401 auth_required, unless quiet', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValue(ok({ error: { code: 'auth_required', message: 'x', details: null } }, 401));
    await request('/history').catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);
    await request('/auth/me', { quiet401: true }).catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('propagates caller aborts as AbortError (not network_error)', async () => {
    fetchMock.mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) =>
          init.signal?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))),
        ),
    );
    const ctrl = new AbortController();
    const p = request('/fetch', { method: 'POST', body: {}, signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('times out with network_error', async () => {
    fetchMock.mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) =>
          init.signal?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))),
        ),
    );
    await expect(request('/slow', { timeoutMs: 10 })).rejects.toMatchObject({
      code: 'network_error',
      message: 'Request timed out',
    });
  });

  it('typed endpoints use the right verbs, paths and headers', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok({})));
    await api.deleteShare('a b', 'tok');
    expect(lastCall().url).toBe('/api/shares/a%20b');
    expect(lastCall().headers['X-Delete-Token']).toBe('tok');
    await api.clearHistory();
    expect(lastCall().init.body).toBe('{"confirm":true}');
    await api.listHistory({ q: 'a', pinned: true, source: 'url', limit: 20, offset: 40 });
    expect(lastCall().url).toBe('/api/history?q=a&pinned=true&source=url&limit=20&offset=40');
    await api.revokeOtherSessions();
    expect(lastCall().url).toBe('/api/auth/sessions');
  });

  it('builds a login URL with an encoded relative return_to', () => {
    expect(loginUrl('github', '/history?q=a b')).toBe(
      '/api/auth/github/login?return_to=%2Fhistory%3Fq%3Da%20b',
    );
  });

  it('reads cookies', () => {
    expect(readCookie('csrftoken')).toBe('tok123');
    expect(readCookie('missing')).toBeNull();
  });
});
