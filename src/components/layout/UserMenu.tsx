import { A, useNavigate } from '@solidjs/router';
import { Show } from 'solid-js';
import { History, LogIn, LogOut, User as UserIcon } from 'lucide-solid';
import { Menu } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';
import { For } from 'solid-js';
import { auth, login, logout } from '../../stores/auth';
import { t } from '../../lib/i18n';
import { Toggle } from '../ui/Toggle';
import { settings, updateSettings } from '../../stores/settings';

export const providerLabel = (p: string) => (p === 'google' ? 'Google' : p === 'github' ? 'GitHub' : p);

const BENEFITS = [
  'auth.benefit_history',
  'auth.benefit_autosave',
  'auth.benefit_never',
  'auth.benefit_shares',
] as const;

function Benefits() {
  return (
    <div>
      <div class="mb-1.5 font-semibold">{t('auth.benefits_title')}</div>
      <ul class="space-y-1">
        <For each={BENEFITS}>
          {(k) => (
            <li class="flex gap-2">
              <span class="text-ok" aria-hidden="true">
                ✓
              </span>
              <span>{t(k)}</span>
            </li>
          )}
        </For>
      </ul>
      <div class="mt-2 text-xs text-muted">{t('auth.benefits_optional')}</div>
    </div>
  );
}

export function UserMenu() {
  const navigate = useNavigate();
  return (
    <Show
      when={auth.status === 'authenticated' && auth.user}
      fallback={
        <Show
          when={auth.providers.length > 0}
          fallback={
            <Tooltip content={<Benefits />}>
              <A
                href="/login"
                class="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-surface-2"
              >
                <LogIn size={14} /> {t('auth.sign_in')}
              </A>
            </Tooltip>
          }
        >
          <Tooltip content={<Benefits />}>
            <Menu
              noTitle
              label={t('auth.sign_in')}
              trigger={
                <span class="inline-flex items-center gap-1.5">
                  <LogIn size={14} /> {t('auth.sign_in')}
                </span>
              }
              triggerClass="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90"
              items={auth.providers.map((p) => ({
                label: t('auth.sign_in_with', { provider: providerLabel(p) }),
                onSelect: () => login(p),
              }))}
            />
          </Tooltip>
        </Show>
      }
    >
      {(user) => (
        <div class="flex items-center gap-1">
          <Menu
            label={t('auth.user_menu')}
            trigger={
              <span class="inline-flex items-center gap-2">
                <Show when={user().avatar_url} fallback={<UserIcon size={18} />}>
                  <img
                    src={user().avatar_url as string}
                    alt=""
                    width="22"
                    height="22"
                    class="h-[22px] w-[22px] rounded-full"
                    referrerpolicy="no-referrer"
                  />
                </Show>
                <span class="hidden max-w-[120px] truncate text-sm sm:inline">
                  {user().name ?? user().email}
                </span>
              </span>
            }
            items={[
              { label: t('nav.history'), icon: <History size={14} />, onSelect: () => navigate('/history') },
              { label: t('nav.account'), icon: <UserIcon size={14} />, onSelect: () => navigate('/account') },
              { label: '', separator: true },
              { label: t('auth.sign_out'), icon: <LogOut size={14} />, onSelect: () => void logout() },
            ]}
          />
          <span class="hidden lg:block">
            <Toggle
              checked={settings.saveToHistory}
              onChange={(v) => updateSettings({ saveToHistory: v })}
              label={<span class="text-xs">{t('settings.autosave_history')}</span>}
            />
          </span>
        </div>
      )}
    </Show>
  );
}
