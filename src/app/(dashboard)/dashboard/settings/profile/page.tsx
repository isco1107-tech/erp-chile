import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import ProfileClient from '@/components/settings/ProfileClient';
import McpTokensCard from '@/components/settings/McpTokensCard';
import { listMcpTokensAction } from '@/modules/mcp/actions/mcp-tokens.actions';
import { getAuthContext } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';

export const metadata = { title: 'Mi Perfil' };

export default async function ProfilePage() {
  const context = await getAuthContext();
  // Lectura directa, sin pasar por `settings:company`: si el conector está
  // prendido o apagado no es sensible, cualquiera en la empresa puede verlo
  // acá — solo CAMBIARLO exige ese permiso (Configuración → Empresa).
  const [settings, tokensResult] = await Promise.all([
    prisma.companySettings.findUnique({ where: { companyId: context.companyId }, select: { mcpConnectorEnabled: true } }),
    listMcpTokensAction(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mi Perfil</h1>
          <p className="text-sm text-muted-foreground">
            Tus datos de contacto y tu actividad reciente en la plataforma.
          </p>
        </div>
        <Link href="/dashboard/settings" className={buttonVariants({ variant: 'outline' })}>← Volver</Link>
      </div>
      <ProfileClient />
      <McpTokensCard connectorEnabled={settings?.mcpConnectorEnabled ?? false} initialTokens={tokensResult.success ? tokensResult.data : []} />
    </div>
  );
}
