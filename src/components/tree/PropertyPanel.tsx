import { createVirtualizer } from '@tanstack/solid-virtual';
import { ArrowDown, ArrowUp } from 'lucide-solid';
import { For, Show, createMemo, createSignal } from 'solid-js';
import { useDoc } from '../../stores/document';
import { children, isContainer, keyOf, previewValue, typeName } from '../../lib/json/access';
import { T_ARRAY } from '../../lib/json/parser';
import { typeColor } from './typeIcon';
import { fmtNumber, t } from '../../lib/i18n';

type SortKey = 'name' | 'value' | 'type' | null;

/** Name | Value | Type table of the selected node's direct children (virtualized, sortable). */
export function PropertyPanel() {
  const { doc, getModel, selectNode } = useDoc();
  let scroller!: HTMLDivElement;
  const [sortKey, setSortKey] = createSignal<SortKey>(null);
  const [asc, setAsc] = createSignal(true);

  const info = createMemo(() => {
    const m = getModel();
    const id = doc.selectedNodeId;
    if (!m || id < 0 || !isContainer(m, id)) return null;
    const isArr = m.type[id] === T_ARRAY;
    const rows = children(m, id).map((c) => ({
      id: c,
      name: isArr ? String(m.ord[c]) : (keyOf(m, c) as string),
      value: previewValue(m, c, 120),
      type: typeName(m, c),
      t: m.type[c] as number,
    }));
    return { rows, isArr, parent: id };
  });

  const sorted = createMemo(() => {
    const i = info();
    if (!i) return [];
    const k = sortKey();
    if (!k) return i.rows;
    const dir = asc() ? 1 : -1;
    const numeric = k === 'name' && i.isArr;
    return [...i.rows].sort((a, b) => {
      if (numeric) return (Number(a.name) - Number(b.name)) * dir;
      return a[k].localeCompare(b[k], undefined, { numeric: true }) * dir;
    });
  });

  const virt = createVirtualizer({
    get count() {
      return sorted().length;
    },
    getScrollElement: () => scroller,
    estimateSize: () => 26,
    overscan: 10,
  });

  const header = (key: Exclude<SortKey, null>, label: string) => (
    <th
      scope="col"
      aria-sort={sortKey() === key ? (asc() ? 'ascending' : 'descending') : 'none'}
      class="px-2 py-1 text-left font-semibold"
    >
      <button
        class="inline-flex items-center gap-1 hover:text-accent"
        onClick={() => {
          if (sortKey() === key) setAsc(!asc());
          else {
            setSortKey(key);
            setAsc(true);
          }
        }}
      >
        {label}
        <Show when={sortKey() === key}>{asc() ? <ArrowUp size={12} /> : <ArrowDown size={12} />}</Show>
      </button>
    </th>
  );

  return (
    <section class="flex h-full min-h-0 flex-col bg-surface" aria-label={t('props.label')}>
      <Show when={info()} fallback={<div class="p-3 text-sm text-muted">{t('props.select_container')}</div>}>
        {(i) => (
          <>
            <div class="border-b border-border px-2 py-1 text-xs text-muted">
              {t('props.children', { n: fmtNumber(i().rows.length) })}
            </div>
            <table class="w-full table-fixed text-xs" role="table">
              <colgroup>
                <col style={{ width: '30%' }} />
                <col />
                <col style={{ width: '18%' }} />
              </colgroup>
              <thead class="bg-surface-2">
                <tr>
                  {header('name', t('props.name'))}
                  {header('value', t('props.value'))}
                  {header('type', t('props.type'))}
                </tr>
              </thead>
            </table>
          </>
        )}
      </Show>
      {/* the scroll element must exist from the start so the virtualizer can measure it */}
      <div
        ref={scroller}
        class="min-h-0 flex-1 overflow-auto"
        classList={{ hidden: !info() }}
        data-testid="property-rows"
      >
        <div style={{ height: `${virt.getTotalSize()}px`, position: 'relative' }}>
          <For each={virt.getVirtualItems()}>
            {(item) => {
              const row = () => sorted()[item.index];
              return (
                <Show when={row()}>
                  {(r) => (
                    <div
                      role="row"
                      tabindex="0"
                      class="absolute left-0 grid w-full cursor-pointer items-center border-b border-border font-mono text-xs hover:bg-surface-2 focus-visible:bg-surface-2"
                      style={{
                        height: '26px',
                        transform: `translateY(${item.start}px)`,
                        'grid-template-columns': '30% 1fr 18%',
                      }}
                      onClick={() => selectNode(r().id, { source: 'panel' })}
                      onKeyDown={(e) =>
                        (e.key === 'Enter' || e.key === ' ') &&
                        (e.preventDefault(), selectNode(r().id, { source: 'panel' }))
                      }
                    >
                      <span role="cell" class="truncate px-2 font-semibold" title={r().name}>
                        {r().name}
                      </span>
                      <span
                        role="cell"
                        class="truncate px-2"
                        style={{ color: typeColor(r().t) }}
                        title={r().value}
                      >
                        {r().value}
                      </span>
                      <span role="cell" class="truncate px-2 text-muted">
                        {r().type}
                      </span>
                    </div>
                  )}
                </Show>
              );
            }}
          </For>
        </div>
      </div>
    </section>
  );
}
