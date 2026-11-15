import { A } from '@solidjs/router';
import { Show } from 'solid-js';
import { Braces, Keyboard, Languages, Settings as SettingsIcon } from 'lucide-solid';
import { createSignal } from 'solid-js';
import { Dialog } from '../ui/Dialog';
import { SettingsForm } from './SettingsForm';
import { IconButton } from '../ui/Button';
import { Menu } from '../ui/Menu';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { auth } from '../../stores/auth';
import { settings, updateSettings } from '../../stores/settings';
import { t } from '../../lib/i18n';

const navCls = 'rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg';

export function Header(props: { onShortcuts: () => void }) {
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  return (
    <header class="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
      <A href="/" class="mr-2 flex items-center gap-2 font-semibold">
        <Braces size={20} class="text-accent" aria-hidden="true" />
        <span>{t('app.name')}</span>
      </A>
      <nav aria-label={t('nav.label')} class="flex items-center gap-1">
        <A href="/" end class={navCls} activeClass="!bg-accent-soft !text-accent">
          {t('nav.viewer')}
        </A>
        <A href="/compare" class={navCls} activeClass="!bg-accent-soft !text-accent">
          {t('nav.compare')}
        </A>
        <Show when={auth.status === 'authenticated'}>
          <A href="/history" class={navCls} activeClass="!bg-accent-soft !text-accent">
            {t('nav.history')}
          </A>
        </Show>
      </nav>
      <div class="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <Menu
          label={t('lang.label')}
          trigger={
            <span class="inline-flex items-center gap-1">
              <Languages size={16} />
              <span class="text-xs font-semibold uppercase">{settings.language}</span>
            </span>
          }
          items={[
            { label: 'English', onSelect: () => updateSettings({ language: 'en' }) },
            { label: 'Українська', onSelect: () => updateSettings({ language: 'uk' }) },
          ]}
        />
        <IconButton label={t('shortcuts.title')} onClick={props.onShortcuts}>
          <Keyboard size={16} />
        </IconButton>
        <IconButton label={t('settings.title')} onClick={() => setSettingsOpen(true)}>
          <SettingsIcon size={16} />
        </IconButton>
        <UserMenu />
      </div>
      <Dialog open={settingsOpen()} onOpenChange={setSettingsOpen} title={t('settings.title')} wide>
        <SettingsForm />
      </Dialog>
    </header>
  );
}
