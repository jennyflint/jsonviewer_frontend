import { useSearchParams } from '@solidjs/router';
import {
  ChevronsDownUp,
  Palette,
  IndentIncrease,
  ChevronsUpDown,
  ClipboardPaste,
  Copy,
  Download,
  Eraser,
  FileUp,
  Link2,
  ListTree,
  Minimize2,
  Save,
  Share2,
  SortAsc,
  Type,
  Wand2,
  CopyCheck,
} from 'lucide-solid';
import { Show, createMemo, createSignal, onMount } from 'solid-js';
import { JsonEditor } from '../components/editor/JsonEditor';
import type { EditorApi, Mark } from '../components/editor/JsonEditor';
import { EditorToolbar } from '../components/editor/EditorToolbar';
import type { ToolbarAction } from '../components/editor/EditorToolbar';
import { StatusBar } from '../components/editor/StatusBar';
import type { Cursor } from '../components/editor/StatusBar';
import { TabList } from '../components/ui/Tabs';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { SplitPane } from '../components/ui/SplitPane';
import { TreeView, collapseAll, expandAll, expandToLevel } from '../components/tree/TreeView';
import { PropertyPanel } from '../components/tree/PropertyPanel';
import { PathBar } from '../components/tree/PathBar';
import { TreeSearch, createTreeSearch } from '../components/tree/TreeSearch';
import { DuplicatesPanel, dupKeyGroupCount } from '../components/duplicates/DuplicatesPanel';
import { LoadUrlDialog } from '../components/dialogs/LoadUrlDialog';
import { ShareDialog } from '../components/dialogs/ShareDialog';
import {
  clearDocument,
  mainDocument,
  doc,
  getDupNodes,
  getModel,
  loadDocument,
  markSaved,
  navRequest,
  needsReplaceConfirm,
  selectNode,
  setText,
  transform,
} from '../stores/document';
import { settings, updateSettings } from '../stores/settings';
import { auth } from '../stores/auth';
import { confirmAction } from '../stores/confirm';
import { autosaveToHistory } from '../stores/historySync';
import { fetchAndLoad, validateHttpUrl } from '../stores/loadUrl';
import { toast } from '../stores/toasts';
import { api } from '../lib/api/endpoints';
import { copyText, readText } from '../lib/clipboard';
import { downloadText } from '../lib/files';
import { locate } from '../lib/json/parser';
import { memberKeysInRange, nodeAtOffset, typeName } from '../lib/json/access';
import { useShortcuts } from '../lib/shortcuts';
import { errorMessage, t } from '../lib/i18n';
import type { Indent } from '../lib/json/format';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export default function ViewerPage() {
  const [tab, setTab] = createSignal<'text' | 'viewer'>('text');
  const [dupOpen, setDupOpen] = createSignal(false);
  const [urlOpen, setUrlOpen] = createSignal(false);
  const [shareOpen, setShareOpen] = createSignal(false);
  const [cursor, setCursor] = createSignal<Cursor>({ line: 1, column: 1, offset: 0 });
  const [search, setSearch] = createTreeSearch();
  let editor: EditorApi | undefined;
  let searchInput: HTMLInputElement | undefined;
  let fileInput!: HTMLInputElement;
  const [params, setParams] = useSearchParams();

  const authed = () => auth.status === 'authenticated';
  const hasText = () => doc.text.trim() !== '';

  const goToNode = (id: number) => {
    const m = getModel();
    if (!m || !editor || id < 0 || id >= m.count) return;
    const ks = m.keyStart[id] as number;
    editor.select(ks >= 0 ? ks : (m.start[id] as number), m.end[id] as number, true);
  };

  const switchTab = (next: 'text' | 'viewer') => {
    setTab(next);
    queueMicrotask(() => {
      if (next === 'text') {
        editor?.requestMeasure();
        if (doc.selectedNodeId >= 0 && navRequest()?.source === 'tree') goToNode(doc.selectedNodeId);
      }
    });
  };

  // selection requests from panels (duplicates / path bar) while the text tab is visible
  let lastTick = 0;
  createMemo(() => {
    const r = navRequest();
    if (!r || r.tick === lastTick) return;
    lastTick = r.tick;
    if (tab() === 'text' && r.source === 'panel') queueMicrotask(() => goToNode(r.id));
  });

  const confirmReplace = async () =>
    !needsReplaceConfirm() ||
    (await confirmAction({
      title: t('replace.title'),
      message: t('replace.message'),
      confirmLabel: t('replace.confirm'),
      danger: true,
    }));

  const onTransform = async (kind: 'format' | 'minify' | 'sort') => {
    if (doc.status === 'error' && doc.error) {
      toast.error(t('toolbar.cannot_format'), {
        detail: `${doc.error.message} (${t('status.line_col', { line: doc.error.line, col: doc.error.column })})`,
      });
      editor?.select(doc.error.offset, doc.error.offset + 1, false);
      return;
    }
    const r = await transform(kind);
    if (!r.ok) {
      toast.error(t('toolbar.cannot_format'), {
        detail: `${r.error.message} (${t('status.line_col', { line: r.error.line, col: r.error.column })})`,
      });
      return;
    }
    if (kind === 'format') void autosaveToHistory(doc.text, 'format');
  };

  const paste = async () => {
    const text = await readText();
    if (text === null) {
      toast.info(t('toolbar.paste_denied'));
      editor?.focus();
      return;
    }
    if (!(await confirmReplace())) return;
    setText(text, { fromUser: true, immediate: true });
  };

  const copy = async () => toast.success((await copyText(doc.text)) ? t('copy.done') : t('copy.failed'));

  const clear = async () => {
    if (doc.text.length > 1024) {
      const ok = await confirmAction({
        title: t('toolbar.clear'),
        message: t('toolbar.clear_confirm'),
        confirmLabel: t('toolbar.clear'),
        danger: true,
      });
      if (!ok) return;
    }
    clearDocument();
  };

  const loadFile = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(t('upload.too_large'));
      return;
    }
    if (!(await confirmReplace())) return;
    loadDocument(await file.text(), 'draft');
  };

  const saveHistory = async () => {
    if (!authed() || !hasText()) return;
    try {
      const r = await api.saveHistory({ content: doc.text, source: 'manual' });
      markSaved();
      toast.success(r.deduplicated ? t('history.already_saved') : t('history.saved'));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  /** Key ranges in the viewport, tagged with the type of their value (only while the model matches the text). */
  const keyMarks = (from: number, to: number, len: number): Mark[] => {
    const m = getModel();
    if (!m || doc.status !== 'ok' || m.text.length !== len) return [];
    return memberKeysInRange(m, from, to).map((k) => ({
      from: k.from,
      to: k.to,
      cls: `cm-k-${typeName(m, k.id)}`,
    }));
  };

  const dupCount = createMemo(() => dupKeyGroupCount(getDupNodes(), getModel));

  const marks = createMemo<Mark[]>(() => {
    const m = getModel();
    if (!dupOpen() || !m) return [];
    const out: Mark[] = [];
    for (const id of getDupNodes())
      out.push({ from: m.keyStart[id] as number, to: m.keyEnd[id] as number, cls: 'cm-dup-key' });
    return out;
  });

  const actions = (): ToolbarAction[] => [
    {
      id: 'clear',
      label: t('toolbar.clear'),
      icon: <Eraser size={14} />,
      onClick: () => void clear(),
      disabled: !hasText(),
      primary: true,
    },
    {
      id: 'paste',
      label: t('toolbar.paste'),
      icon: <ClipboardPaste size={14} />,
      onClick: () => void paste(),
      primary: true,
    },
    {
      id: 'copy',
      label: t('toolbar.copy'),
      icon: <Copy size={14} />,
      onClick: () => void copy(),
      disabled: !hasText(),
      primary: true,
    },
    {
      id: 'format',
      label: t('toolbar.format'),
      icon: <Wand2 size={14} />,
      onClick: () => void onTransform('format'),
      disabled: !hasText(),
      primary: true,
      title: t('toolbar.format') + ' (Ctrl+Shift+F)',
    },
    {
      id: 'minify',
      label: t('toolbar.minify'),
      icon: <Minimize2 size={14} />,
      onClick: () => void onTransform('minify'),
      disabled: !hasText(),
      title: t('toolbar.minify') + ' (Ctrl+Shift+M)',
    },
    {
      id: 'sort',
      label: t('toolbar.sort'),
      icon: <SortAsc size={14} />,
      onClick: () => void onTransform('sort'),
      disabled: !hasText(),
    },
    {
      id: 'url',
      label: t('toolbar.load_url'),
      icon: <Link2 size={14} />,
      onClick: () => setUrlOpen(true),
      title: t('toolbar.load_url') + ' (Ctrl+O)',
    },
    {
      id: 'upload',
      label: t('toolbar.upload'),
      icon: <FileUp size={14} />,
      onClick: () => fileInput.click(),
    },
    {
      id: 'download',
      label: t('toolbar.download'),
      icon: <Download size={14} />,
      onClick: () => downloadText('document.json', doc.text),
      disabled: !hasText(),
    },
    {
      id: 'share',
      label: t('toolbar.share'),
      icon: <Share2 size={14} />,
      onClick: () => setShareOpen(true),
      disabled: !hasText(),
      primary: true,
      title: t('toolbar.share') + ' (Ctrl+Shift+S)',
    },
    {
      id: 'history',
      label: t('toolbar.save_history'),
      icon: <Save size={14} />,
      onClick: () => void saveHistory(),
      hidden: !authed(),
      disabled: !hasText(),
      title: t('toolbar.save_history') + ' (Ctrl+S)',
    },
    {
      id: 'foldall',
      label: t('editor.fold_all'),
      icon: <ChevronsDownUp size={14} />,
      onClick: () => editor?.foldAll(),
      hidden: tab() !== 'text',
      disabled: !hasText(),
    },
    {
      id: 'unfoldall',
      label: t('editor.unfold_all'),
      icon: <ChevronsUpDown size={14} />,
      onClick: () => editor?.unfoldAll(),
      hidden: tab() !== 'text',
      disabled: !hasText(),
    },
    {
      id: 'guides',
      label: t('editor.indent_guides'),
      icon: <IndentIncrease size={14} />,
      onClick: () => updateSettings({ indentGuides: !settings.indentGuides }),
      active: settings.indentGuides,
      hidden: tab() !== 'text',
    },
    {
      id: 'highlight',
      label: t('tree.highlight'),
      icon: <Palette size={14} />,
      onClick: () => updateSettings({ treeHighlight: !settings.treeHighlight }),
      active: settings.treeHighlight,
    },
    {
      id: 'dups',
      label: t('toolbar.duplicates'),
      icon: <CopyCheck size={14} />,
      onClick: () => setDupOpen((o) => !o),
      active: dupOpen(),
      disabled: !hasText(),
      badge:
        dupCount() > 0 ? (
          <span
            class="ml-0.5 rounded-full bg-danger px-1.5 text-[10px] font-bold text-accent-fg"
            aria-label={t('dup.keys_badge', { n: dupCount() })}
          >
            {dupCount()}
          </span>
        ) : undefined,
    },
  ];

  useShortcuts([
    { key: 'f', mod: true, shift: true, handler: () => void onTransform('format') },
    { key: 'm', mod: true, shift: true, handler: () => void onTransform('minify') },
    { key: '1', mod: true, handler: () => switchTab('text') },
    { key: '2', mod: true, handler: () => switchTab('viewer') },
    { key: 'f', mod: true, when: () => tab() === 'viewer', handler: () => searchInput?.focus() },
    { key: 's', mod: true, shift: true, handler: () => hasText() && setShareOpen(true) },
    { key: 's', mod: true, handler: () => void saveHistory() },
    { key: 'o', mod: true, handler: () => setUrlOpen(true) },
  ]);

  // ?url= deep link: always ask first, never fetch silently
  onMount(() => {
    const raw = params.url;
    const url = Array.isArray(raw) ? raw[0] : raw;
    if (!url) return;
    setParams({ url: undefined }, { replace: true });
    const parsed = validateHttpUrl(url);
    if (!parsed) {
      toast.error(t('url.invalid'));
      return;
    }
    void (async () => {
      const ok = await confirmAction({
        title: t('url.deeplink_title'),
        message: t('url.deeplink_message', { url: parsed.href }),
        confirmLabel: t('url.load'),
      });
      if (!ok) return;
      try {
        await fetchAndLoad(parsed.href);
      } catch (e) {
        toast.error(errorMessage(e));
      }
    })();
  });

  const editorPane = () => (
    <div
      class="flex h-full min-h-0 flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const f = e.dataTransfer?.files?.[0];
        if (f) {
          e.preventDefault();
          void loadFile(f);
        }
      }}
    >
      <div class="min-h-0 flex-1">
        <JsonEditor
          highlight={settings.treeHighlight}
          indentGuides={settings.indentGuides}
          keyRevision={getModel()}
          keyMarks={keyMarks}
          value={doc.text}
          error={doc.status === 'error' ? doc.error : null}
          marks={marks()}
          onChange={(text) => setText(text, { fromUser: true })}
          apiRef={(a) => (editor = a)}
          onCursor={(offset) => {
            const m = getModel();
            const pos = m
              ? locate(m.lineStarts, offset)
              : (() => {
                  const before = doc.text.slice(0, offset);
                  return { line: before.split('\n').length, column: offset - before.lastIndexOf('\n') };
                })();
            const { line, column } = pos;
            setCursor({ line, column, offset });
            if (m && doc.status === 'ok') {
              const id = nodeAtOffset(m, offset);
              if (id >= 0 && id !== doc.selectedNodeId) selectNode(id, { reveal: false, source: 'editor' });
            }
          }}
        />
      </div>
    </div>
  );

  const viewerPane = () => (
    <div class="flex h-full min-h-0 flex-col">
      <TreeSearch state={search} setState={setSearch} inputRef={(el) => (searchInput = el)} />
      <div class="flex flex-wrap items-center gap-1.5 border-b border-border bg-surface px-2 py-1">
        <Button size="sm" onClick={() => void expandAll(mainDocument)}>
          <ChevronsUpDown size={14} /> {t('tree.expand_all')}
        </Button>
        <Button size="sm" onClick={() => collapseAll(mainDocument)}>
          <ChevronsDownUp size={14} /> {t('tree.collapse_all')}
        </Button>
        <Select
          label={t('tree.expand_level')}
          class="!h-7 text-xs"
          value={0}
          options={[
            { value: 0, label: t('tree.expand_level') },
            ...[1, 2, 3, 4, 5].map((n) => ({ value: n, label: t('tree.level_n', { n }) })),
          ]}
          onChange={(n) => n > 0 && expandToLevel(mainDocument, n)}
        />
      </div>
      <PathBar />
      <div class="min-h-0 flex-1" classList={{ 'tree-plain': !settings.treeHighlight }}>
        <SplitPane
          initial={58}
          left={<TreeView search={search} active={tab() === 'viewer'} />}
          right={<PropertyPanel />}
        />
      </div>
    </div>
  );

  const main = () => (
    <div class="flex h-full min-h-0 flex-col">
      <TabList
        label={t('tabs.label')}
        value={tab()}
        onChange={(v) => switchTab(v as 'text' | 'viewer')}
        tabs={[
          { id: 'text', label: t('tabs.text'), icon: <Type size={14} /> },
          { id: 'viewer', label: t('tabs.viewer'), icon: <ListTree size={14} /> },
        ]}
      />
      <div class="min-h-0 flex-1" classList={{ hidden: tab() !== 'text' }}>
        {editorPane()}
      </div>
      <div class="min-h-0 flex-1" classList={{ hidden: tab() !== 'viewer' }}>
        {viewerPane()}
      </div>
    </div>
  );

  return (
    <div class="flex h-full min-h-0 flex-col">
      <EditorToolbar
        actions={actions()}
        extra={
          <Select
            label={t('toolbar.indent')}
            class="!h-7 text-xs"
            value={String(settings.indent)}
            options={[
              { value: '2', label: t('toolbar.indent_2') },
              { value: '4', label: t('toolbar.indent_4') },
              { value: '\t', label: t('toolbar.indent_tab') },
            ]}
            onChange={(v) => updateSettings({ indent: (v === '\t' ? '\t' : Number(v)) as Indent })}
          />
        }
      />
      <div class="min-h-0 flex-1">
        <Show when={dupOpen()} fallback={main()}>
          <SplitPane
            initial={62}
            left={main()}
            right={
              <DuplicatesPanel
                onClose={() => setDupOpen(false)}
                onNavigateOffset={(o) => tab() === 'text' && editor?.select(o, o + 1, true)}
              />
            }
          />
        </Show>
      </div>
      <StatusBar
        cursor={cursor()}
        onGoToError={(o) => {
          switchTab('text');
          editor?.select(o, o + 1, false);
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".json,.txt,application/json,text/plain"
        class="hidden"
        aria-label={t('toolbar.upload')}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (f) void loadFile(f);
        }}
      />
      <LoadUrlDialog open={urlOpen()} onOpenChange={setUrlOpen} />
      <ShareDialog open={shareOpen()} onOpenChange={setShareOpen} kind="single" content={doc.text} />
    </div>
  );
}
