import { ShieldAlert } from '../../lib/icons';
import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { useDoc } from '../../stores/document';
import { DEFAULT_REDACT } from '../../lib/json/redact';
import type { RedactOptions, RedactResult } from '../../lib/json/redact';
import { jsonWorker, isStale } from '../../lib/workers/clients';
import { runJob } from '../../stores/jobs';
import { getJSON, setJSON } from '../../lib/storage';
import { toast } from '../../stores/toasts';
import { fmtNumber, t } from '../../lib/i18n';

const KEY = 'jv.redact.v1';

/** Mask sensitive values (by key name or by regular expression) in the current document. */
export function RedactDialog(props: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { doc, setText, snapshot } = useDoc();
  const saved = getJSON<Partial<RedactOptions>>(KEY, {});
  const [keys, setKeys] = createSignal((saved.keys ?? DEFAULT_REDACT.keys).join('\n'));
  const [values, setValues] = createSignal((saved.valuePatterns ?? []).join('\n'));
  const [replacement, setReplacement] = createSignal(saved.replacement ?? DEFAULT_REDACT.replacement);
  const [result, setResult] = createSignal<RedactResult | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));

  const options = (): RedactOptions => ({
    keys: keys()
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    valuePatterns: values()
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    replacement: replacement(),
  });

  createEffect(() => {
    if (!props.open) return;
    const o = options();
    void doc.text;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const r = await runJob(
          t('job.format'),
          () => jsonWorker.cancel(),
          () => jsonWorker.call((w) => w.redact(doc.text, o)),
        );
        if (r.error) {
          setError(r.error);
          setResult(null);
        } else {
          setError(null);
          setResult(r);
        }
      } catch (e) {
        if (!isStale(e)) setError(e instanceof Error ? e.message : String(e));
      }
    }, 300);
  });

  const total = () => (result()?.keyMatches ?? 0) + (result()?.valueMatches ?? 0);
  const apply = () => {
    const r = result();
    if (!r || total() === 0) return;
    setJSON(KEY, options());
    snapshot(t('versions.before_redact'));
    setText(r.text, { fromUser: true, immediate: true });
    toast.success(t('redact.done', { n: fmtNumber(total()) }));
    props.onOpenChange(false);
  };

  const area = 'mt-1 w-full rounded-md border border-border bg-surface p-2 font-mono text-xs';
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('redact.title')}
      description={t('redact.description')}
      wide
      footer={
        <>
          <Button onClick={() => props.onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={total() === 0 || !!error()} onClick={apply}>
            <ShieldAlert size={14} /> {t('redact.apply')}
          </Button>
        </>
      }
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="text-sm">
          {t('redact.keys')}
          <textarea
            aria-label={t('redact.keys')}
            rows="9"
            class={area}
            spellcheck={false}
            value={keys()}
            onInput={(e) => setKeys(e.currentTarget.value)}
          />
          <span class="text-xs text-muted">{t('redact.keys_hint')}</span>
        </label>
        <div class="space-y-3">
          <label class="block text-sm">
            {t('redact.values')}
            <textarea
              aria-label={t('redact.values')}
              rows="4"
              class={area}
              spellcheck={false}
              placeholder="[\w.+-]+@[\w-]+\.[\w.]+"
              value={values()}
              onInput={(e) => setValues(e.currentTarget.value)}
            />
            <span class="text-xs text-muted">{t('redact.values_hint')}</span>
          </label>
          <label class="block text-sm">
            {t('redact.replacement')}
            <input
              aria-label={t('redact.replacement')}
              class="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 font-mono text-sm"
              value={replacement()}
              onInput={(e) => setReplacement(e.currentTarget.value)}
            />
          </label>
        </div>
      </div>
      <Show when={error()}>
        <p class="mt-3 rounded-md bg-danger-soft p-2 text-sm text-danger" role="alert">
          {error()}
        </p>
      </Show>
      <p class="mt-3 text-sm" role="status" data-testid="redact-summary">
        {result() && !error()
          ? total() > 0
            ? t('redact.summary', {
                keys: fmtNumber(result()!.keyMatches),
                values: fmtNumber(result()!.valueMatches),
              })
            : t('redact.none')
          : '…'}
      </p>
    </Dialog>
  );
}
