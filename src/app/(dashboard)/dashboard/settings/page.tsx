import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Building2,
  ChevronRight,
  FileCheck2,
  KeyRound,
  Laptop,
  LayoutGrid,
  Lock,
  PackagePlus,
  ShieldCheck,
  ShieldQuestion,
  Upload,
  UserCircle,
  Users,
  Zap,
} from 'lucide-react';
import { AuthError, TenantInactiveError, can, getAuthContext } from '@/lib/auth/guards';
import type { Permission } from '@/lib/auth/permissions';
import ReopenOnboardingButton from '@/components/onboarding/ReopenOnboardingButton';

export const metadata = { title: 'Configuración' };

type SettingsLink = {
  href: string;
  icon: typeof Building2;
  title: string;
  description: string;
  permission: Permission | null;
};

type SettingsGroup = {
  id: string;
  icon: typeof Building2;
  title: string;
  description: string;
  links: SettingsLink[];
};

// Los textos de cada enlace son los mismos títulos que usan el manual y el tutorial.
// Un grupo sin enlaces visibles para el rol no se dibuja.
const GROUPS: SettingsGroup[] = [
  {
    id: 'empresa',
    icon: Building2,
    title: 'Mi empresa',
    description: 'Datos legales, tributarios y de privacidad.',
    links: [
      {
        href: '/dashboard/settings/company',
        icon: Building2,
        title: 'Perfil de Empresa',
        description: 'Razón social, RUT, giro, dirección, logo y datos usados en los DTEs.',
        permission: 'settings:company',
      },
      {
        href: '/dashboard/settings/folios',
        icon: FileCheck2,
        title: 'Folios del SII',
        description: 'Carga los CAF y revisa cuántos folios te quedan.',
        permission: 'dte:manage_caf',
      },
      {
        href: '/dashboard/settings/privacy',
        icon: ShieldQuestion,
        title: 'Protección de datos',
        description: 'Solicitudes de titulares, registro de actividades e incidentes (Ley 21.719).',
        permission: 'settings:company',
      },
    ],
  },
  {
    id: 'modulos',
    icon: LayoutGrid,
    title: 'Módulos y plan',
    description: 'Qué ve tu equipo y qué tienes contratado.',
    links: [
      {
        href: '/dashboard/settings/modules',
        icon: LayoutGrid,
        title: 'Módulos y Menú',
        description: 'Enciende o apaga secciones del menú para todo el equipo, sin perder datos.',
        permission: 'settings:company',
      },
      {
        href: '/dashboard/settings/plans',
        icon: PackagePlus,
        title: 'Planes y Módulos',
        description: 'Precios de cada módulo; arma tu selección y pide contratar más.',
        permission: 'settings:company',
      },
    ],
  },
  {
    id: 'equipo',
    icon: Users,
    title: 'Equipo y accesos',
    description: 'Quién entra y qué puede hacer.',
    links: [
      {
        href: '/dashboard/settings/users',
        icon: Users,
        title: 'Equipo & Colaboradores',
        description: 'Invita colaboradores, asigna roles y gestiona accesos.',
        permission: 'settings:users',
      },
      {
        href: '/dashboard/settings/roles',
        icon: KeyRound,
        title: 'Roles Personalizados',
        description: 'Crea roles a medida marcando qué puede hacer cada función.',
        permission: 'settings:users',
      },
      {
        href: '/dashboard/settings/audit',
        icon: ShieldCheck,
        title: 'Auditoría & Trazabilidad',
        description: 'Historial de eventos y cambios realizados en el sistema.',
        permission: 'audit:read',
      },
    ],
  },
  {
    id: 'datos',
    icon: Zap,
    title: 'Datos y automatización',
    description: 'Carga de información y tareas que se hacen solas.',
    links: [
      {
        href: '/dashboard/settings/import',
        icon: Upload,
        title: 'Importación Masiva',
        description: 'Carga productos y contactos desde Excel o CSV, con validación previa.',
        permission: 'import:data',
      },
      {
        href: '/dashboard/settings/automations',
        icon: Zap,
        title: 'Automatizaciones',
        description: 'Crea flujos de trabajo y revisa el estado de las tareas programadas.',
        permission: 'automation:manage',
      },
    ],
  },
  {
    id: 'cuenta',
    icon: UserCircle,
    title: 'Mi cuenta',
    description: 'Solo tu usuario; no depende del rol.',
    links: [
      {
        href: '/dashboard/settings/profile',
        icon: UserCircle,
        title: 'Mi Perfil',
        description: 'Tu teléfono de contacto y tu actividad reciente.',
        permission: null,
      },
      {
        href: '/dashboard/settings/security',
        icon: Lock,
        title: 'Seguridad',
        description: 'Activa la verificación en dos pasos (2FA).',
        permission: null,
      },
      {
        href: '/dashboard/settings/sessions',
        icon: Laptop,
        title: 'Dispositivos Activos',
        description: 'Revisa dónde tienes sesión iniciada y cierra la de un dispositivo que no reconozcas.',
        permission: null,
      },
    ],
  },
];

export default async function SettingsPage() {
  let context;
  try {
    context = await getAuthContext();
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof AuthError) redirect('/login');
    throw error;
  }

  const groups = GROUPS.map((group) => ({
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
