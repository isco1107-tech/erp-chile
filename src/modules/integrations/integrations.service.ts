import 'server-only';

import { prisma } from '@/lib/prisma';
import { isEmailConfigured } from '@/lib/email/mailer';
import type { CompanyFeatureFlags } from '@/lib/auth/modules';

/**
 * Estado de todas las integraciones de la empresa en un solo lugar. Solo lee:
 * cada integración se configura en su propia pantalla (el centro enlaza ahí).
 * Nunca devuelve secretos, solo si están configurados.
 */

export type IntegrationStatus = 'connected' | 'available' | 'not_contracted' | 'platform';

export interface IntegrationCard {
  id: string;
  name: string;
  category: 'Tributario' | 'Pagos' | 'Bancos' | 'Comunicación' | 'Automatización' | 'Productividad';
  description: string;
  status: IntegrationStatus;
  detail: string;
  href: string | null;
}

export async function getIntegrationsOverview(companyId: string, features: CompanyFeatureFlags): Promise<IntegrationCard[]> {
  const [settings, activeCafs, apiKeys, activeRules, bankAccounts, statementLines] = await Promise.all([
    prisma.companySettings.findUnique({
      where: { companyId },
      select: { khipuApiCredential: true, n8nWebhookSecret: true, calendarSyncToken: true, siiApiEnabled: true, installmentPortalToken: true },
    }),
    prisma.dteCaf.count({ where: { companyId, status: 'ACTIVE' } }),
    prisma.apiKey.count({ where: { companyId, revokedAt: null } }),
    prisma.workflowRule.findMany({ where: { companyId, isActive: true }, select: { actions: true }, take: 500 }),
    prisma.treasuryAccount.count({ where: { companyId, type: 'BANK', isActive: true } }),
    prisma.bankStatementLine.count({ where: { companyId } }),
  ]);

  const khipu = Boolean(settings?.khipuApiCredential);
  // `actions` es JSON (lista de acciones de la regla): se cuenta en memoria.
  const webhookRules = activeRules.filter(
    (rule) => Array.isArray(rule.actions) && rule.actions.some((action) => typeof action === 'object' && action !== null && 'type' in action && action.type === 'CALL_WEBHOOK')
  ).length;
  const cards: IntegrationCard[] = [
    {
      id: 'sii-caf',
      name: 'SII — Folios y timbre electrónico',
      category: 'Tributario',
      description: 'Carga los CAF autorizados por el SII: cada documento sale con folio oficial y timbre (TED).',
      status: !features.hasDteBilling ? 'not_contracted' : activeCafs > 0 ? 'connected' : 'available',
      detail: activeCafs > 0 ? `${activeCafs} rango(s) de folios activos` : 'Sin CAF cargado: se usa numeración interna',
      href: features.hasDteBilling ? '/dashboard/settings/folios' : null,
    },
    {
      id: 'sii-api',
      name: 'SII — Consulta de contribuyentes',
      category: 'Tributario',
      description: 'Autocompleta razón social, giro y dirección al ingresar el RUT de un cliente o proveedor.',
      status: settings?.siiApiEnabled ? 'connected' : 'available',
      detail: settings?.siiApiEnabled ? 'Activa' : 'Configúrala en el perfil de empresa',
      href: '/dashboard/settings/company',
    },
    {
      id: 'khipu',
      name: 'Khipu — Pagos por transferencia',
      category: 'Pagos',
      description: 'Cobra facturas con un link de pago y deja que tus clientes paguen cuotas en línea. El cobro se registra solo en Tesorería y contabilidad.',
      status: khipu ? 'connected' : 'available',
      detail: khipu ? 'Cuenta conectada: links de pago de facturas y portal de cuotas activos' : 'Pega la API key de tu cuenta de cobro Khipu',
      href: null,
    },
    {
      id: 'bank-statements',
      name: 'Cartolas bancarias',
      category: 'Bancos',
      description: 'Importa la cartola en Excel o CSV de cualquier banco chileno y concíliala contra Tesorería con sugerencias automáticas.',
      status: !features.hasBankReconciliation ? 'not_contracted' : statementLines > 0 ? 'connected' : 'available',
      detail: features.hasBankReconciliation ? `${bankAccounts} cuenta(s) bancaria(s) · ${statementLines} movimiento(s) importados` : 'Módulo Conciliación Bancaria',
      href: features.hasBankReconciliation ? '/dashboard/treasury/reconciliation' : null,
    },
    {
      id: 'public-api',
      name: 'API REST (tienda en línea, Zapier, Make, n8n)',
      category: 'Automatización',
      description: 'Emite boletas desde tu e-commerce, sincroniza catálogo y stock, y consulta cuentas por cobrar desde otros sistemas.',
      status: !features.hasPublicApi ? 'not_contracted' : apiKeys > 0 ? 'connected' : 'available',
      detail: features.hasPublicApi ? `${apiKeys} llave(s) activa(s)` : 'Módulo API e Integraciones',
      href: features.hasPublicApi ? '/dashboard/settings/api' : null,
    },
    {
      id: 'outbound-webhooks',
      name: 'Webhooks salientes',
      category: 'Automatización',
      description: 'Avisa a otros sistemas cuando pasa algo: venta emitida, pago recibido, stock bajo, factura recurrente lista…',
      status: webhookRules > 0 ? 'connected' : 'available',
      detail: webhookRules > 0 ? `${webhookRules} regla(s) con webhook` : 'Crea una regla con la acción “Llamar webhook”',
      href: '/dashboard/settings/automations',
    },
    {
      id: 'n8n-inbound',
      name: 'Webhook entrante (n8n)',
      category: 'Automatización',
      description: 'Recibe eventos firmados desde n8n u otra herramienta para crear registros en el ERP.',
      status: settings?.n8nWebhookSecret ? 'connected' : 'available',
      detail: settings?.n8nWebhookSecret ? 'Secreto generado' : 'Genera el secreto en Automatizaciones',
      href: '/dashboard/settings/automations',
    },
    {
      id: 'calendar',
      name: 'Google Calendar / Outlook (ICS)',
      category: 'Productividad',
      description: 'Suscríbete al calendario de eventos y vencimientos desde tu calendario personal.',
      status: !features.hasEventProjects ? 'not_contracted' : settings?.calendarSyncToken ? 'connected' : 'available',
      detail: settings?.calendarSyncToken ? 'Feed activo' : 'Genera el link desde Calendario',
      href: features.hasEventProjects ? '/dashboard/calendar' : null,
    },
    {
      id: 'email',
      name: 'Correo transaccional',
      category: 'Comunicación',
      description: 'Envío de comprobantes, recordatorios de cobranza y avisos de automatizaciones.',
      status: isEmailConfigured() ? 'platform' : 'available',
      detail: isEmailConfigured() ? 'Administrado por la plataforma' : 'El envío de correos no está configurado en la plataforma',
      href: null,
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp (click to chat)',
      category: 'Comunicación',
      description: 'Botón de WhatsApp en fichas de clientes y en los links de pago, con el mensaje ya escrito.',
      status: 'platform',
      detail: 'Disponible sin configuración',
      href: null,
    },
  ];
  return cards;
}
