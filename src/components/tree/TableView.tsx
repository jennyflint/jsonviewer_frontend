import { createVirtualizer } from '@tanstack/solid-virtual';
import { ArrowDown, ArrowUp, Copy, Download } from '../../lib/icons';
import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';
import { Button } from '../ui/Button';
import { useDoc } from '../../stores/document';
import { buildPath } from '../../lib/json/path';
import {
  cellNode,
  cellText,
  filterRows,
  nearestTableArray,
  sortRows,
  tableInfo,
  toCsv,
} from '../../lib/json/table';
import { T_NUMBER } from '../../lib/json/parser';
import { copyText } from '../../lib/clipboard';
import { downloadText } from '../../lib/files';
import { toast } from '../../stores/toasts';
import { fmtNumber, t } from '../../lib/i18n';

const ROW_H = 28;
const COL_W = 170;
const IDX_W = 56;

/** Array of objects as a sortable, filterable, virtualized table. Click a row to select that element. */
export function TableView() {
  const { doc, getModel, selectNode } = useDoc();
  let scroller!: HTMLDivElement;
  const [sort, setSort] = createSignal<{ col: string; dir: 1 | -1 } | null>(null);
  const [filter, setFilter] = createSignal('');
  const [filterCol, setFilterCol] = createSignal('');

  const arrayId = createMemo(() => {
    const m = getModel();
    return m ? nearestTableArray(m, Math.max(0, doc.selectedNodeId)) : -1;
  });
  const info = createMemo(() => {
    const m = getModel();
    const a = arrayId();
    return m && a >= 0 ? tableInfo(m, a) : null;
  });
  const rows = createMemo(() => {
    const m = getModel();
    const i = info();
    if (!m || !i) return [];
    let r = filterRows(m, i.rows, i.columns, filter(), filterCol() || undefined);
    const s = sort();
    if (s) r = sortRows(m, r, s.col, s.dir);
    return r;
  });

  const virt = createVirtualizer({
    get count() {
      return rows().length;
    },
    getScrollElement: () => scroller,
    estimateSize: () => ROW_H,
    overscan: 12,
  });

  // reset sorting / filtering when another array is shown
  createEffect(() => {
    arrayId();
    setSort(null);
    setFilter('');
    setFilterCol('');
  });

  const toggleSort = (col: string) =>
    setSort((s) => (s?.col === col ? (s.dir === 1 ? { col, dir: -1 } : null) : { col, dir: 1 }));
  const width = () => IDX_W + (info()?.columns.length ?? 0) * COL_W;

  const csv = () => {
    const m = getModel();
    const i = info();
    return m && i ? toCsv(m, rows(), i.columns) : '';
  };

  return (
    <section class="flex h-full min-h-0 flex-col bg-surface" aria-label={t('table.title')}>
      <Show when={info()} fallback={<p class="p-4 text-sm text-muted">{t('table.none')}</p>}>
        {(i) => (
          <>
            <div class="flex flex-wrap items-center gap-2 border-b border-border px-2 py-1.5">
              <span
                class="font-mono text-xs text-muted"
                title={getModel() ? buildPath(getModel()!, i().arrayId) : ''}
              >
                {getModel() ? buildPath(getModel()!, i().arrayId) : ''}
              </span>
              <span class="text-xs text-muted" data-testid="table-count">
                {t('table.rows', { shown: fmtNumber(rows().length), total: fmtNumber(i().rows.length) })}
              </span>
              <input
                type="search"
                aria-label={t('table.filter')}
                placeholder={t('table.filter')}
                class="ml-auto h-8 w-48 rounded-md border border-border bg-surface px-2 text-sm"
                value={filter()}
                onInput={(e) => setFilter(e.currentTarget.value)}
              />
              <select
                aria-label={t('table.filter_column')}
                class="h-8 rounded-md border border-border bg-surface px-1 text-sm"
                value={filterCol()}
                onChange={(e) => setFilterCol(e.currentTarget.value)}
              >
                <option value="">{t('table.all_columns')}</option>
                <For each={i().columns}>{(c) => <option value={c}>{c}</option>}</For>
              </select>
              <Button
                size="sm"
                onClick={async () =>
                  toast.success((await copyText(csv())) ? t('table.csv_copied') : t('copy.failed'))
                }
              >
                <Copy size={12} /> CSV
              </Button>
              <Button size="sm" onClick={() => downloadText('table.csv', csv(), 'text/csv')}>
                <Download size={12} /> CSV
              </Button>
            </div>
          </>
        )}
      </Show>
      <div
        ref={scroller}
        class="min-h-0 flex-1 overflow-auto"
        classList={{ hidden: !info() }}
        data-testid="table-scroll"
      >
        <Show when={info()}>
          {(i) => (
            <div style={{ width: `${width()}px`, 'min-width': '100%' }}>
              <div
                role="row"
                class="sticky top-0 z-10 flex border-b border-border bg-surface-2 text-xs font-semibold"
                style={{ height: `${ROW_H}px` }}
              >
                <div class="shrink-0 px-2 py-1 text-muted" style={{ width: `${IDX_W}px` }}>
                  #
                </div>
                <For each={i().columns}>
                  {(c) => (
                    <button
                      role="columnheader"
                      aria-sort={
                        sort()?.col === c ? (sort()!.dir === 1 ? 'ascending' : 'descending') : 'none'
                      }
                      class="flex shrink-0 items-center gap-1 truncate px-2 py-1 text-left hover:text-accent"
                      style={{ width: `${COL_W}px` }}
                      title={c}
                      onClick={() => toggleSort(c)}
                    >
                      <span class="truncate">{c}</span>
                      <Show when={sort()?.col === c}>
                        {sort()!.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                      </Show>
                    </button>
                  )}
                </For>
              </div>
              <div style={{ height: `${virt.getTotalSize()}px`, position: 'relative' }}>
                <For each={virt.getVirtualItems()}>
                  {(item) => {
                    const row = () => rows()[item.index];
                    return (
                      <Show when={row() !== undefined}>
                        <div
                          role="row"
                          tabindex="0"
                          aria-selected={doc.selectedNodeId === row()}
                          class="absolute left-0 flex cursor-pointer border-b border-border font-mono text-xs hover:bg-surface-2 focus-visible:bg-surface-2"
                          classList={{ 'bg-accent-soft': doc.selectedNodeId === row() }}
                          style={{
                            height: `${ROW_H}px`,
                            transform: `translateY(${item.start}px)`,
                            width: '100%',
                          }}
                          onClick={() => selectNode(row() as number, { source: 'panel' })}
                          onKeyDown={(e) =>
                            (e.key === 'Enter' || e.key === ' ') &&
                            (e.preventDefault(), selectNode(row() as number, { source: 'panel' }))
                          }
                        >
                          <div
                            role="cell"
                            class="shrink-0 px-2 py-1 text-muted"
                            style={{ width: `${IDX_W}px` }}
                          >
                            {(getModel()?.ord[row() as number] ?? 0) + 1}
                          </div>
                          <For each={i().columns}>
                            {(c) => {
                              const m = () => getModel();
                              const n = () => (m() ? cellNode(m()!, row() as number, c) : -1);
                              return (
                                <div
                                  role="cell"
                                  class="shrink-0 truncate px-2 py-1"
                                  classList={{ 'text-right': n() >= 0 && m()!.type[n()] === T_NUMBER }}
                                  style={{ width: `${COL_W}px` }}
                                  title={m() ? cellText(m()!, row() as number, c) : ''}
                                >
                                  {m() ? cellText(m()!, row() as number, c) : ''}
                                </div>
                              );
                            }}
                          </For>
                        </div>
                      </Show>
                    );
                  }}
                </For>
              </div>
            </div>
          )}
        </Show>
      </div>
    </section>
  );
}
