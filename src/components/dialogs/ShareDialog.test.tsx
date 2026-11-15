import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareDialog } from './ShareDialog';
import { api } from '../../lib/api/endpoints';
import { setAuth } from '../../stores/auth';
import { localShares, removeLocalShare } from '../../stores/localShares';

const created = {
  slug: 'abc',
  url: 'http://localhost/s/abc',
  kind: 'single',
  expires_at: '2099-01-01T00:00:00Z',
  created_at: '2025-01-01T00:00:00Z',
  delete_token: 'secret',
};

beforeEach(() => {
  localStorage.clear();
  for (const s of localShares()) removeLocalShare(s.slug);
});
afterEach(() => {
  vi.restoreAllMocks();
  setAuth({ user: null, status: 'anonymous' });
});

const open = (content = '{"a":1}') =>
  render(() => <ShareDialog open onOpenChange={() => undefined} kind="single" content={content} />);

describe('ShareDialog', () => {
  it('anonymous: "Never" is disabled, no history checkbox, token notice shown', () => {
    setAuth({ user: null, status: 'anonymous' });
    open();
    expect(screen.getByRole('option', { name: 'Never' })).toBeDisabled();
    expect(screen.queryByLabelText('Also save to my history')).toBeNull();
    expect(screen.getByText(/stored in this browser/)).toBeInTheDocument();
  });

  it('signed in: "Never" enabled and history checkbox is shown', () => {
    setAuth({
      user: {
        id: '1',
        email: 'a@b.c',
        name: 'A',
        avatar_url: null,
        providers: ['github'],
        created_at: '2025-01-01T00:00:00Z',
      },
      status: 'authenticated',
    });
    open();
    expect(screen.getByRole('option', { name: 'Never' })).not.toBeDisabled();
    expect(screen.getByLabelText('Also save to my history')).toBeInTheDocument();
    expect(screen.queryByText(/stored in this browser/)).toBeNull();
  });

  it('creates an anonymous share and keeps the delete token locally', async () => {
    const spy = vi.spyOn(api, 'createShare').mockResolvedValue(created as never);
    open();
    fireEvent.input(screen.getByLabelText('Title (optional)'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await waitFor(() => expect(screen.getByLabelText('Share link')).toHaveValue('http://localhost/s/abc'));
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'single',
        title: 'Hello',
        content: '{"a":1}',
        expires_in: '7d',
        save_to_history: false,
      }),
    );
    expect(localShares()[0]).toMatchObject({ slug: 'abc', delete_token: 'secret', title: 'Hello' });
    expect(localStorage.getItem('jv.shares.v1')).toContain('secret');
    expect(screen.getByRole('button', { name: /Copy link/ })).toBeInTheDocument();
  });

  it('refuses oversized documents without calling the API', async () => {
    const spy = vi.spyOn(api, 'createShare');
    open('x'.repeat(5 * 1024 * 1024 + 1));
    expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('too large');
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows translated API errors', async () => {
    const { ApiError } = await import('../../lib/api/client');
    vi.spyOn(api, 'createShare').mockRejectedValue(
      new ApiError(429, 'rate_limited', 'slow', undefined, undefined, 12),
    );
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Too many requests.*12/));
  });

  it('lists local shares and deletes with the stored token', async () => {
    vi.spyOn(api, 'createShare').mockResolvedValue(created as never);
    const del = vi.spyOn(api, 'deleteShare').mockResolvedValue(undefined);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await waitFor(() => expect(screen.getByText('My shares on this device')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('abc', 'secret'));
    await waitFor(() => expect(localShares()).toHaveLength(0));
  });
});
