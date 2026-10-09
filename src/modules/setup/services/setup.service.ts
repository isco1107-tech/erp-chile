import 'server-only';

import { prisma } from '@/lib/prisma';
import type { AuthContext } from '@/lib/auth/guards';
import { buildCompanySetupReadiness, GENERIC_CONSUMER_RUT_PREFIX, type SetupReadinessReport } from '@/lib/setup/readiness';
import { getFolioAvailability } from '@/modules/dte/services/caf.service';
import { hasChartOfAccounts } from '@/modules/accounting/services/chart-setup.service';
import { getDisabledNavItems } from '@/modules/workspace/services/workspace.service';

type SetupContext = Pick<AuthContext, 'companyId' | 'features' | 'permissions'>;

/**
 * Arma el checklist "Primeros pasos" de la empresa con datos reales.
 *
 * Solo consulta lo que el checklist de ESTA persona va a mostrar (módulo
 * contratado y permiso para abrir la pantalla); lo demás ni se pide. Todos los
 * conteos llevan `companyId` y corren en tandas de a 5 como máximo: el pool de
 * conexiones es de 5 y esta lectura se hace en cada carga del Inicio.
 */
export async function getCompanySetupReadiness(context: SetupContext): Promise<SetupReadinessReport> {
  const { companyId, features } = context;
  const allow = (permission: SetupContext['permissions'][number]) => context.permissions.includes(permission);

  const wantInventory = features.hasInventory && (allow('products:write') || allow('inventory:write'));
  const wantCustomers = (features.hasDteBilling || features.hasTreasury) && allow('contacts:write');
  const wantPos = features.hasPos && allow('pos:operate') && allow('settings:company');
  const wantFolios = features.hasDteBilling && allow('dte:manage_caf');
  const wantSales = features.hasDteBilling && allow('sales:write');
  const wantBank = features.hasTreasury && allow('treasury:write');
  const wantChart = features.hasAccounting && allow('accounting:manage_accounts') && allow('accounting:view');
  const wantWorkers = features.hasPayroll && allow('payroll:write');
  const wantProjects = features.hasEventProjects && allow('projects:write');
  const wantTeam = allow('settings:users');

  const [company, customers, products, stockWithQuantity, cashRegisters] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { rut: true, businessName: true, giro: true, address: true, comuna: true },
    }),
    wantCustomers
      ? prisma.contact.count({ where: { companyId, isCustomer: true, NOT: { rutClean: { startsWith: GENERIC_CONSUMER_RUT_PREFIX } } } })
      : Promise.resolve(0),
    wantInventory ? prisma.product.count({ where: { companyId } }) : Promise.resolve(0),
    wantInventory ? prisma.stock.count({ where: { companyId, quantity: { gt: 0 } } }) : Promise.resolve(0),
    wantPos ? prisma.cashRegister.count({ where: { companyId } }) : Promise.resolve(0),
  ]);

  const [bankAccounts, folios, chartExists, workers, projects] = await Promise.all([
    wantBank ? prisma.bankAccount.count({ where: { companyId } }) : Promise.resolve(0),
    wantFolios ? getFolioAvailability(companyId) : Promise.resolve([]),
    wantChart ? hasChartOfAccounts(companyId) : Promise.resolve(false),
    wantWorkers ? prisma.employee.count({ where: { companyId } }) : Promise.resolve(0),
    wantProjects ? prisma.project.count({ where: { companyId } }) : Promise.resolve(0),
  ]);

  const [users, invitations, issuedSales, disabledNavItems] = await Promise.all([
    wantTeam ? prisma.user.count({ where: { companyId } }) : Promise.resolve(0),
    wantTeam ? prisma.invitation.count({ where: { companyId } }) : Promise.resolve(0),
    wantSales ? prisma.salesDocument.count({ where: { companyId, status: 'ISSUED', dteType: { not: 'COTIZACION' } } }) : Promise.resolve(0),
    getDisabledNavItems(companyId),
  ]);

  return buildCompanySetupReadiness({
    features,
    permissions: context.permissions,
    disabledNavItems,
    company: company ?? { rut: null, businessName: null, giro: null, address: null, comuna: null },
    counts: {
      customers,
      products,
      stockWithQuantity,
      cashRegisters,
      bankAccounts,
      workers,
      projects,
      users,
      invitations,
      issuedSales,
    },
    foliosAvailable: folios.some((entry) => entry.remaining > 0),
    hasChartOfAccounts: chartExists,
  });
}
