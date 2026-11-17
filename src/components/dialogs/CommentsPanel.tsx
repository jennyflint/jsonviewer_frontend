import { Send, Trash2, X } from '../../lib/icons';
import { For, Show, createEffect, createSignal, on } from 'solid-js';
import { Button, IconButton } from '../ui/Button';
import { api } from '../../lib/api/endpoints';
import type { ShareComment } from '../../lib/api/endpoints';
import { getItem, setItem } from '../../lib/storage';
import { toast } from '../../stores/toasts';
import { errorMessage, fmtRelative, t } from '../../lib/i18n';

const NAME_KEY = 'jv.commentName.v1';

/** Comments on a shared document, optionally attached to a JSON path (the selected node). */
export function CommentsPanel(props: {
  slug: string;
  password?: string;
  /** Owner (session) or holder of the delete token: may delete any comment. */
  canModerate: boolean;
  deleteToken?: string;
  /** Path of the node selected in the viewer (offered as an anchor for the new comment). */
  selectedPath?: string;
  onJump?: (path: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = createSignal<ShareComment[]>([]);
  const [text, setText] = createSignal('');
  const [name, setName] = createSignal(getItem(NAME_KEY) ?? '');
  const [attach, setAttach] = createSignal(true);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const load = async () => {
    try {
      setItems(await api.listComments(props.slug, props.password));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  createEffect(
    on(
      () => props.slug,
      () => void load(),
    ),
  );

  const send = async (e: Event) => {
    e.preventDefault();
    if (!text().trim() || !name().trim()) return;
    setBusy(true);
    try {
      setItem(NAME_KEY, name().trim());
      const c = await api.addComment(
        props.slug,
        {
          text: text().trim(),
          author: name().trim(),
          path: attach() && props.selectedPath ? props.selectedPath : undefined,
        },
        props.password,
      );
      setItems([...items(), c]);
      setText('');
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: ShareComment) => {
    try {
      await api.deleteComment(props.slug, c.id, props.deleteToken);
      setItems(items().filter((x) => x.id !== c.id));
      toast.success(t('comments.deleted'));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <aside class="flex h-full min-h-0 flex-col bg-surface" aria-label={t('comments.title')}>
      <div class="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 class="text-sm font-semibold">
          {t('comments.title')} <span class="text-muted">({items().length})</span>
        </h2>
        <IconButton label={t('common.close')} size="sm" onClick={props.onClose}>
          <X size={14} />
        </IconButton>
      </div>
      <ul class="min-h-0 flex-1 divide-y divide-border overflow-auto" data-testid="comment-list">
        <For each={items()} fallback={<li class="p-3 text-sm text-muted">{t('comments.empty')}</li>}>
          {(c) => (
            <li class="px-3 py-2 text-sm" data-testid="comment">
              <div class="flex items-center gap-2">
                <span class="font-semibold">{c.author}</span>
                <span class="text-xs text-muted">{fmtRelative(c.created_at)}</span>
                <Show when={props.canModerate}>
                  <button
                    class="ml-auto rounded p-1 text-danger hover:bg-danger-soft"
                    aria-label={t('common.delete')}
                    title={t('common.delete')}
                    onClick={() => void remove(c)}
                  >
                    <Trash2 size={13} />
                  </button>
                </Show>
              </div>
              <Show when={c.path}>
                <button
                  class="mb-0.5 block max-w-full truncate rounded bg-accent-soft px-1.5 font-mono text-xs text-accent hover:underline"
                  title={c.path ?? ''}
                  onClick={() => props.onJump?.(c.path as string)}
                >
                  {t('comments.on', { path: c.path as string })}
                </button>
              </Show>
              {/* plain text only: never HTML */}
              <p class="whitespace-pre-wrap break-words">{c.text}</p>
            </li>
          )}
        </For>
      </ul>
      <Show when={error()}>
        <p class="mx-3 mb-1 rounded-md bg-danger-soft p-2 text-xs text-danger" role="alert">
          {error()}
        </p>
      </Show>
      <form class="space-y-2 border-t border-border p-3" onSubmit={send}>
        <input
          aria-label={t('comments.name')}
          placeholder={t('comments.name')}
          maxLength={60}
          class="h-8 w-full rounded-md border border-border bg-surface px-2 text-sm"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <textarea
          aria-label={t('comments.placeholder')}
          placeholder={t('comments.placeholder')}
          rows="3"
          maxLength={2000}
          class="w-full rounded-md border border-border bg-surface p-2 text-sm"
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <Show when={props.selectedPath}>
          <label class="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={attach()} onChange={(e) => setAttach(e.currentTarget.checked)} />
            <span class="truncate">{t('comments.anchor', { path: props.selectedPath as string })}</span>
          </label>
        </Show>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={busy() || !text().trim() || !name().trim()}
        >
          <Send size={12} /> {t('comments.send')}
        </Button>
      </form>
    </aside>
  );
}
