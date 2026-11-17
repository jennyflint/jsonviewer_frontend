import { For, Show, createMemo } from 'solid-js';
import type { JSX } from 'solid-js';
import { MoreHorizontal } from '../../lib/icons';
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
  // `props.actions` is a getter that rebuilds every action (and its icon): evaluate it once per change
  const list = createMemo(() => props.actions);
  const visible = createMemo(() => list().filter((a) => !a.hidden));
  const inline = createMemo(() => (mobile() ? visible().filter((a) => a.primary) : visible()));
  const ids = createMemo(() =>
    inline()
      .map((x) => x.id)
      .join('\u0000'),
  );
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
      {/* keyed by id: the buttons keep their DOM nodes (and keyboard focus) while their state changes */}
      <For each={ids() ? ids().split('\u0000') : []}>
        {(id) => {
          const a = createMemo(() => inline().find((x) => x.id === id) as ToolbarAction);
          return (
            <Show when={inline().some((x) => x.id === id)}>
              <Button
                size="sm"
                variant={a().active ? 'primary' : 'secondary'}
                onClick={() => a().onClick()}
                disabled={a().disabled}
                title={a().title ?? a().label}
                aria-pressed={a().active === undefined ? undefined : a().active}
              >
                {a().icon}
                <span>{a().label}</span>
                {a().badge}
              </Button>
            </Show>
          );
        }}
      </For>
      <Show when={overflow().length > 0}>
        <Menu label={t('toolbar.more')} trigger={<MoreHorizontal size={16} />} items={overflow()} />
      </Show>
      {props.extra}
    </div>
  );
}
