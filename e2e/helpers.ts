import type { Page, Route } from '@playwright/test';

export interface MockState {
  user: Record<string, unknown> | null;
  providers: string[];
  shares: Map<string, Record<string, unknown>>;
  history: Record<string, unknown>[];
  calls: { method: string; path: string; body?: unknown; headers: Record<string, string> }[];
  fetchResponse?: (url: string) => { status: number; body: unknown };
}

export const USER = {
  id: 'u1',
  email: 'ann@example.com',
  name: 'Ann',
  avatar_url: null,
  providers: ['github'],
  created_at: '2025-01-01T00:00:00Z',
};

const json = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers });

export function err(code: string, message: string) {
  return { error: { code, message, details: null } };
}

export function historyEntry(
  id: string,
  title: string,
  content: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    title,
    content,
    preview: content.slice(0, 80),
    size_bytes: content.length,
    is_valid_json: true,
    source: 'manual',
    source_url: null,
    share_slug: null,
    pinned: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
    deduplicated: false,
    ...extra,
  };
}

/** Intercepts every /api call with an in-memory fake of the backend. */
export async function mockApi(page: Page, init: Partial<MockState> = {}): Promise<MockState> {
  const state: MockState = {
    user: null,
    providers: ['google', 'github'],
    shares: new Map(),
    history: [],
    calls: [],
    ...init,
  };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = req.method();
    let body: any;
    try {
      body = req.postDataJSON();
    } catch {
      body = undefined;
    }
    state.calls.push({ method, path, body, headers: req.headers() });

    if (path === '/health') return json(route, 200, { status: 'ok' });
    if (path === '/auth/me') return json(route, 200, { user: state.user });
    if (path === '/auth/providers') return json(route, 200, { providers: state.providers });
    if (path === '/auth/logout') {
      state.user = null;
      return route.fulfill({ status: 204 });
    }
    if (path === '/auth/sessions' && method === 'GET') {
      return json(route, 200, [
        {
          id: 's1',
          created_at: '2025-01-01T00:00:00Z',
          last_seen_at: '2025-01-02T00:00:00Z',
          expires_at: '2025-02-01T00:00:00Z',
          user_agent: 'Chrome',
          ip: '127.0.0.1',
          current: true,
        },
        {
          id: 's2',
          created_at: '2025-01-01T00:00:00Z',
          last_seen_at: '2025-01-02T00:00:00Z',
          expires_at: '2025-02-01T00:00:00Z',
          user_agent: 'Firefox',
          ip: '10.0.0.2',
          current: false,
        },
      ]);
    }
    if (path.startsWith('/auth/sessions')) return route.fulfill({ status: 204 });
    if (path === '/auth/account' && method === 'DELETE') {
      state.user = null;
      return route.fulfill({ status: 204 });
    }

    if (path === '/fetch') {
      const r = state.fetchResponse?.(body.url);
      if (r) return json(route, r.status, r.body);
      return json(route, 200, {
        url: body.url,
        final_url: body.url,
        status_code: 200,
        content_type: 'application/json',
        size_bytes: 20,
        is_valid_json: true,
        parse_error: null,
        content: '{"from":"url","n":[1,2]}',
      });
    }

    if (path === '/shares' && method === 'POST') {
      const slug = `slug${state.shares.size + 1}`;
      const detail = {
        slug,
        kind: body.kind,
        title: body.title ?? null,
        content: body.content,
        content_right: body.content_right ?? null,
        size_bytes: body.content.length,
        created_at: '2025-01-01T00:00:00Z',
        expires_at: body.expires_in === 'never' ? null : '2099-01-01T00:00:00Z',
        view_count: 3,
        is_owner: false,
      };
      state.shares.set(slug, { ...detail, delete_token: 'tok-' + slug });
      return json(
        route,
        201,
        {
          slug,
          url: `http://localhost/s/${slug}`,
          kind: body.kind,
          expires_at: detail.expires_at,
          created_at: detail.created_at,
          delete_token: state.user ? null : 'tok-' + slug,
        },
        {},
      );
    }
    const shareMatch = path.match(/^\/shares\/([^/]+)$/);
    if (shareMatch) {
      const slug = shareMatch[1] as string;
      const s = state.shares.get(slug);
      if (method === 'GET')
        return s ? json(route, 200, s) : json(route, 404, err('share_not_found', 'Share not found.'));
      if (method === 'DELETE') {
        if (s && req.headers()['x-delete-token'] === s.delete_token) {
          state.shares.delete(slug);
          return route.fulfill({ status: 204 });
        }
        return json(route, 403, err('forbidden', 'nope'));
      }
    }

    if (path === '/history' && method === 'GET') {
      const q = url.searchParams.get('q')?.toLowerCase();
      const pinned = url.searchParams.get('pinned') === 'true';
      let items = state.history.filter(
        (h) => (!q || String(h.title).toLowerCase().includes(q)) && (!pinned || h.pinned),
      );
      const total = items.length;
      const off = Number(url.searchParams.get('offset') ?? 0);
      items = items.slice(off, off + Number(url.searchParams.get('limit') ?? 20));
      return json(route, 200, {
        items: items.map(({ content: _c, ...rest }) => rest),
        total,
        limit: 20,
        offset: off,
      });
    }
    if (path === '/history' && method === 'POST') {
      const e = historyEntry(
        'h' + (state.history.length + 1),
        body.title ?? 'Saved ' + (state.history.length + 1),
        body.content,
        { source: body.source },
      );
      state.history.unshift(e);
      return json(route, 201, e);
    }
    if (path === '/history' && method === 'DELETE') {
      state.history = [];
      return route.fulfill({ status: 204 });
    }
    const hm = path.match(/^\/history\/([^/]+)$/);
    if (hm) {
      const id = hm[1];
      const i = state.history.findIndex((h) => h.id === id);
      if (i < 0) return json(route, 404, err('not_found', 'nf'));
      if (method === 'GET') return json(route, 200, state.history[i]);
      if (method === 'PATCH') {
        state.history[i] = { ...state.history[i], ...body };
        return json(route, 200, state.history[i]);
      }
      if (method === 'DELETE') {
        state.history.splice(i, 1);
        return route.fulfill({ status: 204 });
      }
    }
    return json(route, 404, err('not_found', 'unmocked ' + path));
  });
  return state;
}

/** Replace the editor content (fast: no per-key typing). */
export async function setEditor(page: Page, text: string, nth = 0) {
  const ed = page.locator('.cm-content').nth(nth);
  await ed.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
}
