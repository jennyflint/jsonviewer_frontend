import { DropdownMenu } from '@kobalte/core/dropdown-menu';
import { For, Show } from 'solid-js';
import type { JSX } from 'solid-js';

export interface MenuEntry {
  label: string;
  icon?: JSX.Element;
  onSelect?: () => void;
  disabled?: boolean;
  separator?: boolean;
  hidden?: boolean;
}

export interface MenuProps {
  /** Accessible name of the trigger button. */
  label: string;
  trigger: JSX.Element;
  items: MenuEntry[];
  triggerClass?: string;
  /** Skip the native `title` (when a richer tooltip is shown instead). */
  noTitle?: boolean;
  placement?: 'bottom-start' | 'bottom-end';
}

export function Menu(props: MenuProps) {
  return (
    <DropdownMenu placement={props.placement ?? 'bottom-end'} gutter={4}>
      <DropdownMenu.Trigger
        aria-label={props.label}
        title={props.noTitle ? undefined : props.label}
        class={
          props.triggerClass ??
          'inline-flex h-9 items-center gap-1 rounded-md px-2 text-fg hover:bg-surface-2'
        }
      >
        {props.trigger}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="menu-content">
          <For each={props.items.filter((i) => !i.hidden)}>
            {(item) => (
              <Show when={!item.separator} fallback={<DropdownMenu.Separator class="menu-sep" />}>
                <DropdownMenu.Item
                  class="menu-item"
                  disabled={item.disabled}
                  onSelect={() => item.onSelect?.()}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </DropdownMenu.Item>
              </Show>
            )}
          </For>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  );
}
