import {
  MergeView,
  getChunks,
  getOriginalDoc,
  unifiedMergeView,
  uncollapseUnchanged,
} from '@codemirror/merge';
import type { Chunk } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { json } from '@codemirror/lang-json';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { createEffect, onCleanup } from 'solid-js';
import { t } from '../../lib/i18n';

export interface DiffApi {
  chunkCount: () => number;
  goToChunk: (i: number) => void;
  /** Scroll to a (1-based) line of the normalized left / right text. */
  scrollToLine: (side: 'left' | 'right', line: number) => void;
}

const style = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--t-key)', fontWeight: '600' },
  { tag: tags.string, color: 'var(--t-string)' },
  { tag: tags.number, color: 'var(--t-number)' },
  { tag: [tags.bool, tags.atom], color: 'var(--t-bool)' },
  { tag: tags.null, color: 'var(--t-null)' },
]);

const squash = (s: string) =>
  s
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .join('\n');

/** Read-only side-by-side (MergeView) or unified diff with +/- gutters, word-level highlights and collapsed unchanged regions. */
export function DiffView(props: {
  left: string;
  right: string;
  mode: 'split' | 'unified';
  contextLines: number;
  collapse: boolean;
  ignoreWhitespace: boolean;
  apiRef?: (api: DiffApi) => void;
  onChunks?: (n: number) => void;
  onActiveChunk?: (i: number) => void;
}) {
  let host!: HTMLDivElement;
  let merge: MergeView | undefined;
  let unified: EditorView | undefined;
  let active = -1;

  // Syntax parsing of multi-megabyte documents runs in 100 ms slices on the main thread: skip it for large diffs.
  const LARGE_DIFF_CHARS = 1_000_000;
  const readOnly = () => [
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    lineNumbers(),
    EditorView.lineWrapping,
    ...(props.left.length + props.right.length > LARGE_DIFF_CHARS ? [] : [json(), syntaxHighlighting(style)]),
  ];

  const chunks = (): readonly Chunk[] => {
    const st = merge ? merge.b.state : unified?.state;
    return (st && getChunks(st)?.chunks) || [];
  };

  const destroy = () => {
    merge?.destroy();
    unified?.destroy();
    merge = undefined;
    unified = undefined;
    host.replaceChildren();
  };

  const build = (left: string, right: string) => {
    destroy();
    const collapse = props.collapse ? { margin: Math.max(0, props.contextLines), minSize: 4 } : undefined;
    const l = props.ignoreWhitespace ? squash(left) : left;
    const r = props.ignoreWhitespace ? squash(right) : right;
    if (props.mode === 'split') {
      merge = new MergeView({
        a: {
          doc: l,
          extensions: [...readOnly(), EditorView.contentAttributes.of({ 'aria-label': t('compare.left') })],
        },
        b: {
          doc: r,
          extensions: [...readOnly(), EditorView.contentAttributes.of({ 'aria-label': t('compare.right') })],
        },
        parent: host,
        highlightChanges: true,
        gutter: true,
        collapseUnchanged: collapse,
      });
    } else {
      unified = new EditorView({
        parent: host,
        state: EditorState.create({
          doc: r,
          extensions: [
            ...readOnly(),
            unifiedMergeView({
              original: l,
              highlightChanges: true,
              gutter: true,
              mergeControls: false,
              collapseUnchanged: collapse,
            }),
            EditorView.contentAttributes.of({ 'aria-label': t('compare.view_unified') }),
          ],
        }),
      });
    }
    active = -1;
    // chunks are computed asynchronously on first measure
    requestAnimationFrame(() => props.onChunks?.(chunks().length));
  };

  createEffect(() => {
    build(props.left, props.right);
  });
  onCleanup(destroy);

  const viewOf = () => (merge ? merge.b : unified);

  props.apiRef?.({
    chunkCount: () => chunks().length,
    goToChunk: (i) => {
      const cs = chunks();
      const v = viewOf();
      if (!cs.length || !v) return;
      const idx = ((i % cs.length) + cs.length) % cs.length;
      const c = cs[idx] as Chunk;
      active = idx;
      v.dispatch({
        selection: { anchor: Math.min(c.fromB, v.state.doc.length) },
        effects: [uncollapseUnchanged.of(c.fromB), EditorView.scrollIntoView(c.fromB, { y: 'center' })],
      });
      merge?.a.dispatch({
        effects: EditorView.scrollIntoView(Math.min(c.fromA, merge.a.state.doc.length), { y: 'center' }),
      });
      props.onActiveChunk?.(active);
    },
    scrollToLine: (side, line) => {
      const go = (v: EditorView, pos: number) =>
        v.dispatch({
          effects: [uncollapseUnchanged.of(pos), EditorView.scrollIntoView(pos, { y: 'center' })],
        });
      const lineStart = (v: EditorView) =>
        v.state.doc.line(Math.max(1, Math.min(line, v.state.doc.lines))).from;
      if (merge) {
        const v = side === 'left' ? merge.a : merge.b;
        go(v, lineStart(v));
      } else if (unified) {
        if (side === 'right') go(unified, lineStart(unified));
        else {
          // deleted lines only exist in the original document: find the chunk that covers them
          const orig = getOriginalDoc(unified.state);
          const hit = chunks().find(
            (c) =>
              orig.lineAt(c.fromA).number <= line &&
              line <= orig.lineAt(Math.min(c.endA, orig.length)).number,
          );
          if (hit) go(unified, Math.min(hit.fromB, unified.state.doc.length));
        }
      }
    },
  });

  return <div ref={host} class="h-full min-h-0 overflow-auto bg-surface" data-testid="diff-view" />;
}
