import { createSignal, onCleanup } from 'solid-js';
import type { JSX } from 'solid-js';
import { t } from '../../lib/i18n';

/** Two panes with a draggable / keyboard-resizable divider. Stacks vertically on narrow screens. */
export function SplitPane(props: {
  left: JSX.Element;
  right: JSX.Element;
  initial?: number;
  min?: number;
  storageKey?: string;
}) {
  const min = props.min ?? 20;
  const [pct, setPct] = createSignal(props.initial ?? 50);
  let host!: HTMLDivElement;
  let dragging = false;

  const move = (e: PointerEvent) => {
    if (!dragging) return;
    const r = host.getBoundingClientRect();
    setPct(Math.min(100 - min, Math.max(min, ((e.clientX - r.left) / r.width) * 100)));
  };
  const up = () => {
    dragging = false;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  onCleanup(up);

  return (
    <div ref={host} class="flex h-full min-h-0 flex-col md:flex-row" style={{ '--split': `${pct()}%` }}>
      <div class="min-h-0 min-w-0 flex-1 md:flex-none md:basis-[var(--split)]">{props.left}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('common.resize')}
        aria-valuenow={Math.round(pct())}
        tabindex="0"
        class="hidden w-1.5 shrink-0 cursor-col-resize bg-border hover:bg-accent md:block"
        onPointerDown={(e) => {
          dragging = true;
          e.preventDefault();
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setPct((p) => Math.max(min, p - 3));
          if (e.key === 'ArrowRight') setPct((p) => Math.min(100 - min, p + 3));
        }}
      />
      <div class="min-h-0 min-w-0 flex-1">{props.right}</div>
    </div>
  );
}
