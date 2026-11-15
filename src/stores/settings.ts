import { createEffect, createRoot } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { getJSON, setJSON } from '../lib/storage';
import type { Indent } from '../lib/json/format';

export type Theme = 'light' | 'dark' | 'system';
export type Lang = 'en' | 'uk';

export interface Settings {
  theme: Theme;
  language: Lang;
  indent: Indent;
  treeFontSize: number;
  /** Documents larger than this (bytes) are not parsed automatically while typing. */
  autoParseThreshold: number;
  autosaveDraft: boolean;
  saveToHistory: boolean;
  diffView: 'split' | 'unified';
  diffIgnoreKeyOrder: boolean;
  diffContextLines: number;
}

const KEY = 'jv.settings.v1';

export function detectLanguage(): Lang {
  try {
    return navigator.language?.toLowerCase().startsWith('uk') ? 'uk' : 'en';
  } catch {
    return 'en';
  }
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  language: detectLanguage(),
  indent: 2,
  treeFontSize: 13,
  autoParseThreshold: 1024 * 1024,
  autosaveDraft: true,
  saveToHistory: true,
  diffView: 'split',
  diffIgnoreKeyOrder: true,
  diffContextLines: 3,
};

function load(): Settings {
  const stored = getJSON<Partial<Settings>>(KEY, {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export const [settings, setSettings] = createStore<Settings>(load());

export function updateSettings(patch: Partial<Settings>): void {
  setSettings(patch);
}

export function resetSettings(): void {
  setSettings(reconcile({ ...DEFAULT_SETTINGS }));
}

export function resolvedTheme(): 'light' | 'dark' {
  if (settings.theme !== 'system') return settings.theme;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Persist settings and apply theme / language attributes. Call once from the app root. */
export function initSettingsEffects(): void {
  createRoot(() => {
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      /* no matchMedia */
    }
    createEffect(() => {
      const t = settings.theme;
      const apply = () => {
        document.documentElement.dataset.theme = t === 'system' ? (mq?.matches ? 'dark' : 'light') : t;
      };
      apply();
      if (t === 'system') {
        mq?.addEventListener('change', apply);
        return () => mq?.removeEventListener('change', apply);
      }
    });
    createEffect(() => {
      document.documentElement.lang = settings.language;
    });
    createEffect(() => {
      document.documentElement.style.setProperty('--tree-font-size', `${settings.treeFontSize}px`);
    });
    createEffect(() => {
      setJSON(KEY, { ...settings });
    });
  });
}
