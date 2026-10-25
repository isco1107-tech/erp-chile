import type { ReactNode } from 'react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { SETTINGS_GROUPS } from '@/lib/navigation/settings-nav';
import SettingsTabs, { type SettingsTabsGroup } from '@/components/settings/SettingsTabs';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  // Si la sesión no sirve, cada página ya redirige por su cuenta; aquí solo se omiten las pestañas.
  let groups: SettingsTabsGroup[] = [];
  try {
    const context = await getAuthContext();
    groups = SETTINGS_GROUPS.map((g) => ({
      id: g.id,
      title: g.title,
      links: g.links
        .filter((l) => l.permission === null || can(context, l.permission))
        .map((l) => ({ href: l.href, title: l.title })),
    }));
  } catch {
    groups = [];
  }

  return (
    <div className="space-y-4">
      <SettingsTabs groups={groups} />
      {children}
    </div>
  );
}
