import { For, Show, createSignal } from 'solid-js';
import { Link2 } from 'lucide-solid';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { fetchAndLoad, recentUrls, validateHttpUrl } from '../../stores/loadUrl';
import { errorMessage, t } from '../../lib/i18n';

import type { FetchResponse } from '../../lib/api/endpoints';

/** `loader` overrides what happens with the fetched content (default: replace the main document). */
export function LoadUrlDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onLoaded?: () => void;
  loader?: (url: string, signal: AbortSignal) => Promise<FetchResponse | null>;
}) {
  const [url, setUrl] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let ctrl: AbortController | undefined;

  const valid = () => validateHttpUrl(url()) !== null;

  const submit = async (e?: Event) => {
    e?.preventDefault();
    if (!valid() || busy()) return;
    ctrl = new AbortController();
    setBusy(true);
    setError(null);
    try {
      const res = await (props.loader ?? fetchAndLoad)(url().trim(), ctrl.signal);
      if (res) {
        props.onOpenChange(false);
        props.onLoaded?.();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const close = (o: boolean) => {
    if (!o) ctrl?.abort();
    props.onOpenChange(o);
  };

  return (
    <Dialog open={props.open} onOpenChange={close} title={t('url.title')} description={t('url.description')}>
      <form onSubmit={submit} class="space-y-3">
        <label class="block text-sm">
          {t('url.label')}
          <input
            type="url"
            autofocus
            required
            placeholder="https://example.com/data.json"
            aria-invalid={url() !== '' && !valid()}
            class="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 font-mono text-sm"
            value={url()}
            onInput={(e) => setUrl(e.currentTarget.value)}
          />
        </label>
        <Show when={url() !== '' && !valid()}>
          <p class="text-xs text-danger">{t('url.invalid')}</p>
        </Show>
        <Show when={error()}>
          <p class="rounded-md bg-danger-soft p-2 text-sm text-danger" role="alert">
            {error()}
          </p>
        </Show>
        <Show when={recentUrls().length > 0}>
          <div>
            <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('url.recent')}</div>
            <ul class="max-h-32 overflow-auto">
              <For each={recentUrls()}>
                {(u) => (
                  <li>
                    <button
                      type="button"
                      class="w-full truncate rounded px-1 py-0.5 text-left font-mono text-xs hover:bg-surface-2"
                      onClick={() => setUrl(u)}
                      title={u}
                    >
                      {u}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
        <div class="flex items-center justify-end gap-2">
          <Show when={busy()}>
            <Spinner label={t('url.fetching')} />
          </Show>
          <Button onClick={() => (busy() ? ctrl?.abort() : close(false))}>
            {busy() ? t('url.cancel_fetch') : t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!valid() || busy()}>
            <Link2 size={14} /> {t('url.load')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
