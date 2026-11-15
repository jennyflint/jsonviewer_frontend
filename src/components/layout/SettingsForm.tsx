import { For } from 'solid-js';
import { Select } from '../ui/Select';
import { Toggle } from '../ui/Toggle';
import { KEY_TYPES, settings, updateSettings } from '../../stores/settings';
import type { KeyType } from '../../stores/settings';
import { t } from '../../lib/i18n';
import type { Indent } from '../../lib/json/format';

/** Current colour of a key type: the custom one, else the theme default read from CSS. */
function keyColor(k: KeyType): string {
  const custom = settings.keyColors?.[k];
  if (custom) return custom;
  void settings.theme; // re-read the default when the theme changes
  const v =
    typeof document === 'undefined'
      ? ''
      : getComputedStyle(document.documentElement).getPropertyValue(`--k-${k}`).trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000';
}

function setKeyColor(k: KeyType, color: string | undefined): void {
  const next = { ...settings.keyColors };
  if (color) next[k] = color;
  else delete next[k];
  updateSettings({ keyColors: next });
}

/** All persisted preferences (theme, language, indent, tree font, thresholds, diff defaults). */
export function SettingsForm() {
  return (
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="flex flex-col gap-1 text-sm">
        {t('settings.theme')}
        <Select
          label={t('settings.theme')}
          value={settings.theme}
          onChange={(v) => updateSettings({ theme: v })}
          options={[
            { value: 'system', label: t('theme.system') },
            { value: 'light', label: t('theme.light') },
            { value: 'dark', label: t('theme.dark') },
          ]}
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        {t('settings.language')}
        <Select
          label={t('settings.language')}
          value={settings.language}
          onChange={(v) => updateSettings({ language: v })}
          options={[
            { value: 'en', label: 'English' },
            { value: 'uk', label: 'Українська' },
          ]}
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        {t('settings.indent')}
        <Select
          label={t('settings.indent')}
          value={String(settings.indent)}
          onChange={(v) => updateSettings({ indent: (v === '\t' ? '\t' : Number(v)) as Indent })}
          options={[
            { value: '2', label: t('toolbar.indent_2') },
            { value: '4', label: t('toolbar.indent_4') },
            { value: '\t', label: t('toolbar.indent_tab') },
          ]}
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        {t('settings.tree_font')}
        <input
          type="number"
          min="10"
          max="20"
          class="h-9 rounded-md border border-border bg-surface px-2"
          value={settings.treeFontSize}
          onInput={(e) =>
            updateSettings({
              treeFontSize: Math.min(20, Math.max(10, Number(e.currentTarget.value) || 13)),
            })
          }
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        {t('settings.auto_parse')}
        <input
          type="number"
          min="64"
          step="64"
          class="h-9 rounded-md border border-border bg-surface px-2"
          value={Math.round(settings.autoParseThreshold / 1024)}
          onInput={(e) =>
            updateSettings({
              autoParseThreshold: Math.max(64, Number(e.currentTarget.value) || 1024) * 1024,
            })
          }
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        {t('settings.diff_context')}
        <input
          type="number"
          min="0"
          max="50"
          class="h-9 rounded-md border border-border bg-surface px-2"
          value={settings.diffContextLines}
          onInput={(e) =>
            updateSettings({
              diffContextLines: Math.min(50, Math.max(0, Number(e.currentTarget.value) || 0)),
            })
          }
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        {t('settings.diff_view')}
        <Select
          label={t('settings.diff_view')}
          value={settings.diffView}
          onChange={(v) => updateSettings({ diffView: v })}
          options={[
            { value: 'split', label: t('compare.view_split') },
            { value: 'unified', label: t('compare.view_unified') },
          ]}
        />
      </label>
      <div class="flex flex-col justify-center gap-2">
        <Toggle
          checked={settings.autosaveDraft}
          onChange={(v) => updateSettings({ autosaveDraft: v })}
          label={t('settings.autosave_draft')}
        />
        <Toggle
          checked={settings.saveToHistory}
          onChange={(v) => updateSettings({ saveToHistory: v })}
          label={t('settings.autosave_history')}
        />
        <Toggle
          checked={settings.diffIgnoreKeyOrder}
          onChange={(v) => updateSettings({ diffIgnoreKeyOrder: v })}
          label={t('settings.diff_ignore_key_order')}
        />
      </div>
      <fieldset class="rounded-md border border-border p-3 sm:col-span-2">
        <legend class="px-1 text-sm font-medium">{t('settings.key_colors')}</legend>
        <div class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <For each={KEY_TYPES}>
            {(k) => (
              <div class="flex items-center gap-2 text-sm">
                <input
                  type="color"
                  class="h-7 w-9 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  aria-label={t(`settings.key_${k}` as const)}
                  value={keyColor(k)}
                  onInput={(e) => setKeyColor(k, e.currentTarget.value)}
                />
                <span class="font-semibold" style={{ color: `var(--k-${k})` }}>
                  {t(`settings.key_${k}` as const)}
                </span>
                {settings.keyColors?.[k] && (
                  <button
                    type="button"
                    class="text-xs text-muted underline"
                    onClick={() => setKeyColor(k, undefined)}
                  >
                    {t('settings.key_reset')}
                  </button>
                )}
              </div>
            )}
          </For>
        </div>
        <button
          type="button"
          class="mt-2 text-xs text-accent underline"
          onClick={() => updateSettings({ keyColors: {} })}
        >
          {t('settings.key_reset_all')}
        </button>
      </fieldset>
    </div>
  );
}
