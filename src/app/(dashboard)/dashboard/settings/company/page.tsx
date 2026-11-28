import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import CompanyProfileForm from '@/components/settings/CompanyProfileForm';
import IpAllowlistForm from '@/components/settings/IpAllowlistForm';
import N8nWebhookForm from '@/components/settings/N8nWebhookForm';
import McpConnectorForm from '@/components/settings/McpConnectorForm';
import IntegrationsForm from '@/components/settings/IntegrationsForm';
import CompanyBackupCard from '@/components/settings/CompanyBackupCard';
import HermesLinkForm from '@/components/settings/HermesLinkForm';
import ScaleLabelForm from '@/components/settings/ScaleLabelForm';
import DefaultDomainForm from '@/components/settings/DefaultDomainForm';
import { getCompanyProfileAction, getCompanySettingsAction } from '@/lib/actions/company';
import { getN8nWebhookSecretAction } from '@/modules/webhooks/actions/n8n-secret.actions';
import { getIntegrationsStatusAction } from '@/lib/actions/integrations';
import { getMcpConnectorSettingsAction } from '@/modules/mcp/actions/mcp-settings.actions';
import { getHermesLinkAction } from '@/modules/hermes/actions/hermes-link.actions';
import { getScaleLabelFormatAction } from '@/modules/pos/actions/scale-label.actions';
import { getDefaultDomainAction } from '@/lib/actions/default-domain';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Perfil de Empresa' };

export default async function CompanySettingsPage() {
  const context = await getAuthContext();
  const allowed = can(context, 'settings:company');
  const showScaleLabels = allowed && context.features.hasPos;
  // El dominio predeterminado solo importa si la empresa puede crear páginas públicas (certámenes, sitios, tiendas, academia).
  const { hasEventProjects, hasWebSites, hasEcommerce, hasAcademy } = context.features;
  const showDefaultDomain = allowed && (hasEventProjects || hasWebSites || hasEcommerce || hasAcademy);
  const [result, settingsResult, webhookSecretResult, mcpSettingsResult, integrationsResult, hermesResult, scaleLabelResult, defaultDomainResult] = allowed
    ? await Promise.all([
        getCompanyProfileAction(),
        getCompanySettingsAction(),
        getN8nWebhookSecretAction(),
        getMcpConnectorSettingsAction(),
        getIntegrationsStatusAction(),
        getHermesLinkAction(),
        showScaleLabels ? getScaleLabelFormatAction() : Promise.resolve(null),
        showDefaultDomain ? getDefaultDomainAction() : Promise.resolve(null),
      ])
    : [null, null, null, null, null, null, null, null];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-tutorial="module-header">Perfil de Empresa</h1>
        <Link href="/dashboard/settings" className={buttonVariants({ variant: 'outline' })}>← Volver</Link>
      </div>

      {!allowed && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          No tienes permisos para editar el perfil de la empresa. Esta sección está reservada para Dueños y Administradores.
        </p>
      )}
      {allowed && result && !result.success && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{result.error}</p>
      )}
      {allowed && result?.success && settingsResult?.success && (
        <>
          <CompanyProfileForm company={result.data} settings={settingsResult.data} />
          <IpAllowlistForm settings={settingsResult.data} />
          {integrationsResult?.success && <IntegrationsForm initial={integrationsResult.data} />}
          <N8nWebhookForm initialSecret={webhookSecretResult?.success ? webhookSecretResult.data : null} />
          <McpConnectorForm initialEnabled={mcpSettingsResult?.success ? mcpSettingsResult.data.enabled : false} />
          {hermesResult?.success && context.features.hasInventory && <HermesLinkForm initial={hermesResult.data} />}
          {showDefaultDomain && defaultDomainResult?.success && <DefaultDomainForm initial={defaultDomainResult.data} />}
          {showScaleLabels && scaleLabelResult?.success && <ScaleLabelForm initial={scaleLabelResult.data} />}
          {can(context, 'company:export') && <CompanyBackupCard />}
        </>
      )}
    </div>
  );
}
