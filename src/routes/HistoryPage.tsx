import { useNavigate, useSearchParams } from '@solidjs/router';
import { GitCompare, Trash } from 'lucide-solid';
import { createEffect, createSignal, on, onCleanup } from 'solid-js';
import { AuthGuard } from '../components/layout/AuthGuard';
import { Button } from '../components/ui/Button';
import { HistoryFilters } from '../components/history/HistoryFilters';
import type { Filters } from '../components/history/HistoryFilters';
import { HistoryList } from '../components/history/HistoryList';
import { ShareDialog } from '../components/dialogs/ShareDialog';
import { api } from '../lib/api/endpoints';
import type { HistoryItem, HistoryQuery } from '../lib/api/endpoints';
import { authEpoch } from '../stores/auth';
import { confirmAction } from '../stores/confirm';
import { loadDocument, needsReplaceConfirm } from '../stores/document';
import { loadCompare } from '../stores/compare';
import { toast } from '../stores/toasts';
import { errorMessage, t } from '../lib/i18n';

const PAGE = 20;

function History() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const filters = (): Filters => ({
    q: str(params.q),
    source: str(params.source),
    pinned: str(params.pinned) === '1',
    sort: str(params.sort) || 'updated_at',
    order: str(params.order) === 'asc' ? 'asc' : 'desc',
  });
  const filtered = () => !!(filters().q || filters().source || filters().pinned);

  const [items, setItems] = createSignal<HistoryItem[]>([]);
  const [total, setTotal] = createSignal(0);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [qInput, setQInput] = createSignal(filters().q);
  const [shareCtx, setShareCtx] = createSignal<{ content: string; title: string } | null>(null);
  let ctrl: AbortController | undefined;

  const query = (offset: number): HistoryQuery => {
    const f = filters();
    return {
      q: f.q || undefined,
      source: (f.source || undefined) as HistoryQuery['source'],
      pinned: f.pinned || undefined,
      sort: f.sort as HistoryQuery['sort'],
      order: f.order,
      limit: PAGE,
      offset,
    };
  };

  const load = async (reset: boolean) => {
    ctrl?.abort();
    ctrl = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const page = await api.listHistory(query(reset ? 0 : items().length), ctrl.signal);
      setItems(reset ? page.items : [...items(), ...page.items]);
      setTotal(page.total);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  // filters live in the URL, so reload and back/forward restore them
  createEffect(
    on(
      () => [params.q, params.source, params.pinned, params.sort, params.order, authEpoch()] as const,
      () => {
        setSelected(new Set<string>());
        void load(true);
      },
    ),
  );
  onCleanup(() => ctrl?.abort());

  let qTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(qTimer));
  const onQInput = (v: string) => {
    setQInput(v);
    clearTimeout(qTimer);
    qTimer = setTimeout(() => setParams({ q: v || undefined }, { replace: true }), 300);
  };
  const onFilter = (patch: Partial<Filters>) => {
    const next: Record<string, string | undefined> = {};
    if (patch.source !== undefined) next.source = patch.source || undefined;
    if (patch.pinned !== undefined) next.pinned = patch.pinned ? '1' : undefined;
    if (patch.sort !== undefined) next.sort = patch.sort === 'updated_at' ? undefined : patch.sort;
    if (patch.order !== undefined) next.order = patch.order === 'desc' ? undefined : patch.order;
    setParams(next, { replace: true });
  };

  const open = async (i: HistoryItem) => {
    try {
      const d = await api.getHistory(i.id);
      if (needsReplaceConfirm()) {
        const ok = await confirmAction({
          title: t('replace.title'),
          message: t('replace.message'),
          confirmLabel: t('replace.confirm'),
          danger: true,
        });
        if (!ok) return;
      }
      loadDocument(d.content, `history:${d.id}`);
      navigate('/');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const patchItem = (id: string, patch: Partial<HistoryItem>) =>
    setItems(items().map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const rename = async (i: HistoryItem, title: string) => {
    const old = i.title;
    patchItem(i.id, { title });
    try {
      await api.updateHistory(i.id, { title });
    } catch (e) {
      patchItem(i.id, { title: old });
      toast.error(errorMessage(e));
    }
  };
  const pin = async (i: HistoryItem) => {
    const next = !i.pinned;
    patchItem(i.id, { pinned: next });
    try {
      await api.updateHistory(i.id, { pinned: next });
      if (filters().pinned && !next) setItems(items().filter((x) => x.id !== i.id));
    } catch (e) {
      patchItem(i.id, { pinned: !next });
      toast.error(errorMessage(e));
    }
  };
  const share = async (i: HistoryItem) => {
    try {
      const d = await api.getHistory(i.id);
      setShareCtx({ content: d.content, title: d.title });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // optimistic delete with an undo toast that re-creates the entry
  const remove = async (i: HistoryItem) => {
    let detail: Awaited<ReturnType<typeof api.getHistory>> | null = null;
    try {
      detail = await api.getHistory(i.id);
    } catch {
      /* delete anyway; undo just won't be offered */
    }
    const idx = items().findIndex((x) => x.id === i.id);
    setItems(items().filter((x) => x.id !== i.id));
    setTotal((n) => Math.max(0, n - 1));
    try {
      await api.deleteHistory(i.id);
    } catch (e) {
      setItems((l) => [...l.slice(0, idx), i, ...l.slice(idx)]);
      setTotal((n) => n + 1);
      toast.error(errorMessage(e));
      return;
    }
    toast.info(t('history.deleted'), {
      action: detail
        ? {
            label: t('history.undo'),
            run: async () => {
              try {
                const d = detail as NonNullable<typeof detail>;
                const created = await api.saveHistory({
                  content: d.content,
                  source: d.source as 'manual',
                  title: d.title,
                  source_url: d.source_url ?? undefined,
                });
                if (d.pinned) await api.updateHistory(created.id, { pinned: true });
                void load(true);
              } catch (e) {
                toast.error(`${t('history.restore_failed')}: ${errorMessage(e)}`);
              }
            },
          }
        : undefined,
    });
  };

  const compareSelected = async () => {
    const ids = [...selected()];
    if (ids.length !== 2) return;
    try {
      const [a, b] = await Promise.all(ids.map((id) => api.getHistory(id)));
      loadCompare((a as NonNullable<typeof a>).content, (b as NonNullable<typeof b>).content);
      navigate('/compare');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const clearAll = async () => {
    const ok = await confirmAction({
      title: t('history.clear_all'),
      message: t('history.clear_confirm'),
      confirmLabel: t('history.clear_all'),
      danger: true,
      requireText: 'DELETE',
    });
    if (!ok) return;
    try {
      await api.clearHistory();
      setItems([]);
      setTotal(0);
      toast.success(t('history.cleared'));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div class="mx-auto flex h-full max-w-4xl flex-col">
      <div class="space-y-2 border-b border-border p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h1 class="text-xl font-semibold">{t('history.title')}</h1>
          <div class="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={selected().size !== 2}
              title={selected().size !== 2 ? t('history.select_two') : undefined}
              onClick={() => void compareSelected()}
            >
              <GitCompare size={14} /> {t('history.compare_selected')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={total() === 0 && !filtered()}
              onClick={() => void clearAll()}
            >
              <Trash size={14} /> {t('history.clear_all')}
            </Button>
          </div>
        </div>
        <HistoryFilters value={filters()} qInput={qInput()} onQInput={onQInput} onChange={onFilter} />
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        {error() && (
          <p class="m-3 rounded-md bg-danger-soft p-2 text-sm text-danger" role="alert">
            {error()}{' '}
            <Button size="sm" onClick={() => void load(true)}>
              {t('common.retry')}
            </Button>
          </p>
        )}
        <HistoryList
          items={items()}
          loading={loading()}
          hasMore={items().length < total()}
          filtered={filtered()}
          selected={selected()}
          onSelect={(id, v) =>
            setSelected((s) => {
              const n = new Set(s);
              if (v) n.add(id);
              else n.delete(id);
              return n;
            })
          }
          onLoadMore={() => void load(false)}
          actions={{
            onOpen: (i) => void open(i),
            onRename: (i, title) => void rename(i, title),
            onPin: (i) => void pin(i),
            onShare: (i) => void share(i),
            onDelete: (i) => void remove(i),
          }}
        />
      </div>
      <ShareDialog
        open={shareCtx() !== null}
        onOpenChange={(o) => !o && setShareCtx(null)}
        kind="single"
        content={shareCtx()?.content ?? ''}
        defaultTitle={shareCtx()?.title}
      />
    </div>
  );
}

export default function HistoryPage() {
  return (
    <AuthGuard what="history" returnTo="/history">
      <History />
    </AuthGuard>
  );
}
