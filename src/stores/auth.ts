import { batch, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { api, loginUrl } from '../lib/api/endpoints';
import type { User } from '../lib/api/endpoints';
import { setUnauthorizedHandler } from '../lib/api/client';
import { safeReturnTo } from '../lib/safe-path';
import { saveDraftNow } from './document';
import { toast } from './toasts';
import { t } from '../lib/i18n';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export const [auth, setAuth] = createStore<{ user: User | null; providers: string[]; status: AuthStatus }>({
  user: null,
  providers: [],
  status: 'loading',
});

export const isAuthenticated = () => auth.status === 'authenticated';

/** Bumped when the user signs out / the session expires so cached lists can reset. */
export const [authEpoch, bumpAuthEpoch] = createSignal(0);

export async function initAuth(): Promise<void> {
  setUnauthorizedHandler(() => {
    if (auth.status === 'authenticated') {
      batch(() => {
        setAuth({ user: null, status: 'anonymous' });
        bumpAuthEpoch((v) => v + 1);
      });
      toast.error(t('auth.session_expired'));
    }
  });
  const [me, providers] = await Promise.allSettled([api.me(), api.providers()]);
  batch(() => {
    if (providers.status === 'fulfilled') setAuth('providers', providers.value.providers);
    if (me.status === 'fulfilled' && me.value.user) setAuth({ user: me.value.user, status: 'authenticated' });
    else setAuth({ user: null, status: 'anonymous' });
  });
}

/** Full-page navigation: the OAuth flow is a redirect chain and must not be fetch/XHR. */
export function login(provider: string, returnTo?: string): void {
  saveDraftNow();
  const target = safeReturnTo(returnTo ?? location.pathname + location.search);
  location.assign(loginUrl(provider, target));
}

export async function logout(): Promise<void> {
  try {
    await api.logout();
  } catch {
    /* even if the call fails, drop local state */
  }
  batch(() => {
    setAuth({ user: null, status: 'anonymous' });
    bumpAuthEpoch((v) => v + 1);
  });
  toast.success(t('auth.signed_out'));
}

export function clearUser(): void {
  batch(() => {
    setAuth({ user: null, status: 'anonymous' });
    bumpAuthEpoch((v) => v + 1);
  });
}
