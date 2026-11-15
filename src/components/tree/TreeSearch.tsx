import { ArrowDown, ArrowUp, CaseSensitive, Filter, Regex, Search } from 'lucide-solid';
import { Show, createEffect, createSignal, on, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import { IconButton } from '../ui/Button';
import { Toggle } from '../ui/Toggle';
import { jsonWorker, isStale } from '../../lib/workers/clients';
import { MAX_MATCHES } from '../../lib/json/search';
import { useDoc } from '../../stores/document';
import type { TreeSearchState } from './TreeView';
import { fmtNumber, t } from '../../lib/i18n';

export function createTreeSearch() {
  const [state, setState] = createStore<TreeSearchState>({
    query: '',
    keys: true,
    values: true,
    caseSensitive: false,
    regex: false,
    matches: new Int32Array(0),
    active: 0,
    filter: false,
  });
  return [state, setState] as const;
}

/** Search box for the tree. Runs in the worker (debounced) and exposes results through `state`. */
export function TreeSearch(props: {
  state: TreeSearchState;
  setState: ReturnType<typeof createTreeSearch>[1];
  inputRef?: (el: HTMLInputElement) => void;
}) {
  const { doc, getModel } = useDoc();
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));

  const run = async () => {
    const s = props.state;
    if (!s.query || !getModel()) {
      props.setState({ matches: new Int32Array(0), active: 0 });
      setError(null);
      return;
    }
    setBusy(true);
    try {
      const r = await jsonWorker.call((w) =>
        w.search(s.query, { keys: s.keys, values: s.values, caseSensitive: s.caseSensitive, regex: s.regex }),
      );
      if (r.ok) {
        props.setState({ matches: r.ids, active: 0 });
        setError(null);
      } else {
        props.setState({ matches: new Int32Array(0), active: 0 });
        setError(r.error);
      }
    } catch (e) {
      if (!isStale(e)) setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  createEffect(
    on(
      () =>
        [
          props.state.query,
          props.state.keys,
          props.state.values,
          props.state.caseSensitive,
          props.state.regex,
          doc.status,
          getModel(),
        ] as const,
      () => {
        clearTimeout(timer);
        timer = setTimeout(() => void run(), 200);
      },
    ),
  );

  const step = (d: number) => {
    const n = props.state.matches.length;
    if (!n) return;
    props.setState('active', (a) => (a + d + n) % n);
  };

  return (
    <div
      class="flex flex-wrap items-center gap-1 border-b border-border bg-surface px-2 py-1.5"
      role="search"
    >
      <div class="relative min-w-[160px] flex-1">
        <Search size={14} class="pointer-events-none absolute left-2 top-2.5 text-muted" aria-hidden="true" />
        <input
          ref={props.inputRef}
          type="search"
          aria-label={t('search.label')}
          placeholder={t('search.placeholder')}
          class="h-9 w-full rounded-md border border-border bg-surface pl-7 pr-2 text-sm"
          value={props.state.query}
          onInput={(e) => props.setState('query', e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              step(e.shiftKey ? -1 : 1);
            }
          }}
        />
      </div>
      <IconButton
        label={t('search.case')}
        active={props.state.caseSensitive}
        onClick={() => props.setState('caseSensitive', (v) => !v)}
        aria-pressed={props.state.caseSensitive}
      >
        <CaseSensitive size={16} />
      </IconButton>
      <IconButton
        label={t('search.regex')}
        active={props.state.regex}
        onClick={() => props.setState('regex', (v) => !v)}
        aria-pressed={props.state.regex}
      >
        <Regex size={16} />
      </IconButton>
      <Toggle
        checked={props.state.keys}
        onChange={(v) => props.setState('keys', v)}
        label={t('search.keys')}
      />
      <Toggle
        checked={props.state.values}
        onChange={(v) => props.setState('values', v)}
        label={t('search.values')}
      />
      <span class="min-w-[7ch] text-xs text-muted" aria-live="polite" data-testid="search-count">
        <Show
          when={error()}
          fallback={
            props.state.query
              ? busy()
                ? '…'
                : props.state.matches.length
                  ? `${props.state.active + 1} / ${fmtNumber(props.state.matches.length)}${props.state.matches.length >= MAX_MATCHES ? '+' : ''}`
                  : t('search.no_results')
              : ''
          }
        >
          <span class="text-danger" title={error() ?? ''}>
            {t('search.bad_regex')}
          </span>
        </Show>
      </span>
      <IconButton label={t('search.prev')} onClick={() => step(-1)} disabled={!props.state.matches.length}>
        <ArrowUp size={16} />
      </IconButton>
      <IconButton label={t('search.next')} onClick={() => step(1)} disabled={!props.state.matches.length}>
        <ArrowDown size={16} />
      </IconButton>
      <IconButton
        label={t('search.filter')}
        active={props.state.filter}
        aria-pressed={props.state.filter}
        onClick={() => props.setState('filter', (v) => !v)}
      >
        <Filter size={16} />
      </IconButton>
    </div>
  );
}
