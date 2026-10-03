import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import PrivacyCenter from '@/components/privacy/PrivacyCenter';
import { can, getAuthContext } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { getAppUrl } from '@/lib/email/mailer';
import {
  getPrivacyPortalToken,
  getRequestsSummary,
  listDataSubjectRequests,
  listPrivacyIncidents,
} from '@/modules/data-protection/services/requests.service';

export const metadata = { title: 'Protección de datos' };

/** Módulos contratados que generan actividades de tratamiento propias (ver `processing-activities.ts`). */
const MODULE_BY_FLAG = {
  hasCandidates: 'candidates',
  hasPayroll: 'hr',
  hasTicketing: 'ticketing',
  hasPublicVoting: 'public-voting',
  hasInstallmentPlans: 'payment-plans',
  hasSponsorships: 'sponsorships',
  hasCustomerCare: 'customer-care',
  hasWebSites: 'web-sites',
} as const;

export default async function PrivacyPage() {
  const context = await getAuthContext();
  const allowed = can(context, 'settings:company');

  const data = allowed
    ? await Promise.all([
        listDataSubjectRequests(context.companyId),
        listPrivacyIncidents(context.companyId),
        getPrivacyPortalToken(context.companyId),
        getRequestsSummary(context.companyId),
        prisma.company.findUnique({ where: { id: context.companyId }, select: { businessName: true } }),
      ])
    : null;

  const contractedModules = Object.entries(MODULE_BY_FLAG).filter(([flag]) => context.features[flag as keyof typeof MODULE_BY_FLAG]).map(([, key]) => key as string);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-tutorial="module-header">Protección de datos</h1>
          <p className="text-sm text-muted-foreground">Cumplimiento de la Ley 21.719: derechos de los titulares, registro de actividades e incidentes.</p>
        </div>
        <Link href="/dashboard/settings" className={buttonVariants({ variant: 'outline' })}>← Volver</Link>
      </div>

      {!allowed || !data ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          No tienes permisos para ver esta sección. Está reservada para Dueños y Administradores.
        </p>
      ) : (
        <PrivacyCenter
          companyName={data[4]?.businessName ?? ''}
          contractedModules={contractedModules}
          requests={data[0]}
          incidents={data[1]}
          portalUrl={data[2] ? `${getAppUrl()}/derechos/${data[2]}` : null}
          openRequests={data[3].open}
          overdueRequests={data[3].overdue}
        />
      )}
    </div>
  );
}
