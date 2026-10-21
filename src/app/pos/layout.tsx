import React from 'react';
import { redirect } from 'next/navigation';
import { ScanBarcode } from 'lucide-react';
import {
  AuthError,
  IpNotAllowedError,
  TenantInactiveError,
  getAuthContext,
} from '@/lib/auth/guards';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { prisma } from '@/lib/prisma';
import ModuleGate from '@/components/ModuleGate';
import { ConfirmProvider } from '@/components/ui/confirm-provider';
import LogoutButton from '@/components/LogoutButton';

export const metadata = {
  title: 'Aether Caja POS | Terminal de Supermercado',
  manifest: '/pos/manifest.webmanifest',
};

/**
 * Aplicación dedicada solo de Punto de Venta (`/pos`) para terminales de caja
 * en supermercados y locales comerciales.
 *
 * Opera sin la barra lateral ni los menús administrativos del ERP, enfocando
 * toda la pantalla en la fila de clientes, pero tributando en tiempo real al
 * mismo inventario (Kardex PMP y lotes FEFO), CAF/DTE del SII, Tesorería y
 * Contabilidad de la empresa.
 */
export default async function StandalonePosLayout({ children }: { children: React.ReactNode }) {
  let context;
  try {
    context = await getAuthContext();
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof IpNotAllowedError) redirect('/login?reason=ip');
    if (error instanceof AuthError) redirect('/login?callbackUrl=/pos');
    throw error;
  }

  if (context.mustChangePassword) redirect('/change-password');

  const company = await prisma.company.findUnique({
    where: { id: context.companyId },
    select: { businessName: true, rut: true },
  });

  const userName = context.name || context.email;
  const roleLabel = context.customRoleName ?? ROLE_LABELS[context.role] ?? context.role;

  return (
    <div data-pos-app className="theme-saas-light flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-13 shrink-0 items-center justify-between border-b border-border bg-card px-4 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ScanBarcode className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight">Aether Caja POS</span>
              <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                Modo Caja Dedicada
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {company?.businessName ?? 'Empresa'} · RUT {company?.rut ?? '-'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right text-xs sm:block">
            <p className="font-medium text-foreground">{userName}</p>
            <p className="text-muted-foreground">{roleLabel}</p>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 p-3 sm:p-5">
        <ConfirmProvider>
          <ModuleGate moduleKey="hasPos" permission="pos:operate">
            {children}
          </ModuleGate>
        </ConfirmProvider>
      </main>
    </div>
  );
}

