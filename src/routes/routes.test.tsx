import '../test/fakeWorkers';
import { MemoryRouter, Route, createMemoryHistory } from '@solidjs/router';
import { fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'solid-js';
import ViewerPage from './ViewerPage';
import ComparePage from './ComparePage';
import SharedPage from './SharedPage';
import HistoryPage from './HistoryPage';
import AccountPage from './AccountPage';
import LoginPage from './LoginPage';
import NotFoundPage from './NotFoundPage';
import { ConfirmHost } from '../components/dialogs/ConfirmDialog';
import { ToastHost } from '../components/ui/ToastHost';
import { api } from '../lib/api/endpoints';
import { ApiError } from '../lib/api/client';
import { auth, setAuth } from '../stores/auth';
import { mainDocument } from '../stores/document';
import { clearCompare, compare, setSide } from '../stores/compare';
import { resetSettings } from '../stores/settings';
import { clearToasts } from '../stores/toasts';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';

const user = {
  id: '1',
  email: 'ann@example.com',
  name: 'Ann',
  avatar_url: null,
  providers: ['github'],
  created_at: '2025-01-01T00:00:00Z',
};

function mount(path: string, Page: Component, route = '/') {
  const history = createMemoryHistory();
  history.set({ value: path, scroll: false, replace: true });
  return render(() => (
    <MemoryRouter
      history={history}
      root={(p) => (
        <>
          <Header onShortcuts={() => undefined} />
          {p.children}
          <ConfirmHost />
          <ToastHost />
          <Footer />
        </>
      )}
    >
      <Route path={route} component={Page} />
    </MemoryRouter>
  ));
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(api, 'health').mockResolvedValue({ status: 'ok' } as never);
  setAuth({ user: null, providers: ['github', 'google'], status: 'anonymous' });
  mainDocument.clearDocument();
  clearCompare();
  resetSettings();
  clearToasts();
});
afterEach(() => vi.restoreAllMocks());

describe('NotFound / Login', () => {
  it('renders the 404 page', () => {
    mount('/nope', NotFoundPage, '*');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
  it('shows translated oauth errors and provider buttons', () => {
    mount('/login?error=oauth_failed', LoginPage, '/login');
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in failed');
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
  });
  it('shows a message when no providers are configured', () => {
    setAuth({ providers: [] });
    mount('/login', LoginPage, '/login');
    expect(screen.getByText(/No sign-in providers/)).toBeInTheDocument();
  });
});

describe('Header', () => {
  it('hides History when anonymous and shows the user menu when signed in', () => {
    mount('/nope', NotFoundPage, '*');
    expect(screen.queryByRole('link', { name: 'History' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
  it('shows History and the user menu when authenticated', () => {
    setAuth({ user, status: 'authenticated' });
    mount('/nope', NotFoundPage, '*');
    expect(screen.getByRole('link', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'User menu' })).toBeInTheDocument();
  });
  it('footer reflects API status', async () => {
    mount('/nope', NotFoundPage, '*');
    await waitFor(() => expect(screen.getByText('API online')).toBeInTheDocument());
  });
  it('footer shows offline when the API fails', async () => {
    vi.spyOn(api, 'health').mockRejectedValue(new ApiError(0, 'network_error', 'x'));
    mount('/nope', NotFoundPage, '*');
    await waitFor(() => expect(screen.getByText(/API offline/)).toBeInTheDocument());
  });
});

describe('ViewerPage', () => {
  it('toolbar: format, minify, sort, copy, clear (with confirm for big documents)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText, readText: vi.fn().mockResolvedValue('{"z":1,"a":[1,2]}') },
    });
    mount('/', ViewerPage);
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
    await waitFor(() => expect(mainDocument.doc.text).toBe('{"z":1,"a":[1,2]}'));
    await waitFor(() => expect(screen.getByText('Valid JSON')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Sort keys' }));
    await waitFor(() =>
      expect(mainDocument.doc.text.indexOf('"a"')).toBeLessThan(mainDocument.doc.text.indexOf('"z"')),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove white space' }));
    await waitFor(() => expect(mainDocument.doc.text).toBe('{"a":[1,2],"z":1}'));
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    await waitFor(() => expect(mainDocument.doc.text).toContain('\n  "a": ['));
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Clear' })); // small doc: no confirmation
    await waitFor(() => expect(mainDocument.doc.text).toBe(''));
    vi.unstubAllGlobals();
  });
  it('clearing a document over 1 KB asks first', async () => {
    mainDocument.setText(JSON.stringify({ d: 'x'.repeat(2000) }), { immediate: true });
    mount('/', ViewerPage);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    const dlg = await screen.findByRole('dialog');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    expect(mainDocument.doc.text.length).toBeGreaterThan(1000);
  });
  it('invalid JSON: format reports the error location instead of changing the text', async () => {
    mainDocument.setText('{"a":1,}', { immediate: true });
    mount('/', ViewerPage);
    await waitFor(() => expect(screen.getByText(/Trailing comma/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    await waitFor(() => expect(screen.getByText('Cannot process invalid JSON')).toBeInTheDocument());
    expect(mainDocument.doc.text).toBe('{"a":1,}');
  });
  it('shows history actions only when signed in', async () => {
    mainDocument.setText('{"a":1}', { immediate: true });
    mount('/', ViewerPage);
    expect(screen.queryByRole('button', { name: 'Save to history' })).toBeNull();
    setAuth({ user, status: 'authenticated' });
    const save = vi.spyOn(api, 'saveHistory').mockResolvedValue({ deduplicated: false } as never);
    fireEvent.click(await screen.findByRole('button', { name: 'Save to history' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ content: '{"a":1}', source: 'manual' }));
  });
  it('duplicates panel toggles and reports duplicate keys with a badge', async () => {
    mainDocument.setText('{"a":1,"a":2,"b":"s","c":"s"}', { immediate: true });
    mount('/', ViewerPage);
    await waitFor(() => expect(screen.getByText('Valid JSON')).toBeInTheDocument());
    const btn = screen.getByRole('button', { name: /Duplicates/ });
    await waitFor(() => expect(within(btn).getByLabelText('1 duplicate keys')).toBeInTheDocument());
    fireEvent.click(btn);
    const panel = await screen.findByRole('complementary', { name: 'Duplicates' });
    await waitFor(() => expect(within(panel).getByText('Duplicate keys')).toBeInTheDocument(), {
      timeout: 3000,
    });
    await waitFor(() => expect(within(panel).getAllByText(/×2/).length).toBeGreaterThan(0), {
      timeout: 3000,
    });
  });
  it('viewer tab shows the tree and search', async () => {
    mainDocument.setText('{"alpha":1,"beta":{"gamma":2}}', { immediate: true });
    mount('/', ViewerPage);
    fireEvent.click(await screen.findByRole('tab', { name: 'Viewer' }));
    await waitFor(() => expect(screen.getAllByRole('treeitem').length).toBeGreaterThan(2));
    const search = screen.getByRole('searchbox', { name: 'Search in tree' });
    fireEvent.input(search, { target: { value: 'gamma' } });
    await waitFor(() => expect(screen.getByTestId('search-count')).toHaveTextContent('1 / 1'), {
      timeout: 3000,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
  });
});

describe('ComparePage', () => {
  it('compares two sides and shows stats, change list and exports', async () => {
    setSide('left', '{"a":1,"b":2}');
    setSide('right', '{"a":1,"b":3,"c":4}');
    mount('/compare', ComparePage, '/compare');
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    await waitFor(() => expect(screen.getByTestId('compare-stats')).toBeInTheDocument());
    expect(screen.getByTestId('change-list')).toHaveTextContent('$.c');
    expect(screen.getByTestId('change-list')).toHaveTextContent('$.b');
    fireEvent.click(screen.getByRole('button', { name: 'Edit inputs' }));
    expect(compare.result).not.toBeNull();
  });
  it('swap and clear', async () => {
    setSide('left', '[1]');
    setSide('right', '[2]');
    mount('/compare', ComparePage, '/compare');
    fireEvent.click(screen.getByRole('button', { name: 'Swap' }));
    expect(compare.left).toBe('[2]');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(compare.left).toBe('');
  });
});

describe('SharedPage', () => {
  const detail = {
    slug: 'abc',
    kind: 'single',
    title: 'T',
    content: '{"k":1}',
    content_right: null,
    size_bytes: 7,
    created_at: '2025-01-01T00:00:00Z',
    expires_at: null,
    view_count: 4,
    is_owner: false,
  };
  it('renders a share with metadata and no delete button for strangers', async () => {
    vi.spyOn(api, 'getShare').mockResolvedValue(detail as never);
    mount('/s/abc', SharedPage, '/s/:slug');
    await screen.findByRole('heading', { name: 'T' });
    expect(screen.getByText('4 views')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete share' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open in editor' })).toBeInTheDocument();
  });
  it('shows a delete button to the owner and deletes after confirmation', async () => {
    vi.spyOn(api, 'getShare').mockResolvedValue({ ...detail, is_owner: true } as never);
    const del = vi.spyOn(api, 'deleteShare').mockResolvedValue(undefined);
    mount('/s/abc', SharedPage, '/s/:slug');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete share' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(del).toHaveBeenCalled());
  });
  it('friendly not-found page on 404', async () => {
    vi.spyOn(api, 'getShare').mockRejectedValue(new ApiError(404, 'share_not_found', 'nf'));
    mount('/s/zzz', SharedPage, '/s/:slug');
    expect(await screen.findByTestId('share-not-found')).toBeInTheDocument();
  });
  it('other errors offer a retry', async () => {
    vi.spyOn(api, 'getShare').mockRejectedValue(new ApiError(500, 'internal_error', 'boom'));
    mount('/s/zzz', SharedPage, '/s/:slug');
    expect(await screen.findByRole('alert')).toHaveTextContent('went wrong');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
  it('renders compare shares with the diff stats', async () => {
    vi.spyOn(api, 'getShare').mockResolvedValue({
      ...detail,
      kind: 'compare',
      content: '{"a":1}',
      content_right: '{"a":2}',
    } as never);
    mount('/s/abc', SharedPage, '/s/:slug');
    expect(await screen.findByRole('button', { name: 'Open in Compare' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('compare-stats')).toBeInTheDocument());
  });
});

describe('HistoryPage', () => {
  const entry = (id: string, over = {}) => ({
    id,
    title: `Doc ${id}`,
    preview: '{}',
    size_bytes: 10,
    is_valid_json: true,
    source: 'manual',
    source_url: null,
    share_slug: null,
    pinned: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
    ...over,
  });
  it('asks anonymous users to sign in', () => {
    mount('/history', HistoryPage, '/history');
    expect(screen.getByTestId('auth-card')).toBeInTheDocument();
  });
  it('lists, pins, renames and deletes with undo', async () => {
    setAuth({ user, status: 'authenticated' });
    vi.spyOn(api, 'listHistory').mockResolvedValue({
      items: [entry('1'), entry('2')],
      total: 2,
      limit: 20,
      offset: 0,
    } as never);
    const upd = vi.spyOn(api, 'updateHistory').mockResolvedValue({} as never);
    vi.spyOn(api, 'getHistory').mockResolvedValue({ ...entry('1'), content: '{"a":1}' } as never);
    const del = vi.spyOn(api, 'deleteHistory').mockResolvedValue(undefined);
    const create = vi.spyOn(api, 'saveHistory').mockResolvedValue({ id: '9' } as never);
    mount('/history', HistoryPage, '/history');
    const rows = await screen.findAllByTestId('history-item');
    expect(rows).toHaveLength(2);
    fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Pin' }));
    await waitFor(() => expect(upd).toHaveBeenCalledWith('1', { pinned: true }));
    fireEvent.click(
      within(screen.getAllByTestId('history-item')[0]!).getByRole('button', { name: 'Rename' }),
    );
    fireEvent.input(screen.getByLabelText('Entry title'), { target: { value: 'Renamed' } });
    fireEvent.keyDown(screen.getByLabelText('Entry title'), { key: 'Enter' });
    await waitFor(() => expect(upd).toHaveBeenCalledWith('1', { title: 'Renamed' }));
    fireEvent.click(
      within(screen.getAllByTestId('history-item')[0]!).getByRole('button', { name: 'Delete' }),
    );
    await waitFor(() => expect(del).toHaveBeenCalledWith('1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ content: '{"a":1}' })));
  });
  it('shows an error with retry when loading fails, and the empty state', async () => {
    setAuth({ user, status: 'authenticated' });
    vi.spyOn(api, 'listHistory')
      .mockRejectedValueOnce(new ApiError(0, 'network_error', 'x'))
      .mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 } as never);
    mount('/history', HistoryPage, '/history');
    expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('history-empty')).toBeInTheDocument();
  });
  it('compare is enabled only with exactly two selected entries', async () => {
    setAuth({ user, status: 'authenticated' });
    vi.spyOn(api, 'listHistory').mockResolvedValue({
      items: [entry('1'), entry('2'), entry('3')],
      total: 3,
      limit: 20,
      offset: 0,
    } as never);
    mount('/history', HistoryPage, '/history');
    const rows = await screen.findAllByTestId('history-item');
    const btn = screen.getByRole('button', { name: 'Compare selected' });
    expect(btn).toBeDisabled();
    fireEvent.click(within(rows[0]!).getByRole('checkbox'));
    fireEvent.click(within(rows[1]!).getByRole('checkbox'));
    expect(btn).not.toBeDisabled();
    fireEvent.click(within(rows[2]!).getByRole('checkbox'));
    expect(btn).toBeDisabled();
  });
});

describe('AccountPage', () => {
  it('lists sessions, revokes one, and deletes the account after typed confirmation', async () => {
    setAuth({ user, status: 'authenticated' });
    const sessions = [
      {
        id: 's1',
        created_at: '2025-01-01T00:00:00Z',
        last_seen_at: '2025-01-02T00:00:00Z',
        expires_at: '2025-02-01T00:00:00Z',
        user_agent: 'Chrome',
        ip: '1.1.1.1',
        current: true,
      },
      {
        id: 's2',
        created_at: '2025-01-01T00:00:00Z',
        last_seen_at: '2025-01-02T00:00:00Z',
        expires_at: '2025-02-01T00:00:00Z',
        user_agent: 'Firefox',
        ip: '2.2.2.2',
        current: false,
      },
    ];
    vi.spyOn(api, 'sessions').mockResolvedValue(sessions);
    const revoke = vi.spyOn(api, 'revokeSession').mockResolvedValue(undefined);
    const others = vi.spyOn(api, 'revokeOtherSessions').mockResolvedValue(undefined);
    const delAcc = vi.spyOn(api, 'deleteAccount').mockResolvedValue(undefined);
    mount('/account', AccountPage, '/account');
    expect(await screen.findByText('Firefox')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('s2'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out all other sessions' }));
    await waitFor(() => expect(others).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    const dlg = await screen.findByRole('dialog');
    const confirm = within(dlg).getByRole('button', { name: 'Delete account' });
    expect(confirm).toBeDisabled();
    fireEvent.input(within(dlg).getByRole('textbox'), { target: { value: 'DELETE' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(delAcc).toHaveBeenCalled());
    await waitFor(() => expect(auth.status).toBe('anonymous'));
  });
});
