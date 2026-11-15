import { Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { ProviderButtons } from './ProviderButtons';
import { Skeleton } from '../ui/Spinner';
import { auth } from '../../stores/auth';
import { t } from '../../lib/i18n';
import { A } from '@solidjs/router';

/** Renders children only for signed-in users. Anonymous users get a sign-in card (no hard redirect). */
export function AuthGuard(props: { what: 'history' | 'account'; returnTo: string; children: JSX.Element }) {
  return (
    <Show
      when={auth.status !== 'loading'}
      fallback={
        <div class="mx-auto max-w-3xl space-y-3 p-6" aria-busy="true" data-testid="auth-loading">
          <Skeleton class="h-7 w-1/3" />
          <Skeleton class="h-24 w-full" />
          <Skeleton class="h-24 w-full" />
        </div>
      }
    >
      <Show
        when={auth.status === 'authenticated'}
        fallback={
          <div
            class="mx-auto mt-10 max-w-sm rounded-xl border border-border bg-surface p-6 text-center shadow-sm"
            data-testid="auth-card"
          >
            <h1 class="text-lg font-semibold">
              {t('auth.guard_title', {
                what: t(props.what === 'history' ? 'auth.what_history' : 'auth.what_account'),
              })}
            </h1>
            <p class="mb-4 mt-2 text-sm text-muted">{t('auth.guard_text')}</p>
            <ProviderButtons returnTo={props.returnTo} />
            <A href="/" class="mt-4 inline-block text-sm text-accent underline">
              {t('login.back')}
            </A>
          </div>
        }
      >
        {props.children}
      </Show>
    </Show>
  );
}
