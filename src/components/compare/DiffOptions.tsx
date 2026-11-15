import { Toggle } from '../ui/Toggle';
import { compare, setCompareOptions } from '../../stores/compare';
import { t } from '../../lib/i18n';

export function DiffOptionsBar() {
  return (
    <div
      class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface px-3 py-1.5"
      role="group"
      aria-label={t('compare.options')}
    >
      <Toggle
        checked={compare.options.ignoreKeyOrder}
        onChange={(v) => setCompareOptions({ ignoreKeyOrder: v })}
        label={t('compare.opt_ignore_key_order')}
      />
      <Toggle
        checked={compare.options.ignoreArrayOrder}
        onChange={(v) => setCompareOptions({ ignoreArrayOrder: v })}
        label={t('compare.opt_ignore_array_order')}
      />
      <label class="inline-flex items-center gap-2 text-sm">
        {t('compare.opt_match_key')}
        <input
          class="h-8 w-24 rounded-md border border-border bg-surface px-2 font-mono text-sm"
          placeholder={t('compare.opt_match_key_placeholder')}
          value={compare.options.arrayMatchKey}
          onInput={(e) => setCompareOptions({ arrayMatchKey: e.currentTarget.value })}
        />
      </label>
      <Toggle
        checked={compare.options.ignoreWhitespace}
        onChange={(v) => setCompareOptions({ ignoreWhitespace: v })}
        label={t('compare.opt_ignore_ws')}
      />
    </div>
  );
}
