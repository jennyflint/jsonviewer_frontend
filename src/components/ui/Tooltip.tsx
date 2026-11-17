import { createSignal, createUniqueId } from 'solid-js';
import type { JSX } from 'solid-js';

/** Rich tooltip shown on hover and keyboard focus (role="tooltip", linked with aria-describedby, Esc hides it). */
export function Tooltip(props: {
  content: JSX.Element;
  children: JSX.Element;
  class?: string;
  align?: 'left' | 'right';
}) {
  const id = createUniqueId();
  const [open, setOpen] = createSignal(false);
  return (
    <span
      class={`relative inline-flex ${props.class ?? ''}`}
      aria-describedby={open() ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusIn={() => setOpen(true)}
      onFocusOut={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      onClick={() => setOpen(false)}
    >
      {props.children}
      <span
        id={id}
        role="tooltip"
        hidden={!open()}
        class={`absolute top-full z-[60] ${props.align === 'left' ? 'left-0' : 'right-0'} mt-2 w-72 rounded-lg border border-border bg-surface p-3 text-left text-sm font-normal text-fg shadow-lg`}
      >
        {props.content}
      </span>
    </span>
  );
}
