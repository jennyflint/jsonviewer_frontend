import { For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { MoreHorizontal } from 'lucide-solid';
import { Button } from '../ui/Button';
import { Menu } from '../ui/Menu';
import type { MenuEntry } from '../ui/Menu';
import { createIsMobile } from '../../lib/media';
import { t } from '../../lib/i18n';

export interface ToolbarAction {
  id: string;
  label: string;
  icon: JSX.Element;
  onClick: () => void;
  disabled?: boolean;
  hidden?: boolean;
  title?: string;
  /** Kept visible on mobile; everything else moves into the "More" menu. */
  primary?: boolean;
  badge?: JSX.Element;
  active?: boolean;
}

/** Toolbar that collapses its secondary actions into a "More" menu on narrow screens. */
export function EditorToolbar(props: { actions: ToolbarAction[]; extra?: JSX.Element; label?: string }) {
  const mobile = createIsMobile();
  const visible = () => props.actions.filter((a) => !a.hidden);
  const inline = () => (mobile() ? visible().filter((a) => a.primary) : visible());
  const overflow = (): MenuEntry[] =>
    mobile()
      ? visible()
          .filter((a) => !a.primary)
          .map((a) => ({ label: a.label, icon: a.icon, onSelect: a.onClick, disabled: a.disabled }))
      : [];
  return (
    <div
      role="toolbar"
      aria-label={props.label ?? t('toolbar.label')}
      class="flex flex-wrap items-center gap-1.5 border-b border-border bg-surface px-2 py-1.5"
    >
      <For each={inline()}>
        {(a) => (
          <Button
            size="sm"
            variant={a.active ? 'primary' : 'secondary'}
            onClick={a.onClick}
            disabled={a.disabled}
            title={a.title ?? a.label}
            aria-pressed={a.active === undefined ? undefined : a.active}
          >
            {a.icon}
            <span>{a.label}</span>
            {a.badge}
          </Button>
        )}
      </For>
      <Show when={overflow().length > 0}>
        <Menu label={t('toolbar.more')} trigger={<MoreHorizontal size={16} />} items={overflow()} />
      </Show>
      {props.extra}
    </div>
  );
}
