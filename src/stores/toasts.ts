import { createSignal } from 'solid-js';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
  detail?: string;
  action?: { label: string; run: () => void };
}

const [toasts, setToasts] = createSignal<Toast[]>([]);
let seq = 0;

export { toasts };

export function clearToasts(): void {
  setToasts([]);
}

export function dismissToast(id: number): void {
  setToasts((l) => l.filter((t) => t.id !== id));
}

export function pushToast(t: Omit<Toast, 'id'>, ttl = 5000): number {
  const id = ++seq;
  setToasts((l) => [...l.slice(-4), { ...t, id }]);
  if (ttl > 0) setTimeout(() => dismissToast(id), t.action ? Math.max(ttl, 8000) : ttl);
  return id;
}

export const toast = {
  success: (message: string, extra: Partial<Omit<Toast, 'id' | 'kind' | 'message'>> = {}) =>
    pushToast({ kind: 'success', message, ...extra }),
  info: (message: string, extra: Partial<Omit<Toast, 'id' | 'kind' | 'message'>> = {}) =>
    pushToast({ kind: 'info', message, ...extra }),
  error: (message: string, extra: Partial<Omit<Toast, 'id' | 'kind' | 'message'>> = {}) =>
    pushToast({ kind: 'error', message, ...extra }, 8000),
};
