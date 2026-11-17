import { Pencil, Star, Trash2 } from '../../lib/icons';
import { For, Show, createSignal } from 'solid-js';
import { Dialog } from '../ui/Dialog';
import { IconButton } from '../ui/Button';
import { bookmarksOf, removeBookmark, renameBookmark } from '../../stores/bookmarks';
import { useDoc } from '../../stores/document';
import { resolvePath } from '../../lib/json/path';
import { t } from '../../lib/i18n';

/** Bookmarked nodes of the current document: jump to, rename or remove. */
export function BookmarksDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onJump?: () => void;
}) {
  const { getModel, selectNode, tabId } = useDoc();
  const [editing, setEditing] = createSignal<string | null>(null);
  const exists = (path: string) => {
    const m = getModel();
    return !!m && resolvePath(m, path) >= 0;
  };
  const jump = (path: string) => {
    const m = getModel();
    const id = m ? resolvePath(m, path) : -1;
    if (id < 0) return;
    selectNode(id, { source: 'panel' });
    props.onOpenChange(false);
    props.onJump?.();
  };
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('bookmarks.title')}
      description={t('bookmarks.description')}
    >
      <Show
        when={bookmarksOf(tabId).length}
        fallback={<p class="text-sm text-muted">{t('bookmarks.empty')}</p>}
      >
        <ul class="max-h-80 divide-y divide-border overflow-auto">
          <For each={bookmarksOf(tabId)}>
            {(b) => (
              <li class="flex items-center gap-2 py-1.5" data-testid="bookmark-item">
                <Star size={14} class="shrink-0 text-warn" fill="currentColor" aria-hidden="true" />
                <Show
                  when={editing() === b.path}
                  fallback={
                    <button
                      class="min-w-0 flex-1 text-left disabled:opacity-50"
                      disabled={!exists(b.path)}
                      title={exists(b.path) ? b.path : t('bookmarks.missing')}
                      onClick={() => jump(b.path)}
                    >
                      <div class="truncate text-sm font-medium">{b.label}</div>
                      <Show when={b.label !== b.path}>
                        <div class="truncate font-mono text-xs text-muted">{b.path}</div>
                      </Show>
                    </button>
                  }
                >
                  <input
                    aria-label={t('bookmarks.rename')}
                    class="h-8 min-w-0 flex-1 rounded border border-border bg-surface px-2 text-sm"
                    value={b.label}
                    autofocus
                    onBlur={(e) => {
                      renameBookmark(tabId, b.path, e.currentTarget.value);
                      setEditing(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                </Show>
                <IconButton label={t('bookmarks.rename')} size="sm" onClick={() => setEditing(b.path)}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton
                  label={t('bookmarks.remove')}
                  size="sm"
                  onClick={() => removeBookmark(tabId, b.path)}
                >
                  <Trash2 size={14} class="text-danger" />
                </IconButton>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </Dialog>
  );
}
