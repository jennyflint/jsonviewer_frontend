import { A, useNavigate, useParams } from '@solidjs/router';
import { Copy, Download, ExternalLink, GitCompare, ListTree, Trash2, Type, CopyCheck } from 'lucide-solid';
import { Match, Show, Switch, createEffect, createMemo, createResource, createSignal, on } from 'solid-js';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Spinner';
import { TabList } from '../components/ui/Tabs';
import { SplitPane } from '../components/ui/SplitPane';
import { JsonEditor } from '../components/editor/JsonEditor';
import type { EditorApi } from '../components/editor/JsonEditor';
import { StatusBar } from '../components/editor/StatusBar';
import type { Cursor } from '../components/editor/StatusBar';
import { TreeView } from '../components/tree/TreeView';
import { PropertyPanel } from '../components/tree/PropertyPanel';
import { PathBar } from '../components/tree/PathBar';
import { TreeSearch, createTreeSearch } from '../components/tree/TreeSearch';
import { DuplicatesPanel } from '../components/duplicates/DuplicatesPanel';
import { CompareResultView } from '../components/compare/CompareResultView';
import { api } from '../lib/api/endpoints';
import type { ShareDetail } from '../lib/api/endpoints';
import { isApiError } from '../lib/api/client';
import {
  DocContext,
  createDocument,
  loadDocument as loadMain,
  needsReplaceConfirm,
} from '../stores/document';
import { loadCompare } from '../stores/compare';
import { deleteTokenFor, removeLocalShare } from '../stores/localShares';
import { confirmAction } from '../stores/confirm';
import { toast } from '../stores/toasts';
import { copyText } from '../lib/clipboard';
import { downloadText } from '../lib/files';
import { diffWorker, isStale } from '../lib/workers/clients';
import type { CompareResult } from '../lib/workers/diff.worker';
import { DEFAULT_DIFF_OPTIONS } from '../lib/json/diff';
import { locate } from '../lib/json/parser';
import { errorMessage, fmtDate, fmtNumber, t } from '../lib/i18n';
import { settings } from '../stores/settings';

function NotFound() {
  return (
    <div class="mx-auto max-w-md p-10 text-center" data-testid="share-not-found">
      <h1 class="text-2xl font-semibold">{t('shared.not_found_title')}</h1>
      <p class="mt-2 text-muted">{t('shared.not_found_text')}</p>
      <A href="/" class="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-accent-fg">
        {t('notfound.home')}
      </A>
    </div>
  );
}

function SingleView(props: { share: ShareDetail }) {
  // isolated document: never touches the user's own draft
  const store = createDocument({ initialText: props.share.content, persist: false });
  void store.parseNow();
  const [tab, setTab] = createSignal<'text' | 'viewer'>('text');
  const [dupOpen, setDupOpen] = createSignal(false);
  const [cursor, setCursor] = createSignal<Cursor>({ line: 1, column: 1, offset: 0 });
  const [search, setSearch] = createTreeSearch();
  let editor: EditorApi | undefined;

  const openInEditor = async () => {
    if (needsReplaceConfirm()) {
      const ok = await confirmAction({
        title: t('replace.title'),
        message: t('shared.replace_message'),
        confirmLabel: t('replace.confirm'),
        danger: true,
      });
      if (!ok) return;
    }
    loadMain(props.share.content, `share:${props.share.slug}`);
    navigate('/');
  };
  const navigate = useNavigate();

  return (
    <DocContext.Provider value={store}>
      <div class="flex h-full min-h-0 flex-col">
        <div
          role="toolbar"
          aria-label={t('toolbar.label')}
          class="flex flex-wrap items-center gap-1.5 border-b border-border bg-surface px-2 py-1.5"
        >
          <Button size="sm" variant="primary" onClick={() => void openInEditor()}>
            <ExternalLink size={14} /> {t('shared.open_in_editor')}
          </Button>
          <Button size="sm" onClick={() => downloadText('document.json', props.share.content)}>
            <Download size={14} /> {t('toolbar.download')}
          </Button>
          <Button
            size="sm"
            onClick={async () =>
              toast.success((await copyText(props.share.content)) ? t('copy.done') : t('copy.failed'))
            }
          >
            <Copy size={14} /> {t('toolbar.copy')}
          </Button>
          <Button
            size="sm"
            variant={dupOpen() ? 'primary' : 'secondary'}
            onClick={() => setDupOpen((o) => !o)}
          >
            <CopyCheck size={14} /> {t('toolbar.duplicates')}
          </Button>
        </div>
        <div class="min-h-0 flex-1">
          <SplitPaneMaybe
            open={dupOpen()}
            side={
              <DuplicatesPanel
                onClose={() => setDupOpen(false)}
                onNavigateOffset={(o) => tab() === 'text' && editor?.select(o, o + 1, true)}
              />
            }
          >
            <div class="flex h-full min-h-0 flex-col">
              <TabList
                label={t('tabs.label')}
                value={tab()}
                onChange={(v) => {
                  setTab(v as 'text' | 'viewer');
                  queueMicrotask(() => editor?.requestMeasure());
                }}
                tabs={[
                  { id: 'text', label: t('tabs.text'), icon: <Type size={14} /> },
                  { id: 'viewer', label: t('tabs.viewer'), icon: <ListTree size={14} /> },
                ]}
              />
              <div class="min-h-0 flex-1" classList={{ hidden: tab() !== 'text' }}>
                <JsonEditor
                  value={store.doc.text}
                  readOnly
                  error={store.doc.status === 'error' ? store.doc.error : null}
                  apiRef={(a) => (editor = a)}
                  onCursor={(offset) => {
                    const m = store.getModel();
                    const { line, column } = m
                      ? locate(m.lineStarts, offset)
                      : { line: 1, column: offset + 1 };
                    setCursor({ line, column, offset });
                  }}
                />
              </div>
              <div class="min-h-0 flex-1" classList={{ hidden: tab() !== 'viewer' }}>
                <div class="flex h-full min-h-0 flex-col">
                  <TreeSearch state={search} setState={setSearch} />
                  <PathBar />
                  <div class="min-h-0 flex-1">
                    <SplitPane
                      initial={58}
                      left={<TreeView search={search} active={tab() === 'viewer'} />}
                      right={<PropertyPanel />}
                    />
                  </div>
                </div>
              </div>
            </div>
          </SplitPaneMaybe>
        </div>
        <StatusBar cursor={cursor()} />
      </div>
    </DocContext.Provider>
  );
}

function SplitPaneMaybe(props: {
  open: boolean;
  side: import('solid-js').JSX.Element;
  children: import('solid-js').JSX.Element;
}) {
  return (
    <Show when={props.open} fallback={props.children}>
      <SplitPane initial={62} left={props.children} right={props.side} />
    </Show>
  );
}

function CompareView(props: { share: ShareDetail }) {
  const [result, setResult] = createSignal<CompareResult | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const navigate = useNavigate();
  createEffect(
    on(
      () => props.share.slug,
      async () => {
        try {
          setResult(
            await diffWorker.call((w) =>
              w.compare(
                props.share.content,
                props.share.content_right ?? '',
                {
                  ...DEFAULT_DIFF_OPTIONS,
                  indent: typeof settings.indent === 'number' ? settings.indent : 2,
                },
                true,
              ),
            ),
          );
        } catch (e) {
          if (!isStale(e)) setError(errorMessage(e));
        }
      },
    ),
  );
  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="flex items-center gap-2 border-b border-border bg-surface px-2 py-1.5">
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            loadCompare(props.share.content, props.share.content_right ?? '');
            navigate('/compare');
          }}
        >
          <GitCompare size={14} /> {t('shared.open_in_compare')}
        </Button>
      </div>
      <div class="min-h-0 flex-1">
        <Show when={error()}>
          <p class="p-4 text-danger" role="alert">
            {error()}
          </p>
        </Show>
        <Show
          when={result()}
          fallback={
            <div class="space-y-2 p-4">
              <Skeleton class="h-6 w-1/2" />
              <Skeleton class="h-48 w-full" />
            </div>
          }
        >
          {(r) => (
            <CompareResultView
              result={r()}
              left={props.share.content}
              right={props.share.content_right ?? ''}
              navKeys
            />
          )}
        </Show>
      </div>
    </div>
  );
}

export default function SharedPage() {
  const params = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [share, { refetch }] = createResource(
    () => params.slug,
    (slug) => api.getShare(slug),
  );
  const notFound = () => {
    const e = share.error;
    return isApiError(e) && (e.status === 404 || e.code === 'share_not_found' || e.code === 'not_found');
  };
  // reading a failed resource throws, so always go through `data()`
  const data = () => (share.error ? undefined : share());
  const token = createMemo(() => {
    const d = data();
    return d ? deleteTokenFor(d.slug) : undefined;
  });
  const canDelete = () => !!data() && (data()!.is_owner || !!token());

  const remove = async () => {
    const s = data();
    if (!s) return;
    if (
      !(await confirmAction({
        title: t('shared.delete'),
        message: t('shared.delete_confirm'),
        confirmLabel: t('common.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await api.deleteShare(s.slug, token());
      removeLocalShare(s.slug);
      toast.success(t('share.deleted'));
      navigate('/');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Switch>
      <Match when={share.loading}>
        <div class="space-y-3 p-6" aria-busy="true">
          <Skeleton class="h-7 w-1/3" />
          <Skeleton class="h-4 w-1/2" />
          <Skeleton class="h-72 w-full" />
        </div>
      </Match>
      <Match when={notFound()}>
        <NotFound />
      </Match>
      <Match when={share.error}>
        <div class="mx-auto max-w-md p-10 text-center">
          <p class="text-danger" role="alert">
            {errorMessage(share.error)}
          </p>
          <Button class="mt-3" onClick={() => void refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      </Match>
      <Match when={data()}>
        {(s) => (
          <div class="flex h-full min-h-0 flex-col">
            <header class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface-2 px-3 py-2">
              <h1 class="text-base font-semibold">{s().title || t('shared.untitled')}</h1>
              <span class="rounded bg-surface px-2 py-0.5 text-xs text-muted">{t('shared.read_only')}</span>
              <span class="text-xs text-muted">{t('shared.created', { date: fmtDate(s().created_at) })}</span>
              <span class="text-xs text-muted">
                {s().expires_at
                  ? t('share.expires_on', { date: fmtDate(s().expires_at) })
                  : t('share.never_expires')}
              </span>
              <span class="text-xs text-muted">{t('shared.views', { n: fmtNumber(s().view_count) })}</span>
              <Show when={canDelete()}>
                <Button size="sm" variant="danger" class="ml-auto" onClick={() => void remove()}>
                  <Trash2 size={14} /> {t('shared.delete')}
                </Button>
              </Show>
            </header>
            <div class="min-h-0 flex-1">
              <Show when={s().kind === 'compare'} fallback={<SingleView share={s()} />}>
                <CompareView share={s()} />
              </Show>
            </div>
          </div>
        )}
      </Match>
    </Switch>
  );
}
