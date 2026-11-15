import { For } from 'solid-js';

export interface Option<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

export function Select<T extends string | number>(props: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  label: string;
  class?: string;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      class={`h-9 rounded-md border border-border bg-surface px-2 text-sm text-fg ${props.class ?? ''}`}
      value={String(props.value)}
      onChange={(e) => {
        const raw = e.currentTarget.value;
        const opt = props.options.find((o) => String(o.value) === raw);
        if (opt) props.onChange(opt.value);
      }}
    >
      <For each={props.options}>
        {(o) => (
          <option value={String(o.value)} disabled={o.disabled} selected={o.value === props.value}>
            {o.label}
          </option>
        )}
      </For>
    </select>
  );
}
