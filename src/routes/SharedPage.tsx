import { A, useNavigate, useParams, useSearchParams } from '@solidjs/router';
import {
  Copy,
  Download,
  ExternalLink,
  GitCompare,
  ListTree,
  Trash2,
  Type,
  CopyCheck,
  Link2,
  MessageSquare,
  Lock,
  Flame,
} from '../lib/icons';
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
import type { ShareDetail, ShareMeta } from '../lib/api/endpoints';
import { CommentsPanel } from '../components/dialogs/CommentsPanel';
import { buildPath } from '../lib/json/path';
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

function SingleView(props: {
  share: ShareDetail;
  password?: string;
  canModerate: boolean;
  deleteToken?: string;
}) {
  // isolated document: never touches the user's own draft
  const store = createDocument({ initialText: props.share.content, persist: false });
  // a link to a node (?path=$.users[3]): select it once the document is parsed
  void store.parseNow().then(() => {
    const raw = params.path;
    const p = Array.isArray(raw) ? raw[0] : raw;
    if (p && store.selectPath(p)) setTab('viewer');
  });
  const selectedPath = () => {
    const m = store.getModel();
    return m && store.doc.selectedNodeId >= 0 ? buildPath(m, store.doc.selectedNodeId) : undefined;
  };
  const copyNodeLink = async () => {
    const p = selectedPath();
    if (!p) return;
    const url = `${location.origin}/s/${props.share.slug}?path=${encodeURIComponent(p)}`;
    toast.success((await copyText(url)) ? t('shared.node_link_copied') : t('copy.failed'));
  };
  const [tab, setTab] = createSignal<'text' | 'viewer'>('text');
  const [side, setSide] = createSignal<'dups' | 'comments' | null>(null);
  const dupOpen = () => side() === 'dups';
  const [params] = useSearchParams();
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
            onClick={() => setSide((s) => (s === 'dups' ? null : 'dups'))}
          >
            <CopyCheck size={14} /> {t('toolbar.duplicates')}
          </Button>
          <Button
            size="sm"
            disabled={!selectedPath()}
            onClick={() => void copyNodeLink()}
            title={t('shared.copy_node_link')}
          >
            <Link2 size={14} /> {t('share.link_node')}
          </Button>
          <Show when={props.share.comments_enabled}>
            <Button
              size="sm"
              variant={side() === 'comments' ? 'primary' : 'secondary'}
              onClick={() => setSide((s) => (s === 'comments' ? null : 'comments'))}
            >
              <MessageSquare size={14} /> {t('comments.title')}
            </Button>
          </Show>
        </div>
        <div class="min-h-0 flex-1">
          <SplitPaneMaybe
            open={side() !== null}
            side={
              <Show
                when={side() === 'dups'}
                fallback={
                  <CommentsPanel
                    slug={props.share.slug}
                    password={props.password}
                    canModerate={props.canModerate}
                    deleteToken={props.deleteToken}
                    selectedPath={selectedPath()}
                    onJump={(p) => {
                      if (store.selectPath(p)) setTab('viewer');
                    }}
                    onClose={() => setSide(null)}
                  />
                }
              >
                <DuplicatesPanel
                  onClose={() => setSide(null)}
                  onNavigateOffset={(o) => tab() === 'text' && editor?.select(o, o + 1, true)}
                />
              </Show>
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

function CompareView(props: {
  share: ShareDetail;
  password?: string;
  canModerate: boolean;
  deleteToken?: string;
}) {
  const [commentsOpen, setCommentsOpen] = createSignal(false);
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
        <Show when={props.share.comments_enabled}>
          <Button
            size="sm"
            variant={commentsOpen() ? 'primary' : 'secondary'}
            onClick={() => setCommentsOpen((o) => !o)}
          >
            <MessageSquare size={14} /> {t('comments.title')}
          </Button>
        </Show>
      </div>
      <div class="min-h-0 flex-1">
        <SplitPaneMaybe
          open={commentsOpen()}
          side={
            <CommentsPanel
              slug={props.share.slug}
              password={props.password}
              canModerate={props.canModerate}
              deleteToken={props.deleteToken}
              onClose={() => setCommentsOpen(false)}
            />
          }
        >
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
        </SplitPaneMaybe>
      </div>
    </div>
  );
}

/** Password prompt and/or one-time-link confirmation shown before a locked share is opened. */
function LockedGate(props: { meta: ShareMeta; onOpen: (d: ShareDetail, password?: string) => void }) {
  const [pw, setPw] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const open = async (e?: Event) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const password = props.meta.password_protected ? pw() : undefined;
      props.onOpen(await api.openShare(props.meta.slug, password), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      class="mx-auto mt-10 max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm"
      data-testid="share-gate"
    >
      <h1 class="flex items-center gap-2 text-lg font-semibold">
        {props.meta.password_protected ? <Lock size={18} /> : <Flame size={18} class="text-danger" />}
        {props.meta.password_protected ? t('shared.locked_title') : t('shared.burn_title')}
      </h1>
      <Show when={props.meta.title}>
        <p class="mt-1 text-sm text-muted">{props.meta.title}</p>
      </Show>
      <form class="mt-4 space-y-3" onSubmit={open}>
        <Show when={props.meta.password_protected}>
          <label class="block text-sm">
            {t('shared.password_label')}
            <input
              type="password"
              autofocus
              autocomplete="off"
              aria-label={t('shared.password_label')}
              class="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2"
              value={pw()}
              onInput={(e) => setPw(e.currentTarget.value)}
            />
          </label>
        </Show>
        <Show when={props.meta.burn_after_read}>
          <p class="rounded-md bg-warn-soft p-2 text-sm text-warn">{t('shared.burn_text')}</p>
        </Show>
        <Show when={error()}>
          <p class="rounded-md bg-danger-soft p-2 text-sm text-danger" role="alert">
            {error()}
          </p>
        </Show>
        <Button
          type="submit"
          variant={props.meta.burn_after_read ? 'danger' : 'primary'}
          disabled={busy() || (props.meta.password_protected && !pw())}
        >
          {props.meta.burn_after_read ? t('shared.burn_open') : t('shared.open')}
        </Button>
      </form>
    </div>
  );
}

export default function SharedPage() {
  const params = useParams<{ slug: string }>();
  const navigate = useNavigate();
  type Loaded = { share: ShareDetail } | { locked: ShareMeta };
  const [loaded, { refetch }] = createResource<Loaded, string>(
    () => params.slug,
    async (slug) => {
      // describing a share never consumes it, so link previews cannot burn a one-time link
      const meta = await api.shareMeta(slug);
      if (meta.password_protected || meta.burn_after_read) return { locked: meta };
      return { share: await api.getShare(slug) };
    },
  );
  const [opened, setOpened] = createSignal<{ share: ShareDetail; password?: string } | null>(null);
  createEffect(
    on(
      () => params.slug,
      () => setOpened(null),
    ),
  );
  const share = loaded; // resource state (loading / error)
  const notFound = () => {
    const e = loaded.error;
    return isApiError(e) && (e.status === 404 || e.code === 'share_not_found' || e.code === 'not_found');
  };
  // reading a failed resource throws, so always go through these accessors
  const result = () => (loaded.error ? undefined : loaded());
  const data = (): ShareDetail | undefined => {
    const o = opened();
    if (o) return o.share;
    const r = result();
    return r && 'share' in r ? r.share : undefined;
  };
  const lockedMeta = () => {
    const r = result();
    return !opened() && r && 'locked' in r ? r.locked : undefined;
  };
  const password = () => opened()?.password;
  const token = createMemo(() => {
    const d = data();
    return d ? deleteTokenFor(d.slug) : undefined;
  });
  const canDelete = () => !!data() && !data()!.burn_after_read && (data()!.is_owner || !!token());

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
      <Match when={loaded.error}>
        <div class="mx-auto max-w-md p-10 text-center">
          <p class="text-danger" role="alert">
            {errorMessage(loaded.error)}
          </p>
          <Button class="mt-3" onClick={() => void refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      </Match>
      <Match when={lockedMeta()}>
        {(meta) => <LockedGate meta={meta()} onOpen={(d, pw) => setOpened({ share: d, password: pw })} />}
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
              <Show when={s().password_protected}>
                <span class="inline-flex items-center gap-1 rounded bg-surface px-2 py-0.5 text-xs text-muted">
                  <Lock size={11} /> {t('share.protected')}
                </span>
              </Show>
              <Show when={s().burn_after_read}>
                <span class="inline-flex items-center gap-1 rounded bg-warn-soft px-2 py-0.5 text-xs text-warn">
                  <Flame size={11} /> {t('share.burn_badge')}
                </span>
              </Show>
              <Show when={canDelete()}>
                <Button size="sm" variant="danger" class="ml-auto" onClick={() => void remove()}>
                  <Trash2 size={14} /> {t('shared.delete')}
                </Button>
              </Show>
            </header>
            <div class="min-h-0 flex-1">
              <Show when={s().burn_after_read}>
                <p
                  class="border-b border-border bg-warn-soft px-3 py-1.5 text-sm text-warn"
                  role="status"
                  data-testid="burn-banner"
                >
                  {t('shared.burned')}
                </p>
              </Show>
              <Show
                when={s().kind === 'compare'}
                fallback={
                  <SingleView
                    share={s()}
                    password={password()}
                    canModerate={s().is_owner || !!token()}
                    deleteToken={token()}
                  />
                }
              >
                <CompareView
                  share={s()}
                  password={password()}
                  canModerate={s().is_owner || !!token()}
                  deleteToken={token()}
                />
              </Show>
            </div>
          </div>
        )}
      </Match>
    </Switch>
  );
}
