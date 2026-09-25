import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  getAuthContext,
  can,
  AuthError,
  IpNotAllowedError,
  TenantInactiveError,
  type AuthContext,
} from '@/lib/auth/guards';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { deriveThemeFromPalette } from '@/lib/branding/theme-from-color';
import { applyDisabledNavItems, buildAvailableWorkspaceNav } from '@/lib/navigation/workspace-nav';
import { getDisabledNavItems } from '@/modules/workspace/services/workspace.service';
import { DisabledSectionGate, type GateSection } from '@/components/shared/DisabledSectionGate';
import LogoutButton from '@/components/LogoutButton';
import CommandMenu from '@/components/shared/CommandMenu';
import NotificationBell from '@/components/shared/NotificationBell';
import MessagingBell from '@/components/shared/MessagingBell';
import WhatsAppWebButton from '@/components/shared/WhatsAppWebButton';
import HeaderAssistantButtons from '@/components/shared/HeaderAssistantButtons';
import { MobileNavProvider, MobileNavToggle, MobileNavBackdrop, MobileNavDrawer } from '@/components/shared/MobileNav';
import { SidebarNav } from '@/components/shared/SidebarNav';
import { CompanySwitcher } from '@/components/shared/CompanySwitcher';
import { ConfirmProvider } from '@/components/ui/confirm-provider';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';
import ManualAssistantWidget from '@/components/shared/ManualAssistantWidget';
import ModuleTutorial from '@/components/tutorial/ModuleTutorial';
import HowToUseButton from '@/components/tutorial/HowToUseButton';
import { getOnboardingStatus } from '@/lib/services/onboarding.service';
import { prisma } from '@/lib/prisma';

export const metadata = {
  title: { default: 'Panel', template: '%s · Aether ERP' },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 1);
  return letters.toUpperCase();
}

/**
 * El sidebar se arma desde el contexto vivo del tenant, no desde el JWT: los
 * módulos que el superadmin habilita o revoca deben reflejarse en el siguiente
 * request, sin esperar a que la sesión de 8 horas expire.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let context: AuthContext;
  try {
    context = await getAuthContext();
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    // Debe ir antes del `AuthError` genérico (`IpNotAllowedError` es
    // subclase suya): sin distinguirlo, el usuario veía un cierre de sesión
    // silencioso en `/login` en vez de saber que su IP está bloqueada.
    if (error instanceof IpNotAllowedError) redirect('/login?reason=ip');
    if (error instanceof AuthError) redirect('/login');
    throw error;
  }

  // Contraseña temporal pendiente de cambio: ninguna pantalla del dashboard es
  // alcanzable hasta resolverlo. Vive fuera de este grupo de rutas (como
  // /suspended) para que la redirección no entre en loop contra este layout.
  if (context.mustChangePassword) redirect('/change-password');

  const allow = (permission: Parameters<typeof can>[1]) => can(context, permission);
  const { features } = context;

  // Registro único compartido con la paleta de comandos (⌘K): mismos módulos,
  // mismas condiciones de acceso. Ver `src/lib/navigation/workspace-nav.ts`.
  // Se arma primero el menú completo (para la puerta de secciones apagadas) y
  // después se le restan los ítems que la empresa desactivó.
  const disabledNavItems = await getDisabledNavItems(context.companyId);
  const availableGroups = buildAvailableWorkspaceNav({
    permissions: context.permissions,
    features,
    isSuperAdmin: context.isSuperAdmin,
  });
  const groups = applyDisabledNavItems(availableGroups, disabledNavItems);
  const visibleIds = new Set(groups.flatMap((group) => group.links.map((link) => link.id)));
  const gateSections: GateSection[] = availableGroups.flatMap((group) =>
    group.links.map((link) => ({ id: link.id, href: link.href, label: link.label, exact: link.exact, disabled: !visibleIds.has(link.id) }))
  );

  // Onboarding: solo se calcula para el Dueño — es quien puede resolver todos
  // los pasos (bodega, POS, invitar), y mostrárselo a un colaborador sin esos
  // permisos solo generaría botones que fallan.
  let onboardingEligible = false;
  let defaultWarehouseId: string | null = null;
  if (context.role === 'OWNER') {
    const [status, defaultWarehouse] = await Promise.all([
      getOnboardingStatus(context.companyId),
      prisma.warehouse.findFirst({ where: { companyId: context.companyId }, orderBy: { createdAt: 'asc' }, select: { id: true } }),
    ]);
    onboardingEligible = status.eligible;
    defaultWarehouseId = defaultWarehouse?.id ?? null;
  }

  const displayName = context.name;
  const roleLabel = context.customRoleName ?? ROLE_LABELS[context.role];
  // Solo se consulta acá (no se agrega a `AuthContext`/JWT) para no tocar el
  // contrato de sesión por un dato puramente cosmético del header.
  const currentUser = await prisma.user.findUnique({ where: { id: context.id }, select: { photoUrl: true } });

  // Tema de marca: si el logo tiene una paleta útil (`brandPalette`, hasta 3
  // colores extraídos en el navegador al subirlo), se sobreescriben acá las
  // variables CSS de `.theme-saas-light` con `style` inline — gana por
  // cascada sobre la clase, resuelto en el server component antes de enviar
  // HTML (sin flash del tema por defecto). `[]` (logo en blanco y negro, o
  // sin logo) deja el tema de Aether intacto.
  const brandTheme = deriveThemeFromPalette(context.companyBrandPalette);
  const brandThemeStyle = brandTheme
    ? (Object.fromEntries(Object.entries(brandTheme).map(([key, value]) => [`--${key}`, value])) as React.CSSProperties)
    : undefined;

  const avatar = (size: string) => (
    <span className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-[11px] font-semibold text-accent-foreground`}>
      {currentUser?.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={currentUser.photoUrl} alt="" className="size-full object-cover" />
      ) : (
        initials(displayName)
      )}
    </span>
  );

  return (
    <div className="theme-saas-light min-h-screen bg-background text-foreground" style={brandThemeStyle}>
      <a
        href="#contenido-principal"
        className="sr-only z-50 rounded-lg bg-card px-4 py-2 text-sm font-medium text-foreground shadow-popover focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Ir al contenido
      </a>

      {/*
        Firma de marca de la empresa (`Company.logoUrl`, el mismo que sube en
        Configuración). Antes cubría todo el viewport al centro y cruzaba
        tablas y gráficos en todas las pantallas; ahora es una firma discreta
        en la esquina, solo en escritorio y nunca al imprimir.
      */}
      {context.companyLogoUrl && (
        <div
          aria-hidden
          className="pointer-events-none fixed right-8 bottom-8 hidden size-40 bg-contain bg-right-bottom bg-no-repeat opacity-[0.05] print:hidden xl:block"
          style={{ backgroundImage: `url(${context.companyLogoUrl})` }}
        />
      )}

      <ConfirmProvider>
        <MobileNavProvider>
          <MobileNavBackdrop />
          <MobileNavDrawer>
            {/* Sidebar: única superficie oscura del tema claro, a propósito (acento de marca). */}
            <aside aria-label="Navegación principal" className="flex h-full w-full flex-col overflow-hidden bg-sidebar print:hidden">
              <div className="shrink-0 px-4 pt-5 pb-4">
                <div className="flex items-center gap-2.5">
                  {context.companyLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={context.companyLogoUrl}
                      alt=""
                      className="size-9 shrink-0 rounded-[10px] bg-white/[0.06] object-contain p-1"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src="/branding/logo-on-dark.png" alt="" className="size-9 shrink-0 object-contain" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{context.companyName}</p>
                    <p className="truncate text-xs text-sidebar-foreground">Aether ERP</p>
                  </div>
                </div>

                <div className="mt-4">
                  <CompanySwitcher
                    companyName={context.companyName}
                    planName={context.planName}
                    isTrial={context.companyStatus === 'TRIAL'}
                  />
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col px-2">
                <SidebarNav groups={groups} />
              </div>

              <div className="flex shrink-0 items-center gap-2.5 border-t border-white/[0.06] px-4 py-3">
                <Link
                  href="/dashboard/settings/profile"
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 -m-1 transition-colors hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-sidebar-ring"
                >
                  {avatar('size-8')}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-white">{displayName}</span>
                    <span className="block truncate text-[11px] text-sidebar-foreground">{roleLabel}</span>
                  </span>
                </Link>
                <LogoutButton variant="icon" />
              </div>
            </aside>
          </MobileNavDrawer>

          <div className="flex min-h-screen flex-col lg:pl-[260px]">
            <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-card/85 px-4 backdrop-blur-md print:hidden lg:px-8">
              <MobileNavToggle />
              <CommandMenu
                permissions={context.permissions}
                features={features}
                isSuperAdmin={context.isSuperAdmin}
                disabledNavItems={disabledNavItems}
              />
              <div className="flex-1" />
              <HowToUseButton />
              <HeaderAssistantButtons />
              {allow('messaging:whatsapp_personal') && <WhatsAppWebButton />}
              {allow('messaging:use') && <MessagingBell />}
              <NotificationBell />
              <Link
                href="/dashboard/settings/profile"
                aria-label={`Mi perfil: ${displayName}`}
                className="ml-1 hidden items-center gap-2 rounded-[10px] px-2 py-1.5 text-sm text-foreground transition-colors duration-150 hover:bg-muted sm:flex"
              >
                {avatar('size-7')}
                <span className="hidden max-w-[12rem] truncate text-muted-foreground md:inline">{displayName}</span>
              </Link>
            </header>

            <main id="contenido-principal" tabIndex={-1} className="flex-1 outline-none print:p-0">
              <div className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-8 print:p-0">
                <DisabledSectionGate sections={gateSections} canConfigure={allow('settings:company')}>
                  {children}
                </DisabledSectionGate>
              </div>
            </main>
          </div>
        </MobileNavProvider>

        {context.role === 'OWNER' && (
          <OnboardingWizard
            companyId={context.companyId}
            hasPos={features.hasPos}
            defaultWarehouseId={defaultWarehouseId}
            autoOpen={onboardingEligible}
          />
        )}
        <ManualAssistantWidget />
        <ModuleTutorial userId={context.id} />
      </ConfirmProvider>
    </div>
  );
}
