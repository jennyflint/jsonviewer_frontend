import { Search } from '../../lib/icons';
import { Toggle } from '../ui/Toggle';
import { Select } from '../ui/Select';
import { t } from '../../lib/i18n';

export interface Filters {
  q: string;
  source: string;
  pinned: boolean;
  sort: string;
  order: 'asc' | 'desc';
}

export function HistoryFilters(props: {
  value: Filters;
  qInput: string;
  onQInput: (v: string) => void;
  onChange: (patch: Partial<Filters>) => void;
}) {
  return (
    <div class="flex flex-wrap items-center gap-2" role="search">
      <div class="relative min-w-[180px] flex-1">
        <Search size={14} class="pointer-events-none absolute left-2 top-2.5 text-muted" aria-hidden="true" />
        <input
          type="search"
          aria-label={t('history.search')}
          placeholder={t('history.search')}
          class="h-9 w-full rounded-md border border-border bg-surface pl-7 pr-2 text-sm"
          value={props.qInput}
          onInput={(e) => props.onQInput(e.currentTarget.value)}
        />
      </div>
      <Select
        label={t('history.source_all')}
        value={props.value.source}
        onChange={(v) => props.onChange({ source: v })}
        options={[
          { value: '', label: t('history.source_all') },
          { value: 'manual', label: t('history.source_manual') },
          { value: 'format', label: t('history.source_format') },
          { value: 'share', label: t('history.source_share') },
          { value: 'url', label: t('history.source_url') },
          { value: 'compare', label: t('history.source_compare') },
        ]}
      />
      <Select
        label={t('history.sort')}
        value={props.value.sort}
        onChange={(v) => props.onChange({ sort: v })}
        options={[
          { value: 'updated_at', label: `${t('history.sort')}: ${t('history.sort_updated')}` },
          { value: 'created_at', label: `${t('history.sort')}: ${t('history.sort_created')}` },
          { value: 'title', label: `${t('history.sort')}: ${t('history.sort_title')}` },
          { value: 'size', label: `${t('history.sort')}: ${t('history.sort_size')}` },
        ]}
      />
      <Select
        label={t('history.order')}
        value={props.value.order}
        onChange={(v) => props.onChange({ order: v })}
        options={[
          { value: 'desc', label: t('history.order_desc') },
          { value: 'asc', label: t('history.order_asc') },
        ]}
      />
      <Toggle
        checked={props.value.pinned}
        onChange={(v) => props.onChange({ pinned: v })}
        label={t('history.pinned_only')}
      />
    </div>
  );
}
