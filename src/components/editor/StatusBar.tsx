import { Show } from 'solid-js';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from '../../lib/icons';
import { useDoc } from '../../stores/document';
import { lastSavedAt } from '../../stores/historySync';
import { Button } from '../ui/Button';
import { fmtNumber, fmtSize, t } from '../../lib/i18n';
import { utf8Size } from '../../lib/files';
import { buildPath } from '../../lib/json/path';
import { nodeAtOffset } from '../../lib/json/access';
import { createMemo } from 'solid-js';

/** Number of lines without allocating one string per line. */
export function countLines(text: string): number {
  if (text === '') return 0;
  let n = 1;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++;
  return n;
}

export interface Cursor {
  line: number;
  column: number;
  offset: number;
}

export function StatusBar(props: { cursor: Cursor; onGoToError?: (offset: number) => void }) {
  const { doc, getModel, parseNow } = useDoc();
  const lines = createMemo(() => countLines(doc.text));
  const bytes = createMemo(() => (doc.text.length > 2_000_000 ? doc.text.length : utf8Size(doc.text)));
  const pathAtCursor = createMemo(() => {
    const m = getModel();
    if (!m || doc.status !== 'ok') return '';
    const id = nodeAtOffset(m, props.cursor.offset);
    return id >= 0 ? buildPath(m, id) : '';
  });
  return (
    <div
      class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface px-3 py-1 text-xs text-muted"
      role="status"
      aria-live="polite"
    >
      <Show when={doc.status === 'ok'}>
        <span class="inline-flex items-center gap-1 text-ok">
          <CheckCircle2 size={13} /> {t('status.valid')}
        </span>
        <Show when={doc.lenient}>
          <span
            class="rounded bg-warn-soft px-1.5 text-warn"
            title={
              doc.strictError
                ? `${t('lenient.not_strict')}: ${doc.strictError.message}`
                : t('lenient.not_strict')
            }
            data-testid="lenient-badge"
          >
            {t('lenient.badge')}
          </span>
        </Show>
      </Show>
      <Show when={doc.status === 'error' && doc.error}>
        {(e) => (
          <button
            class="inline-flex items-center gap-1 text-danger underline-offset-2 hover:underline"
            onClick={() => props.onGoToError?.(e().offset)}
          >
            <AlertCircle size={13} /> {t('status.invalid')}: {e().message} (
            {t('status.line_col', { line: e().line, col: e().column })})
          </button>
        )}
      </Show>
      <Show when={doc.status === 'parsing'}>
        <span class="inline-flex items-center gap-1">
          <Loader2 size={13} class="animate-spin" /> {t('status.parsing')}
        </span>
      </Show>
      <Show when={doc.stale}>
        <span class="inline-flex items-center gap-1.5">
          {t('status.large_doc_hint')}
          <Button size="sm" variant="primary" onClick={() => void parseNow()}>
            <RefreshCw size={12} /> {t('status.parse_now')}
          </Button>
        </span>
      </Show>
      <span>{fmtSize(bytes())}</span>
      <span>{t('status.lines', { n: fmtNumber(lines()) })}</span>
      <Show when={doc.stats && doc.status === 'ok'}>
        <span>{t('status.nodes', { n: fmtNumber(doc.stats?.nodes ?? 0) })}</span>
        <span>{t('status.depth', { n: doc.stats?.depth ?? 0 })}</span>
      </Show>
      <span>
        {t('status.cursor')} {props.cursor.line}:{props.cursor.column}
      </span>
      <Show when={pathAtCursor()}>
        <span class="max-w-[40ch] truncate font-mono" title={pathAtCursor()}>
          {pathAtCursor()}
        </span>
      </Show>
      <Show when={doc.draftSkipped}>
        <span class="text-warn">{t('status.draft_skipped')}</span>
      </Show>
      <Show when={lastSavedAt()}>
        <span class="text-ok">{t('history.saved_indicator')}</span>
      </Show>
    </div>
  );
}
