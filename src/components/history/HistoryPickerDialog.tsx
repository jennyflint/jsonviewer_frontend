import { For, Show, createEffect, createSignal } from 'solid-js';
import { Dialog } from '../ui/Dialog';
import { Spinner } from '../ui/Spinner';
import { api } from '../../lib/api/endpoints';
import type { HistoryItem } from '../../lib/api/endpoints';
import { errorMessage, fmtRelative, fmtSize, t } from '../../lib/i18n';

/** Choose a history entry (used by Compare to fill a side). */
export function HistoryPickerDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (content: string, title: string) => void;
}) {
  const [q, setQ] = createSignal('');
  const [items, setItems] = createSignal<HistoryItem[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      setItems((await api.listHistory({ q: q() || undefined, limit: 30 })).items);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  createEffect(() => {
    if (!props.open) return;
    q();
    clearTimeout(timer);
    timer = setTimeout(() => void load(), 250);
  });

  const pick = async (item: HistoryItem) => {
    try {
      const d = await api.getHistory(item.id);
      props.onPick(d.content, d.title);
      props.onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange} title={t('compare.from_history')} wide>
      <input
        type="search"
        autofocus
        aria-label={t('history.search')}
        placeholder={t('history.search')}
        class="mb-2 h-9 w-full rounded-md border border-border bg-surface px-2"
        value={q()}
        onInput={(e) => setQ(e.currentTarget.value)}
      />
      <Show when={error()}>
        <p class="mb-2 text-sm text-danger" role="alert">
          {error()}
        </p>
      </Show>
      <Show when={busy()}>
        <Spinner />
      </Show>
      <ul class="max-h-80 divide-y divide-border overflow-auto">
        <For
          each={items()}
          fallback={
            <Show when={!busy()}>
              <li class="py-3 text-sm text-muted">{t('history.no_results')}</li>
            </Show>
          }
        >
          {(i) => (
            <li>
              <button
                class="block w-full px-2 py-2 text-left hover:bg-accent-soft"
                onClick={() => void pick(i)}
              >
                <div class="truncate text-sm font-medium">{i.title}</div>
                <div class="truncate font-mono text-xs text-muted">{i.preview}</div>
                <div class="text-xs text-muted">
                  {fmtSize(i.size_bytes)} · {fmtRelative(i.updated_at)}
                </div>
              </button>
            </li>
          )}
        </For>
      </ul>
    </Dialog>
  );
}
