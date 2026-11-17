import { createVirtualizer } from '@tanstack/solid-virtual';
import { ContextMenu } from '@kobalte/core/context-menu';
import { AlertTriangle, ChevronDown, ChevronRight, Copy, Star } from '../../lib/icons';
import { For, Show, createEffect, createMemo, createSignal, on } from 'solid-js';
import { useDoc } from '../../stores/document';
import type { DocumentStore } from '../../stores/document';
import { VisibleRows } from '../../lib/json/tree-model';
import { isContainer, keyOf, typeName, previewValue, raw, stringValue } from '../../lib/json/access';
import { prettyNode } from '../../lib/json/format';
import { buildPath, resolvePath } from '../../lib/json/path';
import { bookmarksOf, toggleBookmark } from '../../stores/bookmarks';
import { T_ARRAY, T_STRING } from '../../lib/json/parser';
import { copyText } from '../../lib/clipboard';
import { toast } from '../../stores/toasts';
import { featureOn, settings } from '../../stores/settings';
import { highlightText } from './highlight';
import { typeColor, typeIcon } from './typeIcon';
import { t } from '../../lib/i18n';
import { confirmAction } from '../../stores/confirm';

export interface TreeSearchState {
  query: string;
  keys: boolean;
  values: boolean;
  caseSensitive: boolean;
  regex: boolean;
  matches: Int32Array;
  active: number;
  filter: boolean;
}

export const EXPAND_ALL_GUARD = 50_000;
const ROW_HEIGHT = 24;

export function TreeView(props: { search?: TreeSearchState; active?: boolean }) {
  const { doc, getDupNodes, getModel, getRows, selectNode, touchRows, getFocus, setFocus, tabId } = useDoc();
  /** Depth of the focused branch root: rows are indented relative to it. */
  const baseDepth = () => {
    const f = getFocus();
    const m = getModel();
    return f >= 0 && m ? (m.depth[f] as number) : 0;
  };
  /** Node ids of the bookmarked paths (recomputed when bookmarks or the document change). */
  const bookmarkIds = createMemo(() => {
    const m = getModel();
    const ids = new Set<number>();
    if (m) for (const b of bookmarksOf(tabId)) ids.add(resolvePath(m, b.path));
    return ids;
  });
  let scroller!: HTMLDivElement;
  const model = () => getModel();
  const matchSet = createMemo(() => new Set(props.search?.matches ?? []));
  const activeMatchId = () => {
    const s = props.search;
    return s && s.matches.length ? (s.matches[s.active] ?? -1) : -1;
  };

  /** Visible node ids: normal expansion state, or "matches + ancestors" when filtering. */
  const rowIds = createMemo<Int32Array>(() => {
    const r = getRows();
    const m = model();
    if (!r || !m) return new Int32Array(0);
    const s = props.search;
    if (s?.filter && s.matches.length) return VisibleRows.filtered(m, s.matches);
    return r.rows.subarray(0, r.length);
  });

  const virt = createVirtualizer({
    get count() {
      return rowIds().length;
    },
    getScrollElement: () => scroller,
    estimateSize: () => ROW_HEIGHT,
    overscan: 14,
  });

  const rowIndex = (id: number) => {
    const ids = rowIds();
    let lo = 0;
    let hi = ids.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = ids[mid] as number;
      if (v === id) return mid;
      if (v < id) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  };

  const scrollToNode = (id: number) => {
    const i = rowIndex(id);
    if (i >= 0) virt.scrollToIndex(i, { align: 'auto' });
  };

  // keep the selection in view (selected from path bar, search, duplicates panel, editor …)
  createEffect(
    on(
      () => [doc.selectedNodeId, props.active, getRows()] as const,
      ([id, active]) => {
        if (id < 0 || active === false) return;
        const r = getRows();
        if (r && !props.search?.filter && r.reveal(id)) touchRows();
        queueMicrotask(() => scrollToNode(id));
      },
    ),
  );

  createEffect(
    on(activeMatchId, (id) => {
      if (id < 0) return;
      const r = getRows();
      if (r && !props.search?.filter && r.reveal(id)) touchRows();
      selectNode(id, { source: 'tree' });
      queueMicrotask(() => scrollToNode(id));
    }),
  );

  const isOpen = (id: number) =>
    props.search?.filter && props.search.matches.length ? true : !!getRows()?.isExpanded(id);

  const toggle = (id: number) => {
    const r = getRows();
    if (!r || props.search?.filter) return;
    r.toggle(id);
    touchRows();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const m = model();
    const r = getRows();
    if (!m || !r) return;
    const ids = rowIds();
    if (!ids.length) return;
    const idx = rowIndex(doc.selectedNodeId);
    const select = (i: number) => {
      const c = Math.max(0, Math.min(ids.length - 1, i));
      selectNode(ids[c] as number, { source: 'tree', reveal: false });
      virt.scrollToIndex(c, { align: 'auto' });
    };
    const id = doc.selectedNodeId;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        select(idx < 0 ? 0 : idx + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        select(idx < 0 ? 0 : idx - 1);
        break;
      case 'Home':
        e.preventDefault();
        select(0);
        break;
      case 'End':
        e.preventDefault();
        select(ids.length - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (idx < 0) select(0);
        else if (isContainer(m, id) && (m.childCount[id] as number) > 0) {
          if (!isOpen(id)) toggle(id);
          else select(idx + 1);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (idx < 0) break;
        if (isContainer(m, id) && isOpen(id) && !props.search?.filter) toggle(id);
        else if ((m.parent[id] as number) >= 0)
          selectNode(m.parent[id] as number, { source: 'tree', reveal: false });
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (idx >= 0 && e.key === ' ') toggle(id);
        else if (idx < 0) select(0);
        break;
      case '*': {
        e.preventDefault();
        if (idx < 0) break;
        const p = m.parent[id] as number;
        if (p < 0) {
          if (!isOpen(id)) toggle(id);
          break;
        }
        for (let c = m.firstChild[p] as number; c >= 0; c = m.nextSibling[c] as number) {
          if (isContainer(m, c) && (m.childCount[c] as number) > 0) r.expanded.add(c);
        }
        r.rebuild();
        touchRows();
        break;
      }
    }
  };

  // context menu
  const [ctxNode, setCtxNode] = createSignal(-1);
  const act = {
    value: async () => {
      const m = model();
      const id = ctxNode();
      if (!m || id < 0) return;
      const v =
        (m.type[id] as number) === T_STRING
          ? stringValue(m, id)
          : isContainer(m, id)
            ? prettyNode(m, id, settings.indent)
            : raw(m, id);
      toast.success((await copyText(v)) ? t('copy.value_done') : t('copy.failed'));
    },
    key: async () => {
      const m = model();
      const k = m ? keyOf(m, ctxNode()) : null;
      if (k === null) return;
      toast.success((await copyText(k)) ? t('copy.key_done') : t('copy.failed'));
    },
    path: async () => {
      const m = model();
      if (!m || ctxNode() < 0) return;
      toast.success((await copyText(buildPath(m, ctxNode()))) ? t('copy.path_done') : t('copy.failed'));
    },
    subtree: async () => {
      const m = model();
      if (!m || ctxNode() < 0) return;
      toast.success(
        (await copyText(prettyNode(m, ctxNode(), settings.indent)))
          ? t('copy.subtree_done')
          : t('copy.failed'),
      );
    },
    recursive: (open: boolean) => {
      const r = getRows();
      if (!r || ctxNode() < 0 || props.search?.filter) return;
      r.setRecursive(ctxNode(), open);
      touchRows();
    },
  };

  return (
    <ContextMenu>
      <ContextMenu.Trigger
        as="div"
        class="h-full"
        onContextMenu={(e: MouseEvent) => {
          const el = (e.target as HTMLElement).closest<HTMLElement>('[data-node]');
          if (el) {
            const id = Number(el.dataset.node);
            setCtxNode(id);
            selectNode(id, { source: 'tree', reveal: false });
          } else e.preventDefault();
        }}
      >
        <div
          ref={scroller}
          role="tree"
          aria-label={t('tree.label')}
          aria-multiselectable="false"
          aria-activedescendant={doc.selectedNodeId >= 0 ? `tn-${doc.selectedNodeId}` : undefined}
          tabindex="0"
          class="h-full overflow-auto bg-surface"
          onKeyDown={onKeyDown}
          data-testid="tree"
        >
          <Show
            when={model()}
            fallback={
              <div class="p-4 text-sm text-muted">
                {doc.status === 'error' ? t('tree.invalid') : t('tree.empty')}
              </div>
            }
          >
            {(m) => (
              <div
                style={{
                  height: `${virt.getTotalSize()}px`,
                  position: 'relative',
                  'min-width': 'max-content',
                  width: '100%',
                }}
              >
                <For each={virt.getVirtualItems()}>
                  {(item) => {
                    const id = () => rowIds()[item.index] as number;
                    return (
                      <Show when={item.index < rowIds().length}>
                        <TreeRow
                          id={id()}
                          model={m()}
                          y={item.start}
                          selected={doc.selectedNodeId === id()}
                          open={isOpen(id())}
                          dup={getDupNodes().has(id())}
                          matched={matchSet().has(id())}
                          baseDepth={baseDepth()}
                          bookmarked={bookmarkIds().has(id())}
                          onBookmark={() => toggleBookmark(tabId, buildPath(m(), id()))}
                          isActiveMatch={activeMatchId() === id()}
                          search={props.search}
                          setSize={rowIds().length}
                          posInSet={item.index + 1}
                          onToggle={() => toggle(id())}
                          onSelect={() => selectNode(id(), { source: 'tree', reveal: false })}
                          onCopyPath={async () => {
                            toast.success(
                              (await copyText(buildPath(m(), id()))) ? t('copy.path_done') : t('copy.failed'),
                            );
                          }}
                        />
                      </Show>
                    );
                  }}
                </For>
              </div>
            )}
          </Show>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content class="menu-content">
          <ContextMenu.Item class="menu-item" onSelect={() => void act.value()}>
            {t('tree.copy_value')}
          </ContextMenu.Item>
          <ContextMenu.Item
            class="menu-item"
            disabled={
              ctxNode() < 0 ||
              !model() ||
              (model()!.keyStart[ctxNode()] as number) < 0 ||
              model()!.type[model()!.parent[ctxNode()] as number] === T_ARRAY
            }
            onSelect={() => void act.key()}
          >
            {t('tree.copy_key')}
          </ContextMenu.Item>
          <ContextMenu.Item class="menu-item" onSelect={() => void act.path()}>
            {t('tree.copy_path')}
          </ContextMenu.Item>
          <ContextMenu.Item class="menu-item" onSelect={() => void act.subtree()}>
            {t('tree.copy_subtree')}
          </ContextMenu.Item>
          <ContextMenu.Separator class="menu-sep" />
          <Show when={featureOn('focusBranch')}>
            <ContextMenu.Item
              class="menu-item"
              disabled={ctxNode() < 0 || !model() || !isContainer(model()!, ctxNode())}
              onSelect={() => setFocus(ctxNode())}
            >
              {t('tree.focus_branch')}
            </ContextMenu.Item>
          </Show>
          <Show when={featureOn('bookmarks')}>
            <ContextMenu.Item
              class="menu-item"
              onSelect={() => {
                const m = model();
                if (m && ctxNode() >= 0) toggleBookmark(tabId, buildPath(m, ctxNode()));
              }}
            >
              {t('bookmarks.toggle')}
            </ContextMenu.Item>
          </Show>
          <ContextMenu.Separator class="menu-sep" />
          <ContextMenu.Item class="menu-item" onSelect={() => act.recursive(true)}>
            {t('tree.expand_recursive')}
          </ContextMenu.Item>
          <ContextMenu.Item class="menu-item" onSelect={() => act.recursive(false)}>
            {t('tree.collapse_recursive')}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>
  );
}

function TreeRow(props: {
  id: number;
  model: NonNullable<ReturnType<DocumentStore['getModel']>>;
  y: number;
  selected: boolean;
  open: boolean;
  dup: boolean;
  matched: boolean;
  isActiveMatch: boolean;
  search?: TreeSearchState;
  setSize: number;
  posInSet: number;
  onToggle: () => void;
  onSelect: () => void;
  onCopyPath: () => void;
  baseDepth: number;
  bookmarked: boolean;
  onBookmark: () => void;
}) {
  const m = () => props.model;
  const container = () => isContainer(m(), props.id) && (m().childCount[props.id] as number) > 0;
  const type = () => m().type[props.id] as number;
  const key = () => {
    const k = keyOf(m(), props.id);
    if (k !== null) return k;
    const p = m().parent[props.id] as number;
    return p >= 0 ? String(m().ord[props.id]) : '$';
  };
  const isIndex = () => {
    const p = m().parent[props.id] as number;
    return p >= 0 && m().type[p] === T_ARRAY;
  };
  const s = () => props.search;
  const hl = (text: string, isKey: boolean) => {
    const q = s();
    if (!q || !q.query || !props.matched) return text;
    if (isKey ? !q.keys : !q.values) return text;
    return highlightText(text, q.query, q, props.isActiveMatch);
  };
  const preview = () => previewValue(m(), props.id, 200);
  return (
    <div
      id={`tn-${props.id}`}
      data-node={props.id}
      role="treeitem"
      aria-level={(m().depth[props.id] as number) - props.baseDepth + 1}
      aria-expanded={container() ? props.open : undefined}
      aria-selected={props.selected}
      aria-setsize={props.setSize}
      aria-posinset={props.posInSet}
      class="tree-row group absolute left-0 flex w-full cursor-default items-center whitespace-nowrap pr-2"
      style={{
        height: `${ROW_HEIGHT}px`,
        transform: `translateY(${props.y}px)`,
        'padding-left': `${((m().depth[props.id] as number) - props.baseDepth) * 16 + 4}px`,
      }}
      onClick={() => props.onSelect()}
      onDblClick={() => container() && props.onToggle()}
    >
      <span class="inline-flex w-5 shrink-0 justify-center">
        <Show when={container()}>
          <button
            tabindex="-1"
            class="rounded text-muted hover:text-fg"
            aria-label={props.open ? t('tree.collapse') : t('tree.expand')}
            onClick={(e) => {
              e.stopPropagation();
              props.onToggle();
            }}
          >
            {props.open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </Show>
      </span>
      {typeIcon(type())}
      <span
        class="ml-1 font-semibold"
        style={{ color: isIndex() ? 'var(--muted)' : `var(--k-${typeName(m(), props.id)})` }}
      >
        {hl(key(), true)}
      </span>
      <Show when={props.dup}>
        <span
          class="ml-1 inline-flex items-center text-warn"
          title={t('tree.duplicate_key')}
          role="img"
          aria-label={t('tree.duplicate_key')}
        >
          <AlertTriangle size={13} />
        </span>
      </Show>
      <span class="mx-1 text-muted">:</span>
      <span style={{ color: typeColor(type()) }} class="overflow-hidden text-ellipsis">
        {hl(preview(), false)}
      </span>
      <Show when={featureOn('bookmarks')}>
        <button
          tabindex="-1"
          class="ml-2 rounded p-0.5 hover:bg-surface-2"
          classList={{
            'inline-flex text-warn': props.bookmarked,
            'hidden text-muted hover:text-fg group-hover:inline-flex': !props.bookmarked,
          }}
          aria-label={props.bookmarked ? t('bookmarks.remove') : t('bookmarks.add')}
          aria-pressed={props.bookmarked}
          title={props.bookmarked ? t('bookmarks.remove') : t('bookmarks.add')}
          onClick={(e) => {
            e.stopPropagation();
            props.onBookmark();
          }}
        >
          <Star size={12} fill={props.bookmarked ? 'currentColor' : 'none'} />
        </button>
      </Show>
      <button
        tabindex="-1"
        class="ml-2 hidden rounded p-0.5 text-muted hover:bg-surface-2 hover:text-fg group-hover:inline-flex"
        aria-label={t('tree.copy_path')}
        title={t('tree.copy_path')}
        onClick={(e) => {
          e.stopPropagation();
          props.onCopyPath();
        }}
      >
        <Copy size={12} />
      </button>
    </div>
  );
}

/** Toolbar helpers shared with the page (expand/collapse all with the large-document guard). */
export async function expandAll(store: DocumentStore): Promise<void> {
  const { getRows, getModel, touchRows } = store;
  const r = getRows();
  const m = getModel();
  if (!r || !m) return;
  if (m.count > EXPAND_ALL_GUARD) {
    const ok = await confirmAction({
      title: t('tree.expand_all'),
      message: t('tree.expand_all_confirm', { n: m.count }),
      confirmLabel: t('tree.expand_all'),
    });
    if (!ok) return;
  }
  r.expandAll();
  touchRows();
}

export function collapseAll(store: DocumentStore): void {
  const { getRows, touchRows } = store;
  const r = getRows();
  if (!r) return;
  r.collapseAll();
  touchRows();
}

export function expandToLevel(store: DocumentStore, level: number): void {
  const { getRows, touchRows } = store;
  const r = getRows();
  if (!r) return;
  r.expandToLevel(level);
  touchRows();
}
