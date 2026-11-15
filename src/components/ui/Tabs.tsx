import { Tabs as K } from '@kobalte/core/tabs';
import { For } from 'solid-js';
import type { JSX } from 'solid-js';

export interface TabDef {
  id: string;
  label: string;
  icon?: JSX.Element;
}

export function TabList(props: {
  tabs: TabDef[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  children?: JSX.Element;
}) {
  return (
    <K value={props.value} onChange={props.onChange} aria-label={props.label}>
      <K.List class="flex items-center gap-1 border-b border-border">
        <For each={props.tabs}>
          {(tab) => (
            <K.Trigger
              value={tab.id}
              class="-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted hover:text-fg data-[selected]:border-accent data-[selected]:text-fg"
            >
              {tab.icon}
              {tab.label}
            </K.Trigger>
          )}
        </For>
        {props.children}
      </K.List>
    </K>
  );
}
