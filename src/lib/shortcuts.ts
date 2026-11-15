import { onCleanup, onMount } from 'solid-js';
import type { Key } from './i18n';

export interface ShortcutDef {
  /** `key` as in KeyboardEvent.key (case-insensitive for letters). */
  key: string;
  mod?: boolean; // Ctrl on Windows/Linux, Cmd on macOS
  shift?: boolean;
  alt?: boolean;
  /** Also fire while typing in inputs / the editor (default: only when `mod` or `alt` is set). */
  inInputs?: boolean;
  /** Only active while this returns true. */
  when?: () => boolean;
  handler: (e: KeyboardEvent) => void;
}

/** Documentation table for the shortcuts dialog (section 8.11). */
export const SHORTCUT_DOCS: { action: Key; keys: string }[] = [
  { action: 'shortcuts.format', keys: 'Mod + Shift + F' },
  { action: 'shortcuts.minify', keys: 'Mod + Shift + M' },
  { action: 'shortcuts.tabs', keys: 'Mod + 1 / Mod + 2' },
  { action: 'shortcuts.search', keys: 'Mod + F' },
  { action: 'shortcuts.share', keys: 'Mod + Shift + S' },
  { action: 'shortcuts.save', keys: 'Mod + S' },
  { action: 'shortcuts.load_url', keys: 'Mod + O' },
  { action: 'shortcuts.next_prev', keys: 'Alt + ↓ / Alt + ↑' },
  { action: 'shortcuts.help', keys: '?' },
];

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const modLabel = () => (isMac() ? '⌘' : 'Ctrl');

function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return (
    el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
  );
}

export function matches(e: KeyboardEvent, d: Omit<ShortcutDef, 'handler'>): boolean {
  const mod = e.ctrlKey || e.metaKey;
  if (!!d.mod !== mod) return false;
  if (!!d.shift !== e.shiftKey && !(d.key === '?' && e.shiftKey)) return false;
  if (!!d.alt !== e.altKey) return false;
  return e.key.toLowerCase() === d.key.toLowerCase();
}

const registry = new Set<ShortcutDef>();

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    for (const d of registry) {
      if (!matches(e, d)) continue;
      if (d.when && !d.when()) continue;
      if (!d.mod && !d.alt && !d.inInputs && isEditable(e.target)) continue;
      e.preventDefault();
      d.handler(e);
      return;
    }
  });
}

export function registerShortcut(d: ShortcutDef): () => void {
  registry.add(d);
  return () => registry.delete(d);
}

/** Register shortcuts for the lifetime of the calling component. */
export function useShortcuts(defs: ShortcutDef[]): void {
  onMount(() => {
    const offs = defs.map(registerShortcut);
    onCleanup(() => offs.forEach((o) => o()));
  });
}
