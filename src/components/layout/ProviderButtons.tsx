import { For, Show } from 'solid-js';
import { auth, login } from '../../stores/auth';
import { t } from '../../lib/i18n';

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.4-4.7 7.1l7.2 5.6c4.3-4 6.8-9.9 6.8-17.2z"
      />
      <path
        fill="#FBBC05"
        d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.6 2.3-8.7 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** Provider-branded sign-in buttons; only providers reported by `/auth/providers` are shown. Full-page navigation. */
export function ProviderButtons(props: { returnTo?: string }) {
  return (
    <Show
      when={auth.providers.length > 0}
      fallback={<p class="text-sm text-muted">{t('login.no_providers')}</p>}
    >
      <div class="flex flex-col gap-2">
        <For each={auth.providers}>
          {(p) => (
            <button
              type="button"
              onClick={() => login(p, props.returnTo)}
              class="inline-flex h-10 items-center justify-center gap-2.5 rounded-md border px-4 text-sm font-medium"
              style={
                p === 'github'
                  ? { background: '#24292f', color: '#ffffff', 'border-color': '#24292f' }
                  : { background: '#ffffff', color: '#1f1f1f', 'border-color': '#747775' }
              }
            >
              {p === 'google' ? <GoogleG /> : p === 'github' ? <GitHubMark /> : null}
              {p === 'google'
                ? t('login.google')
                : p === 'github'
                  ? t('login.github')
                  : t('auth.sign_in_with', { provider: p })}
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}
