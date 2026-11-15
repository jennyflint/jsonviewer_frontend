import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  syntaxHighlighting,
} from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { setDiagnostics, lintGutter } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
import { createEffect, onCleanup, onMount } from 'solid-js';
import type { ParseError } from '../../lib/json/parser';
import { t } from '../../lib/i18n';

export interface EditorApi {
  focus: () => void;
  /** Move the cursor / selection to a range and scroll it into view. */
  select: (from: number, to: number, flash?: boolean) => void;
  requestMeasure: () => void;
}

export interface Mark {
  from: number;
  to: number;
  cls: string;
}

export const LARGE_DOC_CHARS = 5 * 1024 * 1024;

const setMarks = StateEffect.define<Mark[]>();
const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setMarks)) {
        const len = tr.state.doc.length;
        const ranges = e.value
          .filter((m) => m.from < m.to && m.to <= len)
          .sort((a, b) => a.from - b.from)
          .map((m) => Decoration.mark({ class: m.cls }).range(m.from, m.to));
        value = Decoration.set(ranges, true);
      }
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const highlight = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--t-key)', fontWeight: '600' },
  { tag: tags.string, color: 'var(--t-string)' },
  { tag: tags.number, color: 'var(--t-number)' },
  { tag: [tags.bool, tags.atom], color: 'var(--t-bool)' },
  { tag: tags.null, color: 'var(--t-null)' },
  { tag: [tags.brace, tags.squareBracket, tags.separator], color: 'var(--muted)' },
]);

function lightExtensions(): Extension[] {
  return [
    json(),
    syntaxHighlighting(highlight),
    foldGutter(),
    bracketMatching(),
    highlightSelectionMatches(),
    lintGutter(),
  ];
}

export interface JsonEditorProps {
  value: string;
  onChange?: (text: string) => void;
  readOnly?: boolean;
  /** Parse error shown as a squiggle at the error position. */
  error?: ParseError | null;
  onCursor?: (offset: number) => void;
  marks?: Mark[];
  apiRef?: (api: EditorApi) => void;
  ariaLabel?: string;
  class?: string;
}

/** CodeMirror 6 wrapper. `value` is the single source of truth; edits are reported through `onChange`. */
export function JsonEditor(props: JsonEditorProps) {
  let host!: HTMLDivElement;
  let view: EditorView | undefined;
  let lastEmitted = props.value;
  let applyingExternal = false;
  const modeCompartment = new Compartment();
  const editableCompartment = new Compartment();
  let large = props.value.length > LARGE_DOC_CHARS;

  onMount(() => {
    let cursorFrame = 0;
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: props.value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          history(),
          search({ top: true }),
          marksField,
          modeCompartment.of(large ? [] : lightExtensions()),
          editableCompartment.of([EditorState.readOnly.of(!!props.readOnly), EditorView.editable.of(true)]),
          keymap.of([...searchKeymap, ...foldKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
          EditorView.contentAttributes.of({
            'aria-label': props.ariaLabel ?? t('editor.label'),
            spellcheck: 'false',
          }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              const isLarge = u.state.doc.length > LARGE_DOC_CHARS;
              if (isLarge !== large) {
                large = isLarge;
                view?.dispatch({ effects: modeCompartment.reconfigure(large ? [] : lightExtensions()) });
              }
              // changes we applied ourselves (props.value) must not be serialized and echoed back
              if (!applyingExternal) {
                const text = u.state.doc.toString();
                lastEmitted = text;
                props.onChange?.(text);
              }
            }
            if (u.selectionSet || u.docChanged) {
              cancelAnimationFrame(cursorFrame);
              cursorFrame = requestAnimationFrame(() => props.onCursor?.(u.state.selection.main.head));
            }
          }),
        ],
      }),
    });
    props.apiRef?.({
      focus: () => view?.focus(),
      requestMeasure: () => view?.requestMeasure(),
      select: (from, to, flash = true) => {
        if (!view) return;
        const len = view.state.doc.length;
        const f = Math.min(from, len);
        const e = Math.min(to, len);
        view.dispatch({
          selection: { anchor: f, head: e },
          effects: [
            EditorView.scrollIntoView(f, { y: 'center' }),
            ...(flash
              ? [
                  setMarks.of([
                    ...(props.marks ?? []),
                    { from: f, to: Math.max(e, f + 1), cls: 'cm-nav-flash' },
                  ]),
                ]
              : []),
          ],
        });
        if (flash) setTimeout(() => view?.dispatch({ effects: setMarks.of(props.marks ?? []) }), 1500);
        view.focus();
      },
    });
    onCleanup(() => {
      cancelAnimationFrame(cursorFrame);
      view?.destroy();
    });
  });

  // external value changes. Very large documents are inserted in chunks so that no single main-thread
  // task (CodeMirror splitting the text into lines) blocks the UI for long.
  let applyToken = 0;
  const CHUNK = 1_000_000;
  const cutAt = (v: string, from: number): number => {
    const target = from + CHUNK;
    if (target >= v.length) return v.length;
    const nl = v.indexOf('\n', target);
    return nl === -1 ? v.length : nl + 1;
  };
  const applyExternal = (v: string) => {
    const mine = ++applyToken;
    const dispatch = (spec: { from: number; to: number; insert: string }, selection?: { anchor: number }) => {
      applyingExternal = true;
      try {
        view?.dispatch({ changes: spec, selection });
      } finally {
        applyingExternal = false;
      }
    };
    if (v.length <= 2 * CHUNK) {
      dispatch({ from: 0, to: view?.state.doc.length ?? 0, insert: v }, { anchor: 0 });
      return;
    }
    let pos = cutAt(v, 0);
    dispatch({ from: 0, to: view?.state.doc.length ?? 0, insert: v.slice(0, pos) }, { anchor: 0 });
    const next = () => {
      if (mine !== applyToken || !view || pos >= v.length) return;
      const end = cutAt(v, pos);
      const at = view.state.doc.length;
      dispatch({ from: at, to: at, insert: v.slice(pos, end) });
      pos = end;
      setTimeout(next, 0);
    };
    setTimeout(next, 0);
  };

  createEffect(() => {
    const v = props.value;
    if (!view || v === lastEmitted) return;
    lastEmitted = v;
    applyExternal(v);
  });

  createEffect(() => {
    const ro = !!props.readOnly;
    view?.dispatch({
      effects: editableCompartment.reconfigure([EditorState.readOnly.of(ro), EditorView.editable.of(true)]),
    });
  });

  // lint diagnostics from the worker's parse error (kept out of the doc-size-sensitive lint gutter path)
  createEffect(() => {
    const err = props.error;
    const v = props.value; // re-run when text changes so stale squiggles are dropped
    if (!view) return;
    void v;
    const len = view.state.doc.length;
    if (!err || err.offset > len) {
      view.dispatch(setDiagnostics(view.state, []));
      return;
    }
    const from = Math.min(err.offset, Math.max(0, len - 1));
    view.dispatch(
      setDiagnostics(view.state, [
        { from, to: Math.min(len, from + 1), severity: 'error', message: err.message },
      ]),
    );
  });

  createEffect(() => {
    const m = props.marks ?? [];
    view?.dispatch({ effects: setMarks.of(m) });
  });

  return (
    <div ref={host} class={`h-full min-h-0 overflow-hidden ${props.class ?? ''}`} data-testid="json-editor" />
  );
}
