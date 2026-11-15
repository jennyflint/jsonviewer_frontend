import type { JSX } from 'solid-js';

/** Checkbox-style switch (role="switch") with a visible label. */
export function Toggle(props: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: JSX.Element;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <label
      class="inline-flex cursor-pointer items-center gap-2 text-sm"
      classList={{ 'opacity-50 cursor-not-allowed': props.disabled }}
      title={props.title}
    >
      <input
        type="checkbox"
        role="switch"
        class="h-4 w-4 accent-[var(--accent)]"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      <span>{props.label}</span>
    </label>
  );
}
