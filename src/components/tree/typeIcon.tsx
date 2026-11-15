import type { JSX } from 'solid-js';
import { T_ARRAY, T_FALSE, T_NULL, T_NUMBER, T_OBJECT, T_STRING, T_TRUE } from '../../lib/json/parser';

const base = 'inline-flex w-6 shrink-0 justify-center text-[11px] font-bold';

/** Compact glyph per JSON type: {} [] "abc" 123 true/false null. */
export function typeIcon(type: number): JSX.Element {
  switch (type) {
    case T_OBJECT:
      return (
        <span class={base} style={{ color: 'var(--muted)' }} aria-hidden="true">
          {'{}'}
        </span>
      );
    case T_ARRAY:
      return (
        <span class={base} style={{ color: 'var(--muted)' }} aria-hidden="true">
          {'[]'}
        </span>
      );
    case T_STRING:
      return (
        <span class={base} style={{ color: 'var(--t-string)' }} aria-hidden="true">
          "a"
        </span>
      );
    case T_NUMBER:
      return (
        <span class={base} style={{ color: 'var(--t-number)' }} aria-hidden="true">
          123
        </span>
      );
    case T_TRUE:
    case T_FALSE:
      return (
        <span class={base} style={{ color: 'var(--t-bool)' }} aria-hidden="true">
          T/F
        </span>
      );
    case T_NULL:
    default:
      return (
        <span class={base} style={{ color: 'var(--t-null)' }} aria-hidden="true">
          ∅
        </span>
      );
  }
}

export function typeColor(type: number): string {
  switch (type) {
    case T_STRING:
      return 'var(--t-string)';
    case T_NUMBER:
      return 'var(--t-number)';
    case T_TRUE:
    case T_FALSE:
      return 'var(--t-bool)';
    case T_NULL:
      return 'var(--t-null)';
    default:
      return 'var(--muted)';
  }
}
