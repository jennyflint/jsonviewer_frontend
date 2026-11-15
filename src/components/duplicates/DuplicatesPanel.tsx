import { AlertTriangle, Download, Loader2, X } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import { IconButton, Button } from '../ui/Button';
import { Toggle } from '../ui/Toggle';
import { useDoc } from '../../stores/document';
import type { DocumentStore } from '../../stores/document';
import { jsonWorker, isStale } from '../../lib/workers/clients';
import { arrayCandidates, DEFAULT_OPTIONS } from '../../lib/json/duplicates';
import type { DuplicateOptions, DuplicatesResponse } from '../../lib/json/duplicates';
import { duplicatesToCsv } from '../../lib/json/duplicates-export';
import { nodeAtOffset } from '../../lib/json/access';
import { api } from '../../lib/api/endpoints';
import { downloadText } from '../../lib/files';
import { errorMessage, fmtNumber, t } from '../../lib/i18n';
import { toast } from '../../stores/toasts';

type VType = 'string' | 'number' | 'boolean' | 'null';
const TYPES: VType[] = ['string', 'number', 'boolean', 'null'];

/** Duplicate-key count for the toolbar badge, computed from the parse result (no extra analysis needed). */
export function dupKeyGroupCount(dupNodes: Set<number>, getModel: DocumentStore['getModel']): number {
  const m = getModel();
  if (!m || dupNodes.size === 0) return 0;
  const seen = new Set<string>();
  for (const id of dupNodes)
    seen.add(`${m.parent[id]}|${m.text.slice(m.keyStart[id] as number, m.keyEnd[id] as number)}`);
  return seen.size;
}

export function DuplicatesPanel(props: { onClose: () => void; onNavigateOffset?: (offset: number) => void }) {
  const { doc, getModel, selectNode, selectPath } = useDoc();
  const [opts, setOpts] = createStore({
    min_occurrences: 2,
    min_string_length: 1,
    min_subtree_size: 2,
    value_types: [...TYPES] as VType[],
    arrayPath: '',
    field: '',
  });
  const [server, setServer] = createSignal(false);
  const [result, setResult] = createSignal<DuplicatesResponse | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const candidates = createMemo(() => {
    const m = getModel();
    return m ? arrayCandidates(m) : [];
  });
  const fieldOptions = () => candidates().find((c) => c.path === opts.arrayPath)?.fields ?? [];

  const buildOptions = (): Partial<DuplicateOptions> => ({
    min_occurrences: Math.max(2, opts.min_occurrences || 2),
    min_string_length: Math.max(0, opts.min_string_length || 0),
    min_subtree_size: Math.max(1, opts.min_subtree_size || 1),
    value_types: [...opts.value_types],
    max_groups: DEFAULT_OPTIONS.max_groups,
    by_field: opts.arrayPath && opts.field ? { array_path: opts.arrayPath, field: opts.field } : null,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  let ctrl: AbortController | undefined;

  const run = async () => {
    ctrl?.abort();
    if (doc.text.trim() === '') {
      setResult(null);
      return;
    }
    const options = buildOptions();
    setBusy(true);
    setError(null);
    try {
      if (server()) {
        ctrl = new AbortController();
        const res = await api.analyzeDuplicates(
          { content: doc.text, options: options as DuplicateOptions },
          ctrl.signal,
        );
        setResult(res);
      } else {
        const r = await jsonWorker.call((w) => w.duplicates(doc.text, options));
        if (r.ok) setResult(r.result);
        else {
          setResult(null);
          setError(
            r.code === 'invalid_array_path' ? `${t('error.invalid_array_path')} (${r.message})` : r.message,
          );
        }
      }
    } catch (e) {
      if (isStale(e) || (e instanceof DOMException && e.name === 'AbortError')) return;
      setError(errorMessage(e));
      if (!server()) toast.info(t('dup.worker_failed_hint'));
    } finally {
      setBusy(false);
    }
  };

  createEffect(
    on(
      () =>
        [
          doc.text,
          server(),
          opts.min_occurrences,
          opts.min_string_length,
          opts.min_subtree_size,
          opts.value_types.join(),
          opts.arrayPath,
          opts.field,
        ] as const,
      () => {
        clearTimeout(timer);
        timer = setTimeout(() => void run(), 400);
      },
    ),
  );

  const goToOffset = (offset: number) => {
    const m = getModel();
    if (!m) return;
    const id = nodeAtOffset(m, offset);
    if (id >= 0) selectNode(id, { source: 'panel' });
    props.onNavigateOffset?.(offset);
  };

  const exportAs = (kind: 'json' | 'csv') => {
    const r = result();
    if (!r) return;
    if (kind === 'json') downloadText('duplicates.json', JSON.stringify(r, null, 2));
    else downloadText('duplicates.csv', duplicatesToCsv(r), 'text/csv');
  };

  const num = (
    label: string,
    key: 'min_occurrences' | 'min_string_length' | 'min_subtree_size',
    min: number,
  ) => (
    <label class="flex flex-col gap-0.5 text-xs text-muted">
      {label}
      <input
        type="number"
        min={min}
        class="h-8 w-full rounded-md border border-border bg-surface px-2 text-sm text-fg"
        value={opts[key]}
        onInput={(e) => setOpts(key, Math.max(min, Number(e.currentTarget.value) || min))}
      />
    </label>
  );

  const pathButton = (p: string) => (
    <li>
      <button
        class="w-full truncate rounded px-1 py-0.5 text-left font-mono text-xs hover:bg-accent-soft"
        title={p}
        onClick={() => selectPath(p)}
      >
        {p}
      </button>
    </li>
  );

  const Section = (p: { title: string; count: number; children: JSX.Element }) => (
    <section class="border-b border-border">
      <h3 class="sticky top-0 flex items-center justify-between bg-surface-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
        {p.title}
        <span
          class="rounded-full bg-surface px-2 py-0.5 text-[11px]"
          classList={{ 'text-danger': p.count > 0 && p.title === t('dup.keys') }}
        >
          {fmtNumber(p.count)}
        </span>
      </h3>
      <div class="px-3 py-2">{p.children}</div>
    </section>
  );

  return (
    <aside class="flex h-full min-h-0 flex-col bg-surface" aria-label={t('dup.title')}>
      <div class="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 class="text-sm font-semibold">{t('dup.title')}</h2>
        <div class="flex items-center gap-1">
          <Show when={busy()}>
            <Loader2 size={14} class="animate-spin text-muted" aria-label={t('common.loading')} />
          </Show>
          <Button size="sm" onClick={() => exportAs('json')} disabled={!result()}>
            <Download size={12} /> JSON
          </Button>
          <Button size="sm" onClick={() => exportAs('csv')} disabled={!result()}>
            <Download size={12} /> CSV
          </Button>
          <IconButton label={t('common.close')} size="sm" onClick={props.onClose}>
            <X size={14} />
          </IconButton>
        </div>
      </div>

      <details class="border-b border-border px-3 py-2 text-sm" open>
        <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">
          {t('dup.options')}
        </summary>
        <div class="mt-2 grid grid-cols-3 gap-2">
          {num(t('dup.min_occurrences'), 'min_occurrences', 2)}
          {num(t('dup.min_string_length'), 'min_string_length', 0)}
          {num(t('dup.min_subtree_size'), 'min_subtree_size', 1)}
        </div>
        <fieldset class="mt-2 flex flex-wrap gap-3">
          <legend class="mb-1 text-xs text-muted">{t('dup.value_types')}</legend>
          <For each={TYPES}>
            {(ty) => (
              <Toggle
                checked={opts.value_types.includes(ty)}
                onChange={(v) =>
                  setOpts('value_types', (l) =>
                    v ? [...l.filter((x) => x !== ty), ty] : l.filter((x) => x !== ty),
                  )
                }
                label={t(`dup.type_${ty}` as const)}
              />
            )}
          </For>
        </fieldset>
        <div class="mt-2 grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-0.5 text-xs text-muted">
            {t('dup.array_path')}
            <input
              list="dup-array-paths"
              class="h-8 rounded-md border border-border bg-surface px-2 font-mono text-sm text-fg"
              value={opts.arrayPath}
              placeholder="$.items"
              onInput={(e) => setOpts({ arrayPath: e.currentTarget.value, field: '' })}
            />
            <datalist id="dup-array-paths">
              <For each={candidates()}>{(c) => <option value={c.path} />}</For>
            </datalist>
          </label>
          <label class="flex flex-col gap-0.5 text-xs text-muted">
            {t('dup.field')}
            <input
              list="dup-fields"
              class="h-8 rounded-md border border-border bg-surface px-2 font-mono text-sm text-fg"
              value={opts.field}
              onInput={(e) => setOpts('field', e.currentTarget.value)}
            />
            <datalist id="dup-fields">
              <For each={fieldOptions()}>{(f) => <option value={f} />}</For>
            </datalist>
          </label>
        </div>
        <div class="mt-2">
          <Toggle
            checked={server()}
            onChange={setServer}
            label={t('dup.analyze_on_server')}
            title={t('dup.server_hint')}
          />
          <Show when={server()}>
            <p class="mt-1 text-xs text-warn">{t('dup.server_hint')}</p>
          </Show>
        </div>
      </details>

      <div class="min-h-0 flex-1 overflow-auto" data-testid="duplicates-results">
        <Show when={error()}>
          <p class="m-3 rounded-md bg-danger-soft p-2 text-sm text-danger" role="alert">
            {error()}
          </p>
        </Show>
        <Show when={result()?.valid === false}>
          <p class="m-3 rounded-md bg-warn-soft p-2 text-sm text-warn">
            {t('dup.invalid_json', { message: result()?.parse_error?.message ?? '' })}
          </p>
        </Show>
        <Show when={result()?.valid}>
          {(_) => {
            const r = () => result() as DuplicatesResponse;
            return (
              <>
                <Show when={r().truncated}>
                  <p class="m-3 text-xs text-warn">{t('dup.truncated')}</p>
                </Show>
                <Section title={t('dup.keys')} count={r().duplicate_keys.length}>
                  <Show
                    when={r().duplicate_keys.length}
                    fallback={<p class="text-sm text-muted">{t('dup.none')}</p>}
                  >
                    <For each={r().duplicate_keys}>
                      {(g) => (
                        <div class="mb-3">
                          <div class="flex items-center gap-1 text-sm">
                            <AlertTriangle size={13} class="text-warn" />{' '}
                            <code class="font-semibold">{g.key}</code> <span class="text-muted">in</span>{' '}
                            <code class="text-xs">{g.object_path}</code>{' '}
                            <span class="text-muted">×{g.occurrences.length}</span>
                          </div>
                          <ul>
                            <For each={g.occurrences}>
                              {(o) => (
                                <li>
                                  <button
                                    class="w-full truncate rounded px-1 py-0.5 text-left font-mono text-xs hover:bg-accent-soft"
                                    onClick={() => goToOffset(o.offset)}
                                  >
                                    {t('status.line_col', { line: o.line, col: o.column })} →{' '}
                                    {o.value_preview}
                                  </button>
                                </li>
                              )}
                            </For>
                          </ul>
                        </div>
                      )}
                    </For>
                  </Show>
                </Section>
                <Section title={t('dup.values')} count={r().duplicate_values.length}>
                  <Show
                    when={r().duplicate_values.length}
                    fallback={<p class="text-sm text-muted">{t('dup.none')}</p>}
                  >
                    <For each={r().duplicate_values}>
                      {(g) => (
                        <details class="mb-1">
                          <summary class="cursor-pointer text-sm">
                            <span class="text-xs text-muted">{g.type}</span>{' '}
                            <code class="break-all">
                              {typeof g.value === 'string' ? JSON.stringify(g.value) : String(g.value)}
                            </code>{' '}
                            <span class="text-muted">×{g.count}</span>
                          </summary>
                          <ul class="ml-3">{<For each={g.paths}>{pathButton}</For>}</ul>
                        </details>
                      )}
                    </For>
                  </Show>
                </Section>
                <Section title={t('dup.subtrees')} count={r().duplicate_subtrees.length}>
                  <Show
                    when={r().duplicate_subtrees.length}
                    fallback={<p class="text-sm text-muted">{t('dup.none')}</p>}
                  >
                    <For each={r().duplicate_subtrees}>
                      {(g) => (
                        <details class="mb-1">
                          <summary class="cursor-pointer text-sm">
                            <span class="text-xs text-muted">
                              {g.kind} · {g.size}
                            </span>{' '}
                            <code class="break-all text-xs">{g.preview}</code>{' '}
                            <span class="text-muted">×{g.count}</span>
                          </summary>
                          <ul class="ml-3">{<For each={g.paths}>{pathButton}</For>}</ul>
                        </details>
                      )}
                    </For>
                  </Show>
                </Section>
                <Show when={r().duplicates_by_field}>
                  {(bf) => (
                    <Section title={t('dup.by_field')} count={bf().groups.length}>
                      <p class="mb-1 text-xs text-muted">
                        {bf().array_path} · {bf().field} · {t('dup.missing', { n: bf().missing })}
                      </p>
                      <Show
                        when={bf().groups.length}
                        fallback={<p class="text-sm text-muted">{t('dup.none')}</p>}
                      >
                        <For each={bf().groups}>
                          {(g) => (
                            <details class="mb-1">
                              <summary class="cursor-pointer text-sm">
                                <code class="break-all">
                                  {typeof g.value === 'string' ? JSON.stringify(g.value) : String(g.value)}
                                </code>{' '}
                                <span class="text-muted">×{g.indices.length}</span>
                              </summary>
                              <ul class="ml-3">
                                <For each={g.indices}>{(i) => pathButton(`${bf().array_path}[${i}]`)}</For>
                              </ul>
                            </details>
                          )}
                        </For>
                      </Show>
                    </Section>
                  )}
                </Show>
              </>
            );
          }}
        </Show>
        <Show when={!result() && !busy() && !error()}>
          <p class="p-3 text-sm text-muted">{t('dup.empty')}</p>
        </Show>
      </div>
    </aside>
  );
}
