import {
  Building2,
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
import type { Permission } from '@/lib/auth/permissions';

export type SettingsLink = {
  href: string;
  icon: typeof Building2;
  title: string;
  description: string;
  permission: Permission | null;
};

export type SettingsGroup = {
  id: string;
  icon: typeof Building2;
  title: string;
  description: string;
  links: SettingsLink[];
};

// Los textos de cada enlace son los mismos títulos que usan el manual y el tutorial.
// Un grupo sin enlaces visibles para el rol no se dibuja.
export const SETTINGS_GROUPS: SettingsGroup[] = [
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
