import { MemoryRouter, Route, createMemoryHistory } from '@solidjs/router';
import { render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthGuard } from './AuthGuard';
import { setAuth } from '../../stores/auth';

const user = {
  id: '1',
  email: 'a@b.c',
  name: 'A',
  avatar_url: null,
  providers: ['github'],
  created_at: '2025-01-01T00:00:00Z',
};

const mount = () =>
  render(() => (
    <MemoryRouter history={createMemoryHistory()}>
      <Route
        path="/"
        component={() => (
          <AuthGuard what="history" returnTo="/history">
            <p>secret history</p>
          </AuthGuard>
        )}
      />
    </MemoryRouter>
  ));

afterEach(() => setAuth({ user: null, providers: [], status: 'loading' }));

describe('AuthGuard', () => {
  it('shows a skeleton while auth is loading', () => {
    setAuth({ status: 'loading', user: null });
    mount();
    expect(screen.getByTestId('auth-loading')).toBeInTheDocument();
    expect(screen.queryByText('secret history')).toBeNull();
  });
  it('shows the sign-in card (not a redirect) to anonymous users', () => {
    setAuth({ status: 'anonymous', user: null, providers: ['google', 'github'] });
    mount();
    expect(screen.getByTestId('auth-card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument();
    expect(screen.queryByText('secret history')).toBeNull();
  });
  it('only shows providers the server reports', () => {
    setAuth({ status: 'anonymous', user: null, providers: ['github'] });
    mount();
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();
  });
  it('renders children for signed-in users', () => {
    setAuth({ status: 'authenticated', user });
    mount();
    expect(screen.getByText('secret history')).toBeInTheDocument();
  });
});
