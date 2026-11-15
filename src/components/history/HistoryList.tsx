import { For, Show } from 'solid-js';
import { HistoryItemRow } from './HistoryItem';
import type { HistoryItem } from '../../lib/api/endpoints';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Spinner';
import { t } from '../../lib/i18n';

export interface HistoryActions {
  onOpen: (i: HistoryItem) => void;
  onRename: (i: HistoryItem, title: string) => void;
  onPin: (i: HistoryItem) => void;
  onShare: (i: HistoryItem) => void;
  onDelete: (i: HistoryItem) => void;
}

export function HistoryList(props: {
  items: HistoryItem[];
  loading: boolean;
  hasMore: boolean;
  filtered: boolean;
  selected: Set<string>;
  onSelect: (id: string, v: boolean) => void;
  onLoadMore: () => void;
  actions: HistoryActions;
}) {
  return (
    <div>
      <Show when={props.loading && props.items.length === 0}>
        <div class="space-y-2 p-3" aria-busy="true">
          <Skeleton class="h-14 w-full" />
          <Skeleton class="h-14 w-full" />
          <Skeleton class="h-14 w-full" />
        </div>
      </Show>
      <Show when={!props.loading && props.items.length === 0}>
        <Show
          when={props.filtered}
          fallback={
            <div class="mx-auto max-w-md p-8 text-center" data-testid="history-empty">
              <h2 class="text-lg font-semibold">{t('history.empty_title')}</h2>
              <p class="mt-2 text-sm text-muted">{t('history.empty_text')}</p>
            </div>
          }
        >
          <p class="p-6 text-center text-sm text-muted">{t('history.no_results')}</p>
        </Show>
      </Show>
      <ul>
        <For each={props.items}>
          {(i) => (
            <HistoryItemRow
              item={i}
              selected={props.selected.has(i.id)}
              onSelect={(v) => props.onSelect(i.id, v)}
              onOpen={() => props.actions.onOpen(i)}
              onRename={(title) => props.actions.onRename(i, title)}
              onPin={() => props.actions.onPin(i)}
              onShare={() => props.actions.onShare(i)}
              onDelete={() => props.actions.onDelete(i)}
            />
          )}
        </For>
      </ul>
      <Show when={props.hasMore}>
        <div class="p-3 text-center">
          <Button onClick={props.onLoadMore} disabled={props.loading}>
            {props.loading ? t('common.loading') : t('history.load_more')}
          </Button>
        </div>
      </Show>
    </div>
  );
}
