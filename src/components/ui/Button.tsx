import { splitProps } from 'solid-js';
import type { JSX, ParentProps } from 'solid-js';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const base =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap select-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'bg-surface border border-border text-fg hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-danger text-accent-fg hover:opacity-90',
};
const sizes: Record<Size, string> = { sm: 'h-7 px-2 text-xs', md: 'h-9 px-3 text-sm' };

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button(props: ParentProps<ButtonProps>) {
  const [l, rest] = splitProps(props, ['variant', 'size', 'class', 'children']);
  return (
    <button
      type="button"
      {...rest}
      class={`${base} ${variants[l.variant ?? 'secondary']} ${sizes[l.size ?? 'md']} ${l.class ?? ''}`}
    >
      {l.children}
    </button>
  );
}

export interface IconButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Required: icon-only buttons must have an accessible name (also used as the tooltip). */
  label: string;
  size?: Size;
  active?: boolean;
}

export function IconButton(props: ParentProps<IconButtonProps>) {
  const [l, rest] = splitProps(props, ['label', 'size', 'active', 'class', 'children']);
  return (
    <button
      type="button"
      {...rest}
      aria-label={l.label}
      title={l.label}
      class={`${base} ${l.active ? 'bg-accent-soft text-accent' : 'text-fg hover:bg-surface-2'} ${l.size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'} ${l.class ?? ''}`}
    >
      {l.children}
    </button>
  );
}
