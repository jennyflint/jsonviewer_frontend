import { createSignal } from 'solid-js';

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** The user must type this text to enable the confirm button. */
  requireText?: string;
}

interface Pending extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

const [pending, setPending] = createSignal<Pending | null>(null);
export { pending as pendingConfirm };

export function confirmAction(req: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    pending()?.resolve(false);
    setPending({ ...req, resolve });
  });
}

export function resolveConfirm(ok: boolean): void {
  const p = pending();
  setPending(null);
  p?.resolve(ok);
}
