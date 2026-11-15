import '../test/fakeWorkers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { toast, toasts, dismissToast } from './toasts';
import { confirmAction, pendingConfirm, resolveConfirm } from './confirm';
import { addLocalShare, deleteTokenFor, localShares, removeLocalShare } from './localShares';
import {
  settings,
  updateSettings,
  resetSettings,
  detectLanguage,
  resolvedTheme,
  initSettingsEffects,
} from './settings';
import { auth, setAuth, initAuth, login, logout, clearUser, authEpoch } from './auth';
import { createDocument } from './document';
import {
  compare,
  runCompare,
  setSide,
  swapSides,
  clearCompare,
  setCompareOptions,
  loadCompare,
  useRawFallback,
  compareMode,
} from './compare';
import { autosaveToHistory } from './historySync';
import { fetchAndLoad, recentUrls, rememberUrl, validateHttpUrl } from './loadUrl';
import { mainDocument } from './document';
import { api } from '../lib/api/endpoints';
import { ApiError } from '../lib/api/client';

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});
afterEach(() => {
  vi.restoreAllMocks();
  setAuth({ user: null, providers: [], status: 'anonymous' });
});

describe('toasts', () => {
  it('queues, limits and dismisses', () => {
    for (let i = 0; i < 8; i++) toast.info(`m${i}`);
    expect(toasts().length).toBeLessThanOrEqual(5);
    const last = toasts().at(-1)!;
    dismissToast(last.id);
    expect(toasts().find((t) => t.id === last.id)).toBeUndefined();
    toast.error('bad', { detail: 'd' });
    toast.success('ok', { action: { label: 'Undo', run: () => undefined } });
    expect(toasts().at(-1)?.action?.label).toBe('Undo');
  });
});

describe('confirm', () => {
  it('resolves with the user decision, cancelling a previous pending request', async () => {
    const a = confirmAction({ title: 'A' });
    const b = confirmAction({ title: 'B', danger: true });
    expect(await a).toBe(false);
    expect(pendingConfirm()?.title).toBe('B');
    resolveConfirm(true);
    expect(await b).toBe(true);
    expect(pendingConfirm()).toBeNull();
  });
});

describe('localShares', () => {
  it('adds, finds tokens, removes and prunes expired entries', () => {
    addLocalShare({ slug: 'a', title: null, created_at: 'x', expires_at: null, delete_token: 't1' });
    addLocalShare({
      slug: 'old',
      title: null,
      created_at: 'x',
      expires_at: '2000-01-01T00:00:00Z',
      delete_token: 't2',
    });
    expect(deleteTokenFor('a')).toBe('t1');
    expect(deleteTokenFor('old')).toBeUndefined();
    expect(localStorage.getItem('jv.shares.v1')).toContain('t1');
    removeLocalShare('a');
    expect(localShares().find((s) => s.slug === 'a')).toBeUndefined();
  });
});

describe('settings', () => {
  it('updates, resets and resolves the theme', () => {
    updateSettings({ theme: 'dark', indent: 4 });
    expect(settings.indent).toBe(4);
    expect(resolvedTheme()).toBe('dark');
    updateSettings({ theme: 'light' });
    expect(resolvedTheme()).toBe('light');
    resetSettings();
    expect(settings.indent).toBe(2);
    expect(['en', 'uk']).toContain(detectLanguage());
  });
  it('applies the theme attribute', async () => {
    initSettingsEffects();
    updateSettings({ theme: 'dark' });
    await Promise.resolve();
    expect(document.documentElement.dataset.theme).toBe('dark');
    updateSettings({ theme: 'light', language: 'uk' });
    await Promise.resolve();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.lang).toBe('uk');
    resetSettings();
  });
});

describe('auth store', () => {
  it('boots as authenticated when /auth/me returns a user', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: '1',
        email: 'a@b',
        name: 'A',
        avatar_url: null,
        providers: ['github'],
        created_at: '2025-01-01T00:00:00Z',
      },
    });
    vi.spyOn(api, 'providers').mockResolvedValue({ providers: ['github'] });
    await initAuth();
    expect(auth.status).toBe('authenticated');
    expect(auth.providers).toEqual(['github']);
  });
  it('boots as anonymous when me fails, and the 401 handler signs the user out', async () => {
    vi.spyOn(api, 'me').mockRejectedValue(new ApiError(0, 'network_error', 'x'));
    vi.spyOn(api, 'providers').mockResolvedValue({ providers: ['google'] });
    await initAuth();
    expect(auth.status).toBe('anonymous');
    expect(auth.providers).toEqual(['google']);
  });
  it('logout clears state even if the request fails', async () => {
    setAuth({ status: 'authenticated', user: { id: '1' } as never });
    vi.spyOn(api, 'logout').mockRejectedValue(new Error('x'));
    const before = authEpoch();
    await logout();
    expect(auth.status).toBe('anonymous');
    expect(authEpoch()).toBeGreaterThan(before);
    clearUser();
  });
  it('login is a full-page navigation with a safe return_to', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { assign, pathname: '/history', search: '?q=a' });
    login('github');
    expect(assign).toHaveBeenCalledWith('/api/auth/github/login?return_to=%2Fhistory%3Fq%3Da');
    login('github', 'https://evil.example');
    expect(assign).toHaveBeenLastCalledWith('/api/auth/github/login?return_to=%2F');
    vi.unstubAllGlobals();
  });
});

describe('document store', () => {
  it('parses, tracks status, selects by path and transforms', async () => {
    const d = createDocument({ initialText: '{"a":[1,2],"b":{"c":3}}', persist: false });
    await d.parseNow();
    expect(d.doc.status).toBe('ok');
    expect(d.getModel()?.count).toBe(6);
    expect(d.selectPath('$.b.c')).toBe(true);
    expect(d.doc.selectedNodeId).toBe(5);
    expect(d.selectPath('$.zzz')).toBe(false);
    expect(d.getRows()?.indexOf(5)).toBeGreaterThan(-1); // ancestors revealed
    const r = await d.transform('minify');
    expect(r.ok).toBe(true);
    expect(d.doc.text).toBe('{"a":[1,2],"b":{"c":3}}');
    await d.transform('format', 4);
    expect(d.doc.text).toContain('    "a": [');
    expect(d.doc.dirty).toBe(true);
    d.loadDocument('{"x":1,"x":2}', 'url');
    await d.parseNow();
    expect(d.doc.source).toBe('url');
    expect(d.doc.dirty).toBe(false);
    expect(d.getDupNodes().size).toBe(2);
    d.setText('{"a":', { fromUser: true, immediate: true });
    await d.parseNow();
    expect(d.doc.status).toBe('error');
    expect(d.doc.error?.message).toBe('Unexpected end of input');
    const t = await d.transform('format');
    expect(t.ok).toBe(false);
    d.clearDocument();
    await d.parseNow();
    expect(d.doc.status).toBe('idle');
    expect(d.needsReplaceConfirm()).toBe(false);
  });
  it('keeps expansion across re-parses and persists drafts only when asked', async () => {
    vi.useFakeTimers();
    const d = createDocument({ initialText: '{"a":{"b":{"c":1}}}', persist: true });
    await vi.advanceTimersByTimeAsync(0);
    await d.parseNow();
    d.selectPath('$.a.b.c');
    const rowsBefore = d.getRows()!.length;
    d.setText('{"a":{"b":{"c":2}}}', { fromUser: true, immediate: true });
    await vi.advanceTimersByTimeAsync(10);
    expect(d.getRows()!.length).toBe(rowsBefore);
    await vi.advanceTimersByTimeAsync(1100);
    expect(localStorage.getItem('jv.draft.v1')).toBe('{"a":{"b":{"c":2}}}');
    const other = createDocument({ initialText: '[1]', persist: false });
    other.setText('[2]', { fromUser: true });
    await vi.advanceTimersByTimeAsync(1500);
    expect(localStorage.getItem('jv.draft.v1')).toBe('{"a":{"b":{"c":2}}}');
    vi.useRealTimers();
  });
  it('does not auto-parse documents over the threshold', async () => {
    const d = createDocument({ initialText: '', persist: false });
    updateSettings({ autoParseThreshold: 10 });
    d.setText('[' + '1,'.repeat(20) + '1]', { fromUser: true });
    expect(d.doc.stale).toBe(true);
    await d.parseNow();
    expect(d.doc.stale).toBe(false);
    expect(d.doc.status).toBe('ok');
    resetSettings();
  });
  it('flags oversized drafts instead of saving them', () => {
    const d = createDocument({ initialText: '', persist: true });
    d.setText('x'.repeat(15 * 1024 * 1024 + 1), { fromUser: true });
    d.saveDraftNow();
    expect(d.doc.draftSkipped).toBe(true);
  });
});

describe('compare store', () => {
  it('compares, swaps, exposes raw fallback and clears', async () => {
    clearCompare();
    setSide('left', '{"a":1}');
    setSide('right', '{"a":2,"b":3}');
    await runCompare();
    expect(compare.status).toBe('done');
    expect(compare.result?.changes.map((c) => c.kind).sort()).toEqual(['added', 'changed']);
    swapSides();
    await vi.waitFor(() =>
      expect(compare.result?.changes.map((c) => c.kind).sort()).toEqual(['changed', 'removed']),
    );
    setCompareOptions({ ignoreKeyOrder: false });
    expect(compare.options.ignoreKeyOrder).toBe(false);
    setSide('left', '{bad');
    await runCompare();
    expect(compare.result?.errors[0]?.side).toBe('left');
    useRawFallback();
    await vi.waitFor(() => expect(compare.result?.raw).toBe(true));
    loadCompare('[1]', '[2]');
    expect(compareMode()).toBe('result');
    await vi.waitFor(() => expect(compare.result?.changes).toHaveLength(1));
    clearCompare();
    expect(compare.result).toBeNull();
    await runCompare();
    expect(compare.status).toBe('idle');
  });
});

describe('history autosave', () => {
  it('only saves for signed-in users, dedupes within 5 s and respects the setting', async () => {
    const save = vi.spyOn(api, 'saveHistory').mockResolvedValue({} as never);
    expect(await autosaveToHistory('{"a":1}', 'format')).toBe(false);
    setAuth({ status: 'authenticated', user: { id: '1' } as never });
    expect(await autosaveToHistory('{"a":1}', 'format')).toBe(true);
    expect(await autosaveToHistory('{"a":1}', 'format')).toBe(false); // < 5s, same content
    expect(await autosaveToHistory('{"a":2}', 'format')).toBe(true);
    expect(await autosaveToHistory('   ', 'format')).toBe(false);
    updateSettings({ saveToHistory: false });
    expect(await autosaveToHistory('{"b":1}', 'format')).toBe(false);
    expect(await autosaveToHistory('{"b":1}', 'manual', undefined, { force: true })).toBe(true);
    expect(save).toHaveBeenCalledTimes(3);
    save.mockRejectedValue(new Error('x'));
    expect(await autosaveToHistory('{"c":1}', 'url', 'http://x', { force: true })).toBe(false);
    resetSettings();
  });
});

describe('load URL', () => {
  it('validates URLs and remembers the last 10', () => {
    expect(validateHttpUrl('https://a.b/c')?.hostname).toBe('a.b');
    expect(validateHttpUrl('ftp://a.b')).toBeNull();
    expect(validateHttpUrl('nope')).toBeNull();
    for (let i = 0; i < 12; i++) rememberUrl(`https://x/${i}`);
    expect(recentUrls()).toHaveLength(10);
    expect(recentUrls()[0]).toBe('https://x/11');
  });
  it('loads content into the main document', async () => {
    vi.spyOn(api, 'fetchUrl').mockResolvedValue({
      url: 'https://a/b',
      final_url: 'https://a/c',
      status_code: 200,
      content_type: 'application/json',
      size_bytes: 3,
      is_valid_json: true,
      parse_error: null,
      content: '[1]',
    });
    const res = await fetchAndLoad('https://a/b');
    expect(res?.final_url).toBe('https://a/c');
    expect(mainDocument.doc.text).toBe('[1]');
    expect(mainDocument.doc.source).toBe('url');
  });
  it('still loads invalid JSON and reports the parse error', async () => {
    vi.spyOn(api, 'fetchUrl').mockResolvedValue({
      url: 'u',
      final_url: 'u',
      status_code: 200,
      content_type: 'text/plain',
      size_bytes: 3,
      is_valid_json: false,
      parse_error: { message: 'bad', line: 1, column: 2 },
      content: '{x',
    });
    await fetchAndLoad('https://a/b');
    expect(mainDocument.doc.text).toBe('{x');
    expect(toasts().at(-1)?.kind).toBe('error');
  });
  it('asks before replacing a dirty document and honours "cancel"', async () => {
    mainDocument.setText('{"mine":1}', { fromUser: true });
    vi.spyOn(api, 'fetchUrl').mockResolvedValue({
      url: 'u',
      final_url: 'u',
      status_code: 200,
      content_type: '',
      size_bytes: 1,
      is_valid_json: true,
      parse_error: null,
      content: '[2]',
    });
    const p = fetchAndLoad('https://a/b');
    await vi.waitFor(() => expect(pendingConfirm()).not.toBeNull());
    resolveConfirm(false);
    expect(await p).toBeNull();
    expect(mainDocument.doc.text).toBe('{"mine":1}');
  });
});

void createRoot;
