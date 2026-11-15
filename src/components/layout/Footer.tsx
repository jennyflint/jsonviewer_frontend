import { createSignal, onCleanup, onMount } from 'solid-js';
import { api } from '../../lib/api/endpoints';
import { t } from '../../lib/i18n';

export function Footer() {
  const [up, setUp] = createSignal<boolean | null>(null);
  onMount(() => {
    const check = () =>
      api.health().then(
        () => setUp(true),
        () => setUp(false),
      );
    void check();
    const id = setInterval(check, 60_000);
    onCleanup(() => clearInterval(id));
  });
  return (
    <footer class="flex items-center justify-between border-t border-border bg-surface px-3 py-1 text-xs text-muted">
      <span>{t('footer.privacy')}</span>
      <span class="inline-flex items-center gap-1.5" title={t('footer.api_status')}>
        <span
          class="inline-block h-2 w-2 rounded-full"
          classList={{ 'bg-ok': up() === true, 'bg-danger': up() === false, 'bg-muted': up() === null }}
          aria-hidden="true"
        />
        {up() === null ? t('footer.api_checking') : up() ? t('footer.api_online') : t('footer.api_offline')}
      </span>
    </footer>
  );
}
