import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  getAuthContext,
  can,
  AuthError,
  TenantInactiveError,
  type AuthContext,
} from '@/lib/auth/guards';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { deriveThemeFromPalette } from '@/lib/branding/theme-from-color';
import LogoutButton from '@/components/LogoutButton';
import CommandMenu from '@/components/shared/CommandMenu';
import NotificationBell from '@/components/shared/NotificationBell';
import { MobileNavProvider, MobileNavToggle, MobileNavBackdrop, MobileNavDrawer } from '@/components/shared/MobileNav';
import { SidebarNav, type SidebarNavGroup } from '@/components/shared/SidebarNav';
import { CompanySwitcher } from '@/components/shared/CompanySwitcher';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';
import AiCopilotDrawer from '@/components/shared/AiCopilotDrawer';
import ManualAssistantWidget from '@/components/shared/ManualAssistantWidget';
import { getOnboardingStatus } from '@/lib/services/onboarding.service';
import { prisma } from '@/lib/prisma';

export const metadata = {
  title: 'Dashboard',
};

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
    if (error instanceof AuthError) redirect('/login');
    throw error;
  }

  // Contraseña temporal pendiente de cambio: ninguna pantalla del dashboard es
  // alcanzable hasta resolverlo. Vive fuera de este grupo de rutas (como
  // /suspended) para que la redirección no entre en loop contra este layout.
  if (context.mustChangePassword) redirect('/change-password');

  const allow = (permission: Parameters<typeof can>[1]) => can(context, permission);
  const { features } = context;
  const canSeeSettings = allow('settings:company') || allow('settings:users') || allow('audit:read');
  const showInventorySection = features.hasInventory && allow('products:read');

  // Mismos módulos y condiciones que antes (no se toca la lógica de acceso),
  // solo se reagrupan en las secciones del brief: Principal, Inventario,
  // Ventas, Compras, Finanzas, Configuración.
  const groups: SidebarNavGroup[] = [];

  const principalLinks: SidebarNavGroup['links'] = [{ href: '/dashboard', label: 'Dashboard', icon: 'home', exact: true }];
  if (features.hasPos && allow('pos:operate')) {
    principalLinks.push({ href: '/dashboard/pos', label: 'Punto de Venta', icon: 'pos' });
  }
  groups.push({ label: 'Principal', links: principalLinks });

  if (showInventorySection) {
    groups.push({
      label: 'Inventario',
      links: [
        { href: '/dashboard/products', label: 'Catálogo de Productos', icon: 'products' },
        { href: '/dashboard/inventory', label: 'Inventario', icon: 'inventory' },
      ],
    });
  }

  const ventasLinks: SidebarNavGroup['links'] = [];
  if (features.hasDteBilling && allow('sales:read')) {
    ventasLinks.push({ href: '/dashboard/sales', label: 'Ventas & Facturación', icon: 'sales' });
  }
  if (allow('contacts:read')) {
    ventasLinks.push({ href: '/dashboard/contacts', label: 'Clientes & Proveedores', icon: 'contacts' });
  }
  if (ventasLinks.length > 0) groups.push({ label: 'Ventas', links: ventasLinks });

  if (features.hasPurchases && allow('purchases:read')) {
    groups.push({ label: 'Compras', links: [{ href: '/dashboard/purchases', label: 'Compras', icon: 'purchases' }] });
  }

  const finanzasLinks: SidebarNavGroup['links'] = [];
  if (features.hasTreasury && allow('treasury:read')) {
    finanzasLinks.push(
      { href: '/dashboard/treasury/cxc', label: 'Cuentas por Cobrar', icon: 'cxc' },
      { href: '/dashboard/treasury/cxp', label: 'Cuentas por Pagar', icon: 'cxp' },
      { href: '/dashboard/treasury/cashflow', label: 'Flujo de Caja', icon: 'cashflow' }
    );
  }
  if (features.hasAdvancedReports && allow('reports:read')) {
    finanzasLinks.push({ href: '/dashboard/reports', label: 'Reportes Excel', icon: 'reports' });
    finanzasLinks.push({ href: '/dashboard/reports/f29', label: 'Formulario 29 (F29)', icon: 'reports' });
  }
  if (features.hasBudgets && allow('budgets:read')) {
    finanzasLinks.push({ href: '/dashboard/budgets', label: 'Presupuestos', icon: 'budgets' });
  }
  if (features.hasPromissoryNotes && allow('promissorynotes:read')) {
    finanzasLinks.push({ href: '/dashboard/promissory-notes', label: 'Pagarés', icon: 'promissoryNotes' });
  }
  if (features.hasInstallmentPlans && allow('paymentplans:read')) {
    finanzasLinks.push({ href: '/dashboard/payment-plans', label: 'Cuotas & Mensualidades', icon: 'paymentPlans' });
  }
  if (finanzasLinks.length > 0) groups.push({ label: 'Finanzas', links: finanzasLinks });

  if (features.hasAccounting && allow('reports:financial')) {
    groups.push({
      label: 'Contabilidad',
      links: [{ href: '/dashboard/financial-statements', label: 'Estados Financieros', icon: 'accounting' }],
    });
  }

  if (features.hasCrm && allow('agents:view')) {
    groups.push({
      label: 'Inteligencia de Negocio',
      links: [{ href: '/dashboard/agents', label: 'Agentes', icon: 'agents' }],
    });
  }

  // Separado en dos grupos a propósito: con varios módulos de certámenes
  // activos, todo junto pasaba de 10 ítems con el mismo peso visual — sin
  // distinción entre lo que se usa a diario (candidatas, auspicios, entradas)
  // y lo que se toca una vez cada tanto (plantillas, tableros de
  // cumplimiento). El segundo grupo arranca colapsado (`collapsedByDefault`
  // en SidebarNav) pero se autoexpande si la ruta activa cae adentro.
  const eventosLinks: SidebarNavGroup['links'] = [];
  const eventosConfigLinks: SidebarNavGroup['links'] = [];
  if (features.hasEventProjects && allow('projects:read')) {
    eventosLinks.push({ href: '/dashboard/projects', label: 'Eventos & Proyectos', icon: 'projects' });
    eventosLinks.push({ href: '/dashboard/calendar', label: 'Calendario & Google Sync', icon: 'calendar' });
  }
  if (features.hasSponsorships && allow('sponsorships:read')) {
    eventosLinks.push({ href: '/dashboard/sponsorships', label: 'Auspicios & Marcas', icon: 'sponsorships' });
    eventosConfigLinks.push({ href: '/dashboard/sponsorships/compliance', label: 'Cumplimiento de Auspicios', icon: 'sponsorships' });
    if (allow('sponsorships:write')) {
      eventosConfigLinks.push({ href: '/dashboard/sponsorships/template', label: 'Plantilla: Carta de Compromiso', icon: 'sponsorships' });
    }
  }
  if (features.hasFeeDocuments && allow('fees:read')) {
    eventosLinks.push({ href: '/dashboard/fees', label: 'Boletas de Honorarios', icon: 'fees' });
  }
  if (features.hasCandidates && allow('candidates:read')) {
    eventosLinks.push({ href: '/dashboard/candidates', label: 'Candidatas & Staff', icon: 'candidates' });
    eventosLinks.push({ href: '/dashboard/candidates/attendance', label: 'Asistencia', icon: 'candidates' });
    eventosConfigLinks.push({ href: '/dashboard/candidates/compliance', label: 'Cumplimiento de Candidatas', icon: 'candidates' });
    if (allow('candidates:write')) {
      eventosConfigLinks.push({ href: '/dashboard/candidates/template', label: 'Plantilla: Contrato de Imagen', icon: 'candidates' });
    }
  }
  if (features.hasLiveProduction && allow('production:read')) {
    eventosLinks.push({ href: '/dashboard/production/accreditation', label: 'Acreditaciones', icon: 'production' });
  }
  if (features.hasJudging && allow('judging:read')) {
    eventosLinks.push({ href: '/dashboard/judging', label: 'Votación & Escrutinio', icon: 'judging' });
  }
  if (features.hasTicketing && allow('ticketing:read')) {
    eventosLinks.push({ href: '/dashboard/ticketing', label: 'Venta de Entradas', icon: 'ticketing' });
  }
  if (features.hasPublicVoting && allow('publicvoting:read')) {
    eventosLinks.push({ href: '/dashboard/voting', label: 'Votación Pagada', icon: 'voting' });
  }
  if (eventosLinks.length > 0) groups.push({ label: 'Producción de Eventos', links: eventosLinks });
  if (eventosConfigLinks.length > 0) {
    groups.push({ label: 'Plantillas y Cumplimiento', links: eventosConfigLinks, collapsedByDefault: true });
  }

  if (features.hasOrgChart && allow('orgchart:read')) {
    groups.push({ label: 'Equipo', links: [{ href: '/dashboard/org-chart', label: 'Organigrama', icon: 'orgchart' }] });
  }

  // Manual de Usuario: sin gate de módulo ni permiso — cualquier usuario
  // autenticado debería poder consultar cómo usar lo que sí tiene disponible.
  groups.push({ label: 'Ayuda', links: [{ href: '/dashboard/manual', label: 'Manual de Usuario', icon: 'help' }] });

  if (canSeeSettings) {
    groups.push({ label: 'Configuración', links: [{ href: '/dashboard/settings', label: 'Configuración', icon: 'settings' }] });
  }

  if (context.isSuperAdmin) {
    groups.push({ label: 'Plataforma', links: [{ href: '/superadmin', label: 'Panel SaaS', icon: 'platform' }] });
  }

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

  // Tema de marca: si el logo tiene una paleta útil (`brandPalette`, hasta 3
  // colores extraídos en el navegador al subirlo), se sobreescriben acá las
  // variables CSS de `.theme-saas-light` con `style` inline — gana por
  // cascada sobre la clase, resuelto en el server component antes de enviar
  // HTML (sin flash del tema por defecto). `[]` (logo en blanco y negro, o
  // sin logo) deja el tema emerald de siempre intacto.
  const brandTheme = deriveThemeFromPalette(context.companyBrandPalette);
  const brandThemeStyle = brandTheme
    ? (Object.fromEntries(Object.entries(brandTheme).map(([key, value]) => [`--${key}`, value])) as React.CSSProperties)
    : undefined;

  return (
    <div className="theme-saas-light min-h-screen bg-background text-foreground" style={brandThemeStyle}>
      {/*
        Marca de agua del logo de la empresa (`Company.logoUrl` — el mismo que
        sube la empresa en Configuración; el propio texto de ayuda de esa
        pantalla ya decía "se usa... como marca de agua del panel", aunque
        nada la renderizaba). Fija (sigue visible al hacer scroll), detrás de
        todo el contenido, ajustada al viewport sin recortarse (`bg-contain`),
        opacidad baja para no pelear con la legibilidad de tablas/formularios
        encima. Oculta al imprimir: un reporte o un ticket térmico no debe
        llevar la marca de agua de pantalla, esos ya tienen su propio layout
        de impresión.
      */}
      {context.companyLogoUrl && (
        // Sin z-index negativo a propósito: el div raíz de acá arriba no
        // establece su propio contexto de apilamiento (no tiene position),
        // así que un `-z-10` se iba detrás del `bg-background` de TODA la
        // página (incluido el de este mismo contenedor), no solo del
        // contenido — quedaba completamente invisible. Al omitir z-index
        // (auto) y ser el primer hijo en el DOM, el orden de pintado normal
        // ya lo deja detrás de todo lo que viene después.
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 bg-contain bg-center bg-no-repeat opacity-[0.06] print:hidden"
          style={{ backgroundImage: `url(${context.companyLogoUrl})` }}
        />
      )}
      <MobileNavProvider>
        <MobileNavBackdrop />
        <MobileNavDrawer>
          {/* Sidebar: única superficie oscura del tema claro, a propósito (acento de marca). */}
          <aside className="flex h-full w-full flex-col overflow-hidden bg-sidebar print:hidden">
            <div className="shrink-0 px-4 pt-5 pb-4">
              <div className="flex items-center gap-2.5">
                {context.companyLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={context.companyLogoUrl}
                    alt={context.companyName}
                    className="size-9 shrink-0 rounded-[10px] object-contain"
                  />
                ) : (
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-white/10 text-sm font-bold text-white">
                    {context.companyName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-white">
                    {context.companyLogoUrl ? context.companyName : 'Aether ERP'}
                  </h3>
                  <p className="truncate text-xs text-sidebar-foreground">
                    {context.companyLogoUrl ? 'Panel de gestión' : context.companyName}
                  </p>
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

            <SidebarNav groups={groups} />

            <div className="shrink-0 border-t border-white/[0.06] px-4 py-4">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
                  {displayName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-white">{displayName}</p>
                  <p className="truncate text-[11px] text-sidebar-foreground">{roleLabel}</p>
                </div>
              </div>
              <LogoutButton />
            </div>
          </aside>
        </MobileNavDrawer>

        <div className="flex min-h-screen flex-col lg:pl-[260px]">
          <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 print:hidden lg:px-8">
            <MobileNavToggle />
            <CommandMenu permissions={context.permissions} features={features} isSuperAdmin={context.isSuperAdmin} />
            <div className="flex-1" />
            <NotificationBell />
            <Link
              href="/dashboard/settings/profile"
              className="hidden items-center gap-2 rounded-[10px] px-2 py-1.5 text-sm text-foreground transition-colors duration-150 hover:bg-muted sm:flex"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                {context.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="max-w-[14rem] truncate text-muted-foreground">{context.name}</span>
            </Link>
          </header>

          <main className="flex-1 print:p-0">
            <div className="mx-auto max-w-[1440px] p-6 lg:p-8">{children}</div>
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
      {features.hasCrm && allow('agents:view') && <AiCopilotDrawer />}
      <ManualAssistantWidget />
    </div>
  );
}
