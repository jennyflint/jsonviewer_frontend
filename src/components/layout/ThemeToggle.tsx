import { Monitor, Moon, Sun } from 'lucide-solid';
import { Menu } from '../ui/Menu';
import { settings, updateSettings } from '../../stores/settings';
import { t } from '../../lib/i18n';

export function ThemeToggle() {
  const icon = () =>
    settings.theme === 'dark' ? (
      <Moon size={16} />
    ) : settings.theme === 'light' ? (
      <Sun size={16} />
    ) : (
      <Monitor size={16} />
    );
  return (
    <Menu
      label={t('theme.label')}
      trigger={icon()}
      items={[
        {
          label: t('theme.light'),
          icon: <Sun size={14} />,
          onSelect: () => updateSettings({ theme: 'light' }),
        },
        {
          label: t('theme.dark'),
          icon: <Moon size={14} />,
          onSelect: () => updateSettings({ theme: 'dark' }),
        },
        {
          label: t('theme.system'),
          icon: <Monitor size={14} />,
          onSelect: () => updateSettings({ theme: 'system' }),
        },
      ]}
    />
  );
}
