import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { AuthError, TenantInactiveError, can, getAuthContext } from '@/lib/auth/guards';
import { SETTINGS_GROUPS } from '@/lib/navigation/settings-nav';
import ReopenOnboardingButton from '@/components/onboarding/ReopenOnboardingButton';

export const metadata = { title: 'Configuración' };

export default async function SettingsPage() {
  let context;
  try {
    context = await getAuthContext();
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof AuthError) redirect('/login');
    throw error;
  }

  const groups = SETTINGS_GROUPS.map((group) => ({
    ...group,
    links: group.links.filter((l) => l.permission === null || can(context, l.permission)),
  })).filter((group) => group.links.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Configuración</h1>
          <p className="text-sm text-muted-foreground">Todo lo de tu empresa y tu cuenta, ordenado por tema.</p>
        </div>
        {context.role === 'OWNER' && <ReopenOnboardingButton />}
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">No tienes secciones de configuración disponibles para tu rol.</p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <section
            key={group.id}
            aria-labelledby={`settings-${group.id}`}
            className="flex flex-col overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10"
          >
            <header className="flex items-start gap-3 border-b border-border/60 px-4 py-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <group.icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id={`settings-${group.id}`} className="text-base leading-snug font-semibold">
                  {group.title}
                </h2>
                <p className="text-xs text-muted-foreground">{group.description}</p>
              </div>
            </header>
            <ul className="flex-1 divide-y divide-border/60">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                  >
                    <link.icon className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{link.title}</span>
                      <span className="block text-xs text-muted-foreground">{link.description}</span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
