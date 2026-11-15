import { Check, ExternalLink, Link2, Pencil, Pin, PinOff, Share2, Trash2, X } from 'lucide-solid';
import { Show, createSignal } from 'solid-js';
import { IconButton } from '../ui/Button';
import type { HistoryItem as Item } from '../../lib/api/endpoints';
import { fmtDate, fmtRelative, fmtSize, t } from '../../lib/i18n';
import type { Key } from '../../lib/i18n';

const SOURCE_KEY: Record<string, Key> = {
  manual: 'history.source_manual',
  format: 'history.source_format',
  share: 'history.source_share',
  url: 'history.source_url',
  compare: 'history.source_compare',
};

export function HistoryItemRow(props: {
  item: Item;
  selected: boolean;
  onSelect: (v: boolean) => void;
  onOpen: () => void;
  onRename: (title: string) => void;
  onPin: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal('');
  const commit = () => {
    const v = draft().trim();
    setEditing(false);
    if (v && v !== props.item.title) props.onRename(v);
  };
  return (
    <li
      class="flex items-start gap-3 border-b border-border px-3 py-2.5 hover:bg-surface-2"
      data-testid="history-item"
    >
      <input
        type="checkbox"
        class="mt-1.5 h-4 w-4 accent-[var(--accent)]"
        aria-label={`${t('history.select')}: ${props.item.title}`}
        checked={props.selected}
        onChange={(e) => props.onSelect(e.currentTarget.checked)}
      />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <Show when={props.item.pinned}>
            <Pin size={13} class="text-accent" aria-label={t('history.pin')} />
          </Show>
          <Show
            when={editing()}
            fallback={
              <button
                class="truncate text-left text-sm font-medium hover:text-accent"
                onClick={props.onOpen}
                title={props.item.title}
              >
                {props.item.title}
              </button>
            }
          >
            <input
              class="h-7 min-w-0 flex-1 rounded border border-border bg-surface px-2 text-sm"
              aria-label={t('history.rename_label')}
              value={draft()}
              autofocus
              maxLength={200}
              onInput={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
            <IconButton label={t('common.save')} size="sm" onClick={commit}>
              <Check size={14} />
            </IconButton>
            <IconButton label={t('common.cancel')} size="sm" onClick={() => setEditing(false)}>
              <X size={14} />
            </IconButton>
          </Show>
          <span class="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
            {t(SOURCE_KEY[props.item.source] ?? 'history.source_manual')}
          </span>
          <Show when={!props.item.is_valid_json}>
            <span class="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] text-warn">
              {t('history.invalid')}
            </span>
          </Show>
          <Show when={props.item.share_slug}>
            <a
              class="inline-flex shrink-0 items-center gap-1 text-xs text-accent underline"
              href={`/s/${props.item.share_slug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Link2 size={12} /> {t('history.shared')}
            </a>
          </Show>
        </div>
        <div class="truncate font-mono text-xs text-muted" title={props.item.preview}>
          {props.item.preview}
        </div>
        <div class="text-xs text-muted">
          {fmtSize(props.item.size_bytes)} ·{' '}
          <time datetime={props.item.updated_at} title={fmtDate(props.item.updated_at)}>
            {fmtRelative(props.item.updated_at)}
          </time>
        </div>
      </div>
      <div class="flex shrink-0 items-center">
        <IconButton label={t('history.open')} size="sm" onClick={props.onOpen}>
          <ExternalLink size={14} />
        </IconButton>
        <IconButton
          label={t('history.rename')}
          size="sm"
          onClick={() => {
            setDraft(props.item.title);
            setEditing(true);
          }}
        >
          <Pencil size={14} />
        </IconButton>
        <IconButton
          label={props.item.pinned ? t('history.unpin') : t('history.pin')}
          size="sm"
          active={props.item.pinned}
          onClick={props.onPin}
        >
          {props.item.pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </IconButton>
        <IconButton label={t('history.share')} size="sm" onClick={props.onShare}>
          <Share2 size={14} />
        </IconButton>
        <IconButton label={t('history.delete')} size="sm" onClick={props.onDelete}>
          <Trash2 size={14} class="text-danger" />
        </IconButton>
      </div>
    </li>
  );
}
