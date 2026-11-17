import { ClipboardPaste, FileUp, History, Link2, Wand2 } from '../../lib/icons';
import { Show, createSignal } from 'solid-js';
import { Button } from '../ui/Button';
import { JsonEditor } from '../editor/JsonEditor';
import { LoadUrlDialog } from '../dialogs/LoadUrlDialog';
import { HistoryPickerDialog } from '../history/HistoryPickerDialog';
import { compare, setSide } from '../../stores/compare';
import type { CompareResult } from '../../lib/workers/diff.worker';
import { auth } from '../../stores/auth';
import { api } from '../../lib/api/endpoints';
import { readText } from '../../lib/clipboard';
import { parseJson } from '../../lib/json/parser';
import { pretty } from '../../lib/json/format';
import { settings } from '../../stores/settings';
import { toast } from '../../stores/toasts';
import { t } from '../../lib/i18n';
import { validateHttpUrl, rememberUrl } from '../../stores/loadUrl';

function SidePane(props: {
  side: 'left' | 'right';
  error?: CompareResult['errors'][number]['error'] | null;
}) {
  const [urlOpen, setUrlOpen] = createSignal(false);
  const [histOpen, setHistOpen] = createSignal(false);
  let fileInput!: HTMLInputElement;
  const text = () => compare[props.side];
  const label = () => (props.side === 'left' ? t('compare.left') : t('compare.right'));

  const paste = async () => {
    const c = await readText();
    if (c === null) toast.info(t('toolbar.paste_denied'));
    else setSide(props.side, c);
  };
  const format = () => {
    const r = parseJson(text());
    if (!r.ok) {
      toast.error(t('toolbar.cannot_format'), {
        detail: `${r.error.message} (${t('status.line_col', { line: r.error.line, col: r.error.column })})`,
      });
      return;
    }
    setSide(props.side, pretty(r.model, settings.indent));
  };
  const load = async (url: string, signal: AbortSignal) => {
    if (!validateHttpUrl(url)) return null;
    const res = await api.fetchUrl(url, signal);
    rememberUrl(url);
    setSide(props.side, res.content);
    return res;
  };

  return (
    <section
      class="flex h-full min-h-0 min-w-0 flex-1 flex-col"
      aria-label={label()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const f = e.dataTransfer?.files?.[0];
        if (f) {
          e.preventDefault();
          void f.text().then((s) => setSide(props.side, s));
        }
      }}
    >
      <div class="flex flex-wrap items-center gap-1 border-b border-border bg-surface px-2 py-1">
        <h2 class="mr-2 text-sm font-semibold">{label()}</h2>
        <Button size="sm" onClick={() => void paste()}>
          <ClipboardPaste size={12} /> {t('compare.paste')}
        </Button>
        <Button size="sm" onClick={() => fileInput.click()}>
          <FileUp size={12} /> {t('compare.upload')}
        </Button>
        <Button size="sm" onClick={() => setUrlOpen(true)}>
          <Link2 size={12} /> {t('compare.load_url')}
        </Button>
        <Button size="sm" onClick={format} disabled={!text().trim()}>
          <Wand2 size={12} /> {t('compare.format')}
        </Button>
        <Show when={auth.status === 'authenticated'}>
          <Button size="sm" onClick={() => setHistOpen(true)}>
            <History size={12} /> {t('compare.from_history')}
          </Button>
        </Show>
      </div>
      <Show when={props.error}>
        {(e) => (
          <p class="border-b border-border bg-danger-soft px-3 py-1 text-xs text-danger" role="alert">
            {t('compare.invalid_side', {
              side: label(),
              message: e().message,
              loc: t('status.line_col', { line: e().line, col: e().column }),
            })}
          </p>
        )}
      </Show>
      <div class="min-h-0 flex-1">
        <JsonEditor
          value={text()}
          error={props.error ?? null}
          onChange={(v) => setSide(props.side, v)}
          ariaLabel={label()}
        />
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,.txt,application/json,text/plain"
        class="hidden"
        aria-label={t('compare.upload')}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (f) void f.text().then((s) => setSide(props.side, s));
        }}
      />
      <LoadUrlDialog open={urlOpen()} onOpenChange={setUrlOpen} loader={load} />
      <HistoryPickerDialog
        open={histOpen()}
        onOpenChange={setHistOpen}
        onPick={(c) => setSide(props.side, c)}
      />
    </section>
  );
}

export function CompareEditors() {
  const errFor = (side: 'left' | 'right') =>
    compare.result?.errors.find((e) => e.side === side)?.error ?? null;
  return (
    <div class="flex h-full min-h-0 flex-col md:flex-row">
      <SidePane side="left" error={errFor('left')} />
      <div class="h-px bg-border md:h-auto md:w-px" />
      <SidePane side="right" error={errFor('right')} />
    </div>
  );
}
