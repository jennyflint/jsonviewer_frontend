import { ArrowLeftRight, Minus, Pencil, Plus, Repeat } from 'lucide-solid';
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { JSX } from 'solid-js';
import type { Change, ChangeKind } from '../../lib/json/diff';
import { fmtNumber, t } from '../../lib/i18n';
import type { Key } from '../../lib/i18n';

const KINDS: { kind: ChangeKind; key: Key; icon: JSX.Element; cls: string }[] = [
  { kind: 'added', key: 'compare.kind_added', icon: <Plus size={13} />, cls: 'text-ok' },
  { kind: 'removed', key: 'compare.kind_removed', icon: <Minus size={13} />, cls: 'text-danger' },
  { kind: 'changed', key: 'compare.kind_changed', icon: <Pencil size={13} />, cls: 'text-warn' },
  { kind: 'type_changed', key: 'compare.kind_type_changed', icon: <Repeat size={13} />, cls: 'text-accent' },
  { kind: 'moved', key: 'compare.kind_moved', icon: <ArrowLeftRight size={13} />, cls: 'text-muted' },
];

/** Structural changes grouped by kind, filterable by kind and path; clicking scrolls both panes. */
export function ChangeList(props: { changes: Change[]; onSelect: (c: Change) => void }) {
  const [enabled, setEnabled] = createSignal<Set<ChangeKind>>(new Set(KINDS.map((k) => k.kind)));
  const [q, setQ] = createSignal('');

  const counts = createMemo(() => {
    const m = new Map<ChangeKind, number>();
    for (const c of props.changes) m.set(c.kind, (m.get(c.kind) ?? 0) + 1);
    return m;
  });
  const visible = createMemo(() => {
    const needle = q().toLowerCase();
    return props.changes.filter(
      (c) => enabled().has(c.kind) && (!needle || c.path.toLowerCase().includes(needle)),
    );
  });
  const toggle = (k: ChangeKind) =>
    setEnabled((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <aside class="flex h-full min-h-0 flex-col bg-surface" aria-label={t('compare.changes')}>
      <h2 class="border-b border-border px-3 py-2 text-sm font-semibold">
        {t('compare.changes')} <span class="text-muted">({fmtNumber(props.changes.length)})</span>
      </h2>
      <div class="space-y-1.5 border-b border-border px-2 py-1.5">
        <input
          type="search"
          aria-label={t('compare.filter_path')}
          placeholder={t('compare.filter_path')}
          class="h-8 w-full rounded-md border border-border bg-surface px-2 text-sm"
          value={q()}
          onInput={(e) => setQ(e.currentTarget.value)}
        />
        <div class="flex flex-wrap gap-1">
          <For each={KINDS}>
            {(k) => (
              <button
                aria-pressed={enabled().has(k.kind)}
                class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                classList={{
                  'border-accent bg-accent-soft': enabled().has(k.kind),
                  'border-border text-muted': !enabled().has(k.kind),
                }}
                onClick={() => toggle(k.kind)}
              >
                <span class={k.cls}>{k.icon}</span> {t(k.key)} {counts().get(k.kind) ?? 0}
              </button>
            )}
          </For>
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-auto" data-testid="change-list">
        <Show
          when={props.changes.length}
          fallback={<p class="p-3 text-sm text-muted">{t('compare.no_changes')}</p>}
        >
          <For each={KINDS.filter((k) => visible().some((c) => c.kind === k.kind))}>
            {(k) => (
              <section>
                <h3 class="sticky top-0 flex items-center gap-1.5 bg-surface-2 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                  <span class={k.cls}>{k.icon}</span> {t(k.key)}
                </h3>
                <ul>
                  <For
                    each={visible()
                      .filter((c) => c.kind === k.kind)
                      .slice(0, 2000)}
                  >
                    {(c) => (
                      <li>
                        <button
                          class="block w-full px-3 py-1 text-left hover:bg-accent-soft"
                          onClick={() => props.onSelect(c)}
                        >
                          <div class="truncate font-mono text-xs" title={c.path}>
                            {c.path}
                          </div>
                          <Show
                            when={c.kind === 'changed' || c.kind === 'type_changed' || c.kind === 'moved'}
                          >
                            <div class="truncate font-mono text-[11px] text-muted">
                              <span class="text-danger">{c.oldValue}</span> →{' '}
                              <span class="text-ok">{c.newValue}</span>
                            </div>
                          </Show>
                          <Show when={c.kind === 'added'}>
                            <div class="truncate font-mono text-[11px] text-ok">{c.newValue}</div>
                          </Show>
                          <Show when={c.kind === 'removed'}>
                            <div class="truncate font-mono text-[11px] text-danger">{c.oldValue}</div>
                          </Show>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            )}
          </For>
        </Show>
      </div>
    </aside>
  );
}
