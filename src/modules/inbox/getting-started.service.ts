import 'server-only';

import { prisma } from '@/lib/prisma';
import type { CompanyFeatureFlags } from '@/lib/auth/modules';

/**
 * "Primeros pasos": qué le falta a la empresa para sacarle provecho a lo que
 * contrató. Cada paso se marca solo cuando el dato existe (no hay un "marcar
 * como hecho" manual que pueda mentir) y solo aparecen los pasos de módulos
 * contratados.
 */

export interface GettingStartedStep {
  id: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
}

export async function getGettingStarted(companyId: string, features: CompanyFeatureFlags): Promise<GettingStartedStep[]> {
  const [company, cafs, treasuryAccounts, products, contacts, mapping, users, invitations, issuedSales, khipu, contracts, employees] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { giro: true, address: true, comuna: true, logoUrl: true } }),
    features.hasDteBilling ? prisma.dteCaf.count({ where: { companyId } }) : Promise.resolve(0),
    features.hasTreasury ? prisma.treasuryAccount.count({ where: { companyId } }) : Promise.resolve(0),
    features.hasInventory ? prisma.product.count({ where: { companyId } }) : Promise.resolve(0),
    prisma.contact.count({ where: { companyId } }),
    features.hasAccounting ? prisma.accountMapping.count({ where: { companyId } }) : Promise.resolve(0),
    prisma.user.count({ where: { companyId } }),
    prisma.invitation.count({ where: { companyId } }),
    features.hasDteBilling ? prisma.salesDocument.count({ where: { companyId, status: 'ISSUED' } }) : Promise.resolve(0),
    prisma.companySettings.findUnique({ where: { companyId }, select: { khipuApiCredential: true } }),
    features.hasServiceContracts ? prisma.serviceContract.count({ where: { companyId } }) : Promise.resolve(0),
    features.hasPayroll ? prisma.employee.count({ where: { companyId } }) : Promise.resolve(0),
  ]);

  const steps: GettingStartedStep[] = [
    {
      id: 'company',
      title: 'Completa los datos de tu empresa',
      description: 'Giro, dirección y logo: salen en tus facturas, boletas y comprobantes.',
      href: '/dashboard/settings/company',
      done: Boolean(company?.giro && company.address && company.comuna),
    },
  ];
  if (features.hasDteBilling) {
    steps.push({ id: 'caf', title: 'Carga tus folios del SII (CAF)', description: 'Con ellos cada documento sale con folio oficial y timbre electrónico.', href: '/dashboard/settings/folios', done: cafs > 0 });
  }
  if (features.hasTreasury) {
    steps.push({ id: 'treasury', title: 'Registra tu caja y tus cuentas bancarias', description: 'Así ves el saldo real de cada una con todo lo que entra y sale.', href: '/dashboard/treasury/accounts', done: treasuryAccounts > 0 });
  }
  if (features.hasInventory) {
    steps.push({ id: 'products', title: 'Carga tus productos o servicios', description: 'Uno por uno o de golpe desde Excel.', href: products > 0 ? '/dashboard/products' : '/dashboard/settings/import', done: products > 0 });
  }
  steps.push({ id: 'contacts', title: 'Agrega tus clientes y proveedores', description: 'Con su RUT el sistema completa razón social y giro.', href: contacts > 0 ? '/dashboard/contacts' : '/dashboard/settings/import', done: contacts > 0 });
  if (features.hasAccounting) {
    steps.push({ id: 'accounting', title: 'Activa el plan de cuentas', description: 'Desde ese momento cada venta, compra, sueldo y pago se contabiliza solo.', href: '/dashboard/accounting/journal', done: mapping > 0 });
  }
  if (features.hasServiceContracts) {
    steps.push({ id: 'contracts', title: 'Registra tus contratos recurrentes', description: 'Igualas y mantenciones que se facturan solas cada período.', href: '/dashboard/contracts/new', done: contracts > 0 });
  }
  if (features.hasPayroll) {
    steps.push({ id: 'employees', title: 'Ingresa a tus trabajadores', description: 'Con su AFP, salud y sueldo base para calcular las liquidaciones.', href: '/dashboard/hr', done: employees > 0 });
  }
  if (features.hasTreasury || features.hasInstallmentPlans) {
    steps.push({ id: 'khipu', title: 'Conecta Khipu para cobrar en línea', description: 'Envía links de pago y el cobro se registra solo al confirmarse.', href: '/dashboard/settings/integrations', done: Boolean(khipu?.khipuApiCredential) });
  }
  steps.push({ id: 'team', title: 'Invita a tu equipo', description: 'Cada persona con su rol: ventas, bodega, contabilidad…', href: '/dashboard/settings/users', done: users > 1 || invitations > 0 });
  if (features.hasDteBilling) {
    steps.push({ id: 'first-sale', title: 'Emite tu primera venta', description: 'Factura o boleta, con stock, cobro y asiento en un solo paso.', href: '/dashboard/sales/new', done: issuedSales > 0 });
  }
  return steps;
}
