import { Copy, Download, FilePlus2, Play, X } from '../../lib/icons';
import { For, Show, createEffect, createSignal, on, onCleanup } from 'solid-js';
import { Button, IconButton } from '../ui/Button';
import { Select } from '../ui/Select';
import { JsonEditor } from '../editor/JsonEditor';
import { useDoc } from '../../stores/document';
import { newTab } from '../../stores/tabs';
import { jsonWorker, isCancelled, isStale } from '../../lib/workers/clients';
import type { QueryLang, QueryResult } from '../../lib/json/query';
import { copyText } from '../../lib/clipboard';
import { downloadText } from '../../lib/files';
import { runJob } from '../../stores/jobs';
import { toast } from '../../stores/toasts';
import { getJSON, setJSON } from '../../lib/storage';
import { fmtNumber, t } from '../../lib/i18n';

const HISTORY_KEY = 'jv.queryHistory.v1';

const EXAMPLES: Record<QueryLang, string[]> = {
  jsonpath: ['$..name', '$.items[?(@.price > 10)]', '$.items[0:3]', '$..[?(@.active == true)].id'],
  jmespath: [
    'items[?price > `10`].name',
    'sort_by(items, &price)[0]',
    'length(items)',
    'items[*].{id: id, name: name}',
  ],
};

/** Run JSONPath / JMESPath queries (in the worker) and use the result: copy, download or open as a new document. */
export function QueryPanel(props: { onClose: () => void }) {
  const { doc, getModel, selectPath } = useDoc();
  const [lang, setLang] = createSignal<QueryLang>('jsonpath');
  const [expr, setExpr] = createSignal('');
  const [res, setRes] = createSignal<QueryResult | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [recent, setRecent] = createSignal<string[]>(getJSON<string[]>(HISTORY_KEY, []));
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));

  const run = async (remember = false) => {
    const e = expr().trim();
    if (!e || !getModel()) {
      setRes(null);
      return;
    }
    setBusy(true);
    try {
      const r = await runJob(
        t('job.query'),
        () => jsonWorker.cancel(),
        () => jsonWorker.call((w) => w.query(doc.text, lang(), e)),
      );
      setRes(r);
      if (remember && r.ok) {
        const entry = `${lang()}:${e}`;
        const next = [entry, ...recent().filter((x) => x !== entry)].slice(0, 15);
        setRecent(next);
        setJSON(HISTORY_KEY, next);
      }
    } catch (err) {
      if (isCancelled(err)) toast.info(t('job.cancelled'));
      else if (!isStale(err)) setRes({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  // live results while typing (debounced) and when the document or language changes
  createEffect(
    on(
      () => [expr(), lang(), doc.text] as const,
      () => {
        clearTimeout(timer);
        timer = setTimeout(() => void run(), 500);
      },
    ),
  );

  const ok = () => {
    const r = res();
    return r && r.ok ? r : null;
  };
  const err = () => {
    const r = res();
    return r && !r.ok ? r.error : null;
  };

  return (
    <aside class="flex h-full min-h-0 flex-col bg-surface" aria-label={t('query.title')}>
      <div class="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 class="text-sm font-semibold">{t('query.title')}</h2>
        <IconButton label={t('common.close')} size="sm" onClick={props.onClose}>
          <X size={14} />
        </IconButton>
      </div>
      <div class="space-y-2 border-b border-border p-3">
        <div class="flex gap-2">
          <Select
            label={t('query.language')}
            value={lang()}
            onChange={setLang}
            options={[
              { value: 'jsonpath', label: 'JSONPath' },
              { value: 'jmespath', label: 'JMESPath' },
            ]}
          />
          <input
            aria-label={t('query.expression')}
            placeholder={EXAMPLES[lang()][0]}
            spellcheck={false}
            class="h-9 min-w-0 flex-1 rounded-md border bg-surface px-2 font-mono text-sm"
            classList={{ 'border-danger': !!err(), 'border-border': !err() }}
            value={expr()}
            onInput={(e) => setExpr(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && void run(true)}
          />
          <Button variant="primary" onClick={() => void run(true)} disabled={!expr().trim()}>
            <Play size={14} /> {t('query.run')}
          </Button>
        </div>
        <div class="flex flex-wrap gap-1">
          <For each={EXAMPLES[lang()]}>
            {(ex) => (
              <button
                class="rounded-full border border-border px-2 py-0.5 font-mono text-xs hover:bg-surface-2"
                onClick={() => setExpr(ex)}
              >
                {ex}
              </button>
            )}
          </For>
        </div>
        <Show when={recent().length}>
          <details class="text-xs">
            <summary class="cursor-pointer text-muted">{t('query.recent')}</summary>
            <ul class="mt-1 max-h-24 overflow-auto">
              <For each={recent()}>
                {(r) => (
                  <li>
                    <button
                      class="w-full truncate rounded px-1 text-left font-mono hover:bg-surface-2"
                      onClick={() => {
                        const i = r.indexOf(':');
                        setLang(r.slice(0, i) as QueryLang);
                        setExpr(r.slice(i + 1));
                      }}
                    >
                      {r}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </details>
        </Show>
      </div>
      <Show when={err()}>
        <p
          class="m-3 rounded-md bg-danger-soft p-2 text-sm text-danger"
          role="alert"
          data-testid="query-error"
        >
          {err()}
        </p>
      </Show>
      <Show when={ok()}>
        {(r) => (
          <div class="flex min-h-0 flex-1 flex-col">
            <div class="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
              <span class="text-sm font-medium" data-testid="query-count">
                {t('query.matches', { n: fmtNumber(r().count) })}
              </span>
              <Show when={busy()}>
                <span class="text-xs text-muted">…</span>
              </Show>
              <div class="ml-auto flex gap-1">
                <Button
                  size="sm"
                  onClick={async () =>
                    toast.success((await copyText(r().text)) ? t('copy.done') : t('copy.failed'))
                  }
                >
                  <Copy size={12} /> {t('toolbar.copy')}
                </Button>
                <Button size="sm" onClick={() => downloadText('query-result.json', r().text)}>
                  <Download size={12} /> {t('toolbar.download')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (newTab(r().text, t('query.tab_title', { q: expr().slice(0, 24) })) === null)
                      toast.error(t('doctabs.limit', { n: 12 }));
                  }}
                >
                  <FilePlus2 size={12} /> {t('query.open_tab')}
                </Button>
              </div>
            </div>
            <Show when={r().paths.length > 0}>
              <details class="border-b border-border px-3 py-1 text-xs">
                <summary class="cursor-pointer text-muted">
                  {t('query.paths', { n: fmtNumber(r().paths.length) })}
                  {r().truncated ? '+' : ''}
                </summary>
                <ul class="mt-1 max-h-28 overflow-auto" data-testid="query-paths">
                  <For each={r().paths.slice(0, 500)}>
                    {(p) => (
                      <li>
                        <button
                          class="w-full truncate rounded px-1 text-left font-mono hover:bg-accent-soft"
                          onClick={() => selectPath(p)}
                        >
                          {p}
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </details>
            </Show>
            <div class="min-h-0 flex-1">
              <JsonEditor value={r().text} readOnly ariaLabel={t('query.result')} />
            </div>
          </div>
        )}
      </Show>
      <Show when={!res() && !busy()}>
        <p class="p-3 text-sm text-muted">{t('query.empty')}</p>
      </Show>
    </aside>
  );
}
