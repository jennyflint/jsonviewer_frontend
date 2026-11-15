import { batch, createContext, createSignal, useContext } from 'solid-js';
import { createStore } from 'solid-js/store';
import { MAX_DRAFT_CHARS, loadDraft, removeDraft, saveDraft } from '../lib/draft';
import { jsonWorker, isStale } from '../lib/workers/clients';
import type { ParseStats } from '../lib/workers/json.worker';
import type { JsonModel, ParseError } from '../lib/json/parser';
import type { Indent } from '../lib/json/format';
import { settings } from './settings';
import { buildPath, resolvePath } from '../lib/json/path';
import { VisibleRows } from '../lib/json/tree-model';

export type ParseStatus = 'idle' | 'parsing' | 'ok' | 'error';
export type DocSource = 'draft' | `history:${string}` | `share:${string}` | 'url';

export interface DocState {
  text: string;
  status: ParseStatus;
  error: ParseError | null;
  stats: ParseStats | null;
  selectedNodeId: number;
  dirty: boolean;
  source: DocSource;
  /** Text changed but auto-parse is off (large document): user must refresh the tree. */
  stale: boolean;
  draftSkipped: boolean;
}

export const PARSE_DEBOUNCE_MS = 300;

export function createDocument(opts: { initialText?: string; persist?: boolean } = {}) {
  const [doc, setDoc] = createStore<DocState>({
    text: opts.initialText ?? '',
    status: 'idle',
    error: null,
    stats: null,
    selectedNodeId: -1,
    dirty: false,
    source: 'draft',
    stale: false,
    draftSkipped: false,
  });

  // Large typed arrays live outside the reactive store; a version signal tells readers to refresh.
  let model: JsonModel | null = null;
  let rows: VisibleRows | null = null;
  let dupNodes: Set<number> = new Set();
  const [modelVersion, bumpModel] = createSignal(0);
  const [rowsVersion, bumpRows] = createSignal(0);

  const getModel = (): JsonModel | null => (modelVersion(), model);
  /** Object members whose key occurs more than once in their object. */
  const getDupNodes = (): Set<number> => (modelVersion(), dupNodes);
  const getRows = (): VisibleRows | null => (rowsVersion(), rows);
  const touchRows = (): void => {
    bumpRows((v) => v + 1);
  };

  /** One-shot requests for the editor / tree to move to a node. */
  const [navRequest, setNavRequest] = createSignal<{
    id: number;
    tick: number;
    source: 'tree' | 'editor' | 'panel';
  } | null>(null);
  let navTick = 0;

  function selectNode(
    id: number,
    opts: { reveal?: boolean; source?: 'tree' | 'editor' | 'panel' } = {},
  ): void {
    const m = model;
    if (!m || id < 0 || id >= m.count) return;
    if (opts.reveal !== false && rows?.reveal(id)) touchRows();
    setDoc('selectedNodeId', id);
    if (opts.source !== 'editor') setNavRequest({ id, tick: ++navTick, source: opts.source ?? 'panel' });
  }

  function selectPath(path: string): boolean {
    if (!model) return false;
    const id = resolvePath(model, path);
    if (id < 0) return false;
    selectNode(id, { source: 'panel' });
    return true;
  }

  function expandedPaths(limit = 2000): string[] {
    if (!model || !rows) return [];
    const out: string[] = [];
    for (const id of rows.expanded) {
      out.push(buildPath(model, id));
      if (out.length >= limit) break;
    }
    return out;
  }

  function installModel(next: JsonModel, keepExpanded: string[]): void {
    model = next;
    rows = new VisibleRows(next);
    if (keepExpanded.length) {
      for (const p of keepExpanded) {
        const id = resolvePath(next, p);
        if (id >= 0) rows.expanded.add(id);
      }
      rows.expanded.add(0);
      rows.rebuild();
    } else if (next.count > 0) rows.expand(0);
    bumpModel((v) => v + 1);
    bumpRows((v) => v + 1);
  }

  let parseTimer: ReturnType<typeof setTimeout> | undefined;
  let draftTimer: ReturnType<typeof setTimeout> | undefined;

  async function parseNow(): Promise<void> {
    clearTimeout(parseTimer);
    const text = doc.text;
    if (text.trim() === '') {
      model = null;
      rows = null;
      dupNodes = new Set();
      batch(() => {
        setDoc({ status: 'idle', error: null, stats: null, stale: false, selectedNodeId: -1 });
        bumpModel((v) => v + 1);
        bumpRows((v) => v + 1);
      });
      return;
    }
    setDoc({ status: 'parsing', stale: false });
    const keep = expandedPaths();
    try {
      const res = await jsonWorker.call((w) => w.parse(text));
      if (res.ok) {
        batch(() => {
          dupNodes = new Set(res.dupNodes);
          installModel(res.model, keep);
          const sel = doc.selectedNodeId;
          setDoc({
            status: 'ok',
            error: null,
            stats: res.stats,
            selectedNodeId: sel >= 0 && sel < res.model.count ? sel : -1,
          });
        });
      } else {
        batch(() => {
          model = null;
          rows = null;
          dupNodes = new Set();
          bumpModel((v) => v + 1);
          bumpRows((v) => v + 1);
          setDoc({ status: 'error', error: res.error, stats: res.stats, selectedNodeId: -1 });
        });
      }
    } catch (e) {
      if (!isStale(e))
        setDoc({ status: 'error', error: { message: String(e), line: 1, column: 1, offset: 0 } });
    }
  }

  function scheduleParse(): void {
    clearTimeout(parseTimer);
    if (doc.text.length > settings.autoParseThreshold) {
      setDoc({ stale: true });
      return;
    }
    parseTimer = setTimeout(() => void parseNow(), PARSE_DEBOUNCE_MS);
  }

  function saveDraftNow(): void {
    clearTimeout(draftTimer);
    if (!opts.persist) return;
    if (!settings.autosaveDraft) return;
    if (doc.text.length > MAX_DRAFT_CHARS) {
      setDoc('draftSkipped', true);
      void removeDraft();
      return;
    }
    setDoc('draftSkipped', false);
    if (doc.text === '') void removeDraft();
    else void saveDraft(doc.text).then((ok) => ok || setDoc('draftSkipped', true));
  }

  function scheduleDraft(): void {
    if (!opts.persist) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraftNow, 1000);
  }

  /** Replace the text. `fromUser` edits mark the document dirty; loads reset it. */
  function setText(
    text: string,
    opts: { fromUser?: boolean; source?: DocSource; immediate?: boolean } = {},
  ): void {
    batch(() => {
      setDoc('text', text);
      if (opts.fromUser) setDoc('dirty', true);
      else setDoc('dirty', false);
      if (opts.source) setDoc('source', opts.source);
    });
    if (opts.immediate)
      void parseNow(); // explicit loads (paste, upload, URL, format) always parse
    else scheduleParse();
    scheduleDraft();
  }

  function loadDocument(text: string, source: DocSource): void {
    setDoc('selectedNodeId', -1);
    setText(text, { source, immediate: true });
  }

  const needsReplaceConfirm = (): boolean => doc.dirty && doc.text.trim().length > 0;

  function clearDocument(): void {
    setDoc('selectedNodeId', -1);
    setText('', { source: 'draft', immediate: true });
  }

  function markSaved(): void {
    setDoc('dirty', false);
  }

  type TransformResult = { ok: true } | { ok: false; error: ParseError };

  async function transform(
    kind: 'format' | 'minify' | 'sort',
    indent: Indent = settings.indent,
  ): Promise<TransformResult> {
    const text = doc.text;
    const r = await jsonWorker.once((w) =>
      kind === 'format'
        ? w.format(text, indent)
        : kind === 'minify'
          ? w.minify(text)
          : w.sortKeys(text, indent),
    );
    if (!r.ok) return { ok: false, error: r.error };
    setText(r.text, { fromUser: true, immediate: true });
    return { ok: true };
  }

  if (opts.persist && settings.autosaveDraft) {
    // drafts larger than localStorage allows live in IndexedDB: restore asynchronously unless the user already typed
    void loadDraft().then((saved) => {
      if (saved && doc.text === '' && !doc.dirty) setText(saved, { immediate: true });
    });
  }

  return {
    doc,
    setDoc,
    getModel,
    getDupNodes,
    getRows,
    touchRows,
    navRequest,
    setNavRequest,
    selectNode,
    selectPath,
    expandedPaths,
    parseNow,
    saveDraftNow,
    setText,
    loadDocument,
    needsReplaceConfirm,
    clearDocument,
    markSaved,
    transform,
  };
}

export type DocumentStore = ReturnType<typeof createDocument>;

/** The user's own document (persisted draft). */
export const mainDocument = createDocument({ persist: true });

export const {
  doc,
  setDoc,
  getModel,
  getDupNodes,
  getRows,
  touchRows,
  navRequest,
  setNavRequest,
  selectNode,
  selectPath,
  expandedPaths,
  parseNow,
  saveDraftNow,
  setText,
  loadDocument,
  needsReplaceConfirm,
  clearDocument,
  markSaved,
  transform,
} = mainDocument;

export const DocContext = createContext<DocumentStore>(mainDocument);
/** Document store for the current subtree (the shared-link page provides its own, isolated one). */
export const useDoc = (): DocumentStore => useContext(DocContext);
