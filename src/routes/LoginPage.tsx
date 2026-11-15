import { A, useNavigate, useSearchParams } from '@solidjs/router';
import { Show, createEffect } from 'solid-js';
import { ProviderButtons } from '../components/layout/ProviderButtons';
import { auth } from '../stores/auth';
import { safeReturnTo } from '../lib/safe-path';
import { t, translate } from '../lib/i18n';
import type { Key } from '../lib/i18n';
import { en } from '../lib/i18n/en';
import { settings } from '../stores/settings';

export default function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const returnTo = () => safeReturnTo(str(params.return_to) ?? '/');
  const errorText = () => {
    const code = str(params.error);
    if (!code) return null;
    const key = `error.${code}` as Key;
    return key in en ? translate(settings.language, key) : t('error.oauth_failed');
  };
  createEffect(() => {
    if (auth.status === 'authenticated') navigate(returnTo(), { replace: true });
  });
  return (
    <div class="mx-auto mt-10 max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h1 class="text-xl font-semibold">{t('login.title')}</h1>
      <p class="mb-4 mt-2 text-sm text-muted">{t('login.subtitle')}</p>
      <Show when={errorText()}>
        <p class="mb-3 rounded-md bg-danger-soft p-2 text-sm text-danger" role="alert">
          {errorText()}
        </p>
      </Show>
      <ProviderButtons returnTo={returnTo()} />
      <A href="/" class="mt-4 inline-block text-sm text-accent underline">
        {t('login.back')}
      </A>
    </div>
  );
}
