import { A } from '@solidjs/router';
import { t } from '../lib/i18n';

export default function NotFoundPage() {
  return (
    <div class="mx-auto max-w-md p-10 text-center">
      <h1 class="text-2xl font-semibold">{t('notfound.title')}</h1>
      <p class="mt-2 text-muted">{t('notfound.text')}</p>
      <A href="/" class="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-accent-fg">
        {t('notfound.home')}
      </A>
    </div>
  );
}
