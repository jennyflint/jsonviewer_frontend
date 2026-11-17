import { GitCompare, RotateCcw, Save, Trash2 } from '../../lib/icons';
import { For, Show, createEffect, createSignal } from 'solid-js';
import { Dialog } from '../ui/Dialog';
import { Button, IconButton } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { CompareResultView } from '../compare/CompareResultView';
import { addSnapshot, loadSnapshots, removeSnapshot, snapshotsOf } from '../../stores/snapshots';
import type { Snapshot } from '../../stores/snapshots';
import { useDoc } from '../../stores/document';
import { diffWorker, isStale } from '../../lib/workers/clients';
import type { CompareResult } from '../../lib/workers/diff.worker';
import { DEFAULT_DIFF_OPTIONS } from '../../lib/json/diff';
import { runJob } from '../../stores/jobs';
import { settings } from '../../stores/settings';
import { toast } from '../../stores/toasts';
import { confirmAction } from '../../stores/confirm';
import { fmtDate, fmtSize, t } from '../../lib/i18n';
import { utf8Size } from '../../lib/files';

/** Local version history of the document: compare any earlier version with the current text, or restore it. */
export function VersionsDialog(props: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { doc, tabId, snapshot, setText } = useDoc();
  const [selected, setSelected] = createSignal<Snapshot | null>(null);
  const [result, setResult] = createSignal<CompareResult | null>(null);
  const [busy, setBusy] = createSignal(false);

  createEffect(() => {
    if (props.open) {
      void loadSnapshots(tabId);
      setSelected(null);
      setResult(null);
    }
  });

  const compareWith = async (s: Snapshot) => {
    setSelected(s);
    setResult(null);
    setBusy(true);
    try {
      const opts = {
        ...DEFAULT_DIFF_OPTIONS,
        indent: typeof settings.indent === 'number' ? settings.indent : 2,
      };
      setResult(
        await runJob(
          t('job.compare'),
          () => diffWorker.cancel(),
          () => diffWorker.call((w) => w.compare(s.text, doc.text, opts, true)),
        ),
      );
    } catch (e) {
      if (!isStale(e)) toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (s: Snapshot) => {
    const ok = await confirmAction({
      title: t('versions.restore'),
      message: t('versions.restore_message'),
      confirmLabel: t('versions.restore'),
      danger: true,
    });
    if (!ok) return;
    snapshot(t('versions.before_restore'));
    setText(s.text, { fromUser: true, immediate: true });
    props.onOpenChange(false);
    toast.success(t('versions.restored'));
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('versions.title')}
      description={t('versions.description')}
      wide
    >
      <div class="mb-2 flex items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={!doc.text.trim()}
          onClick={async () =>
            toast.success(
              (await addSnapshot(tabId, doc.text, t('versions.manual')))
                ? t('versions.saved')
                : t('versions.unchanged'),
            )
          }
        >
          <Save size={14} /> {t('versions.save')}
        </Button>
        <span class="text-xs text-muted">{t('versions.hint')}</span>
      </div>
      <Show
        when={snapshotsOf(tabId).length}
        fallback={<p class="text-sm text-muted">{t('versions.empty')}</p>}
      >
        <ul
          class="max-h-48 divide-y divide-border overflow-auto rounded-md border border-border"
          data-testid="version-list"
        >
          <For each={snapshotsOf(tabId)}>
            {(s) => (
              <li
                class="flex items-center gap-2 px-2 py-1.5 text-sm"
                classList={{ 'bg-accent-soft': selected()?.id === s.id }}
              >
                <div class="min-w-0 flex-1">
                  <div class="truncate font-medium">{s.label}</div>
                  <div class="text-xs text-muted">
                    {fmtDate(new Date(s.ts))} · {fmtSize(utf8Size(s.text))}
                  </div>
                </div>
                <Button size="sm" onClick={() => void compareWith(s)}>
                  <GitCompare size={12} /> {t('versions.compare')}
                </Button>
                <IconButton label={t('versions.restore')} size="sm" onClick={() => void restore(s)}>
                  <RotateCcw size={14} />
                </IconButton>
                <IconButton
                  label={t('common.delete')}
                  size="sm"
                  onClick={() => void removeSnapshot(tabId, s.id)}
                >
                  <Trash2 size={14} class="text-danger" />
                </IconButton>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={busy()}>
        <div class="mt-3">
          <Spinner label={t('job.compare')} />
        </div>
      </Show>
      <Show when={result() && selected()}>
        <div
          class="mt-3 h-[50vh] overflow-hidden rounded-md border border-border"
          data-testid="versions-diff"
        >
          <CompareResultView
            result={result() as CompareResult}
            left={selected()!.text}
            right={doc.text}
            navKeys={false}
          />
        </div>
      </Show>
    </Dialog>
  );
}
