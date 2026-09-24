import { PageHeader } from '@/components/ui/PageHeader';
import ApiKeysClient from '@/components/settings/ApiKeysClient';
import { getAppUrl } from '@/lib/email/mailer';

export const metadata = { title: 'API e Integraciones' };

export default function ApiSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuración"
        title="API REST"
        description="Conecta tu tienda en línea, planillas o herramientas como Zapier, Make o n8n con llaves que solo tienen los permisos que les das."
      />
      <ApiKeysClient baseUrl={getAppUrl()} />
    </div>
  );
}
