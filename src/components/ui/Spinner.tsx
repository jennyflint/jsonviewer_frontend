import { Loader2 } from 'lucide-solid';
import { t } from '../../lib/i18n';

export function Spinner(props: { size?: number; label?: string }) {
  return (
    <span role="status" class="inline-flex items-center gap-2 text-muted">
      <Loader2 size={props.size ?? 16} class="animate-spin" aria-hidden="true" />
      <span class="sr-only">{props.label ?? t('common.loading')}</span>
    </span>
  );
}

export function Skeleton(props: { class?: string }) {
  return <div class={`skeleton ${props.class ?? 'h-4 w-full'}`} aria-hidden="true" />;
}
