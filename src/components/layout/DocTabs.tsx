import { Plus, X } from '../../lib/icons';
import { For, Show, createSignal } from 'solid-js';
import {
  MAX_TABS,
  activateTab,
  activeTabId,
  closeTab,
  newTab,
  renameTab,
  storeFor,
  tabs,
} from '../../stores/tabs';
import { confirmAction } from '../../stores/confirm';
import { toast } from '../../stores/toasts';
import { t } from '../../lib/i18n';

/** Strip of open documents ("tabs"): switch, add, rename (double-click) and close. */
export function DocTabs() {
  const [editing, setEditing] = createSignal<string | null>(null);
  const label = (title: string, i: number) => title || t('tabs.untitled', { n: i + 1 });

  const close = async (id: string) => {
    const store = storeFor(id);
    if (store.doc.text.trim() !== '') {
      const ok = await confirmAction({
        title: t('doctabs.close_title'),
        message: t('doctabs.close_message'),
        confirmLabel: t('doctabs.close'),
        danger: true,
      });
      if (!ok) return;
    }
    closeTab(id);
  };

  return (
    <div
      class="flex items-center gap-1 overflow-x-auto border-b border-border bg-surface-2 px-2 pt-1"
      role="tablist"
      aria-label={t('doctabs.label')}
    >
      <For each={tabs()}>
        {(tab, i) => (
          <div
            class="group flex max-w-[220px] items-center rounded-t-md border border-b-0 text-sm"
            classList={{
              'border-border bg-surface font-medium': tab.id === activeTabId(),
              'border-transparent text-muted hover:bg-surface': tab.id !== activeTabId(),
            }}
          >
            <Show
              when={editing() === tab.id}
              fallback={
                <button
                  role="tab"
                  aria-selected={tab.id === activeTabId()}
                  class="min-w-0 flex-1 truncate px-3 py-1 text-left"
                  title={t('doctabs.rename_hint')}
                  onClick={() => activateTab(tab.id)}
                  onDblClick={() => setEditing(tab.id)}
                >
                  {label(tab.title, i())}
                </button>
              }
            >
              <input
                aria-label={t('doctabs.rename')}
                class="mx-1 h-6 w-32 rounded border border-border bg-surface px-1 text-sm"
                value={tab.title}
                autofocus
                maxLength={60}
                onBlur={(e) => {
                  renameTab(tab.id, e.currentTarget.value);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setEditing(null);
                }}
              />
            </Show>
            <button
              class="mr-1 rounded p-0.5 text-muted hover:bg-surface-2 hover:text-fg"
              aria-label={`${t('doctabs.close')}: ${label(tab.title, i())}`}
              title={t('doctabs.close')}
              onClick={() => void close(tab.id)}
            >
              <X size={12} />
            </button>
          </div>
        )}
      </For>
      <button
        class="mb-0.5 rounded p-1 text-muted hover:bg-surface hover:text-fg"
        aria-label={t('doctabs.new')}
        title={t('doctabs.new')}
        onClick={() => {
          if (newTab() === null) toast.error(t('doctabs.limit', { n: MAX_TABS }));
        }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
