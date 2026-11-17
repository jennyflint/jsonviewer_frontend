import { Copy } from '../../lib/icons';
import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';
import { useDoc } from '../../stores/document';
import { IconButton } from '../ui/Button';
import { pathSegments, resolvePath, segmentsToPath } from '../../lib/json/path';
import type { PathSegment } from '../../lib/json/path';
import { copyText } from '../../lib/clipboard';
import { toast } from '../../stores/toasts';
import { t } from '../../lib/i18n';

/** Shows the selected node's path; editable (Enter navigates); breadcrumb segments are clickable. */
export function PathBar() {
  const { doc, getModel, selectNode, selectPath } = useDoc();
  const [draft, setDraft] = createSignal('$');
  const [bad, setBad] = createSignal(false);
  const segs = createMemo<PathSegment[]>(() => {
    const m = getModel();
    return m && doc.selectedNodeId >= 0 ? pathSegments(m, doc.selectedNodeId) : [];
  });
  const current = () => segmentsToPath(segs());
  createEffect(() => {
    setDraft(current());
    setBad(false);
  });

  const go = () => {
    const ok = selectPath(draft());
    setBad(!ok);
    if (!ok) toast.error(t('path.not_found', { path: draft() }));
  };

  return (
    <div class="flex flex-col gap-1 border-b border-border bg-surface px-2 py-1.5">
      <div class="flex items-center gap-1">
        <input
          aria-label={t('path.label')}
          aria-invalid={bad()}
          spellcheck={false}
          class="h-8 min-w-0 flex-1 rounded-md border bg-surface px-2 font-mono text-xs"
          classList={{ 'border-danger': bad(), 'border-border': !bad() }}
          value={draft()}
          placeholder="$.path[0].to"
          onInput={(e) => {
            setDraft(e.currentTarget.value);
            setBad(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && go()}
        />
        <IconButton
          label={t('tree.copy_path')}
          size="sm"
          onClick={async () =>
            toast.success((await copyText(current())) ? t('copy.path_done') : t('copy.failed'))
          }
        >
          <Copy size={14} />
        </IconButton>
      </div>
      <nav aria-label={t('path.breadcrumb')} class="flex flex-wrap items-center gap-0.5 font-mono text-xs">
        <button
          class="rounded px-1 hover:bg-surface-2"
          onClick={() => getModel() && selectNode(0, { source: 'panel' })}
        >
          $
        </button>
        <For each={segs()}>
          {(seg, i) => (
            <>
              <span class="text-muted" aria-hidden="true">
                ›
              </span>
              <button
                class="max-w-[24ch] truncate rounded px-1 hover:bg-surface-2"
                onClick={() => {
                  const m = getModel();
                  if (!m) return;
                  const id = resolvePath(m, segs().slice(0, i() + 1));
                  if (id >= 0) selectNode(id, { source: 'panel' });
                }}
              >
                {typeof seg === 'number' ? `[${seg}]` : seg}
              </button>
            </>
          )}
        </For>
        <Show when={segs().length === 0 && doc.selectedNodeId < 0}>
          <span class="ml-1 text-muted">{t('path.none')}</span>
        </Show>
      </nav>
    </div>
  );
}
