import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, FileCheck2, KeyRound, Laptop, Lock, ShieldCheck, Upload, UserCircle, Users, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthError, TenantInactiveError, can, getAuthContext } from '@/lib/auth/guards';
import type { Permission } from '@/lib/auth/permissions';
import ReopenOnboardingButton from '@/components/onboarding/ReopenOnboardingButton';

export const metadata = { title: 'Configuración' };

const SECTIONS: Array<{ href: string; icon: typeof Building2; title: string; description: string; permission: Permission | null }> = [
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
    description: 'Carga los CAF que autorizan tus folios y revisa cuántos te quedan antes de agotarlos.',
    permission: 'dte:manage_caf',
  },
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
    description: 'Crea roles a medida marcando exactamente qué puede hacer cada función.',
    permission: 'settings:users',
  },
  {
    href: '/dashboard/settings/import',
    icon: Upload,
    title: 'Importación Masiva',
    description: 'Carga productos y contactos desde Excel o CSV, con validación previa fila por fila.',
    permission: 'import:data',
  },
  {
    href: '/dashboard/settings/automations',
    icon: Zap,
    title: 'Automatizaciones',
    description: 'Crea tus propios flujos de trabajo y revisa el estado de las tareas programadas.',
    permission: 'automation:manage',
  },
  {
    href: '/dashboard/settings/audit',
    icon: ShieldCheck,
    title: 'Auditoría & Trazabilidad',
    description: 'Historial de eventos y cambios realizados en el sistema.',
    permission: 'audit:read',
  },
  {
    href: '/dashboard/settings/sessions',
    icon: Laptop,
    title: 'Dispositivos Activos',
    description: 'Revisa dónde tienes sesión iniciada y cierra el acceso de un dispositivo que no reconozcas.',
    // De la propia cuenta: no depende de ningún permiso del rol.
    permission: null,
  },
  {
    href: '/dashboard/settings/profile',
    icon: UserCircle,
    title: 'Mi Perfil',
    description: 'Tu teléfono de contacto y tu actividad reciente en la plataforma.',
    // De la propia cuenta: no depende de ningún permiso del rol.
    permission: null,
  },
  {
    href: '/dashboard/settings/security',
    icon: Lock,
    title: 'Seguridad',
    description: 'Activa la verificación en dos pasos (2FA) para tu cuenta.',
    // De la propia cuenta: no depende de ningún permiso del rol.
    permission: null,
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

  const sections = SECTIONS.filter((s) => s.permission === null || can(context, s.permission));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Configuración</h1>
        {context.role === 'OWNER' && <ReopenOnboardingButton />}
      </div>
      {sections.length === 0 && (
        <p className="text-sm text-muted-foreground">No tienes secciones de configuración disponibles para tu rol.</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <section.icon className="mb-2 size-6 text-primary" />
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
