import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import KhipuCredentialForm from '@/components/settings/KhipuCredentialForm';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getIntegrationsOverview, type IntegrationCard, type IntegrationStatus } from '@/modules/integrations/integrations.service';

export const metadata = { title: 'Integraciones' };

const STATUS: Record<IntegrationStatus, { label: string; tone: 'success' | 'info' | 'neutral' | 'accent' }> = {
  connected: { label: 'Conectada', tone: 'success' },
  available: { label: 'Disponible', tone: 'info' },
  platform: { label: 'Incluida', tone: 'accent' },
  not_contracted: { label: 'No contratada', tone: 'neutral' },
};

const CATEGORY_ORDER: IntegrationCard['category'][] = ['Tributario', 'Pagos', 'Bancos', 'Automatización', 'Comunicación', 'Productividad'];

export default async function IntegrationsPage() {
  const context = await getAuthContext();
  if (!can(context, 'settings:company')) notFound();
  const cards = await getIntegrationsOverview(context.companyId, context.features);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuración"
        title="Integraciones"
        description="Todo lo que el ERP conecta con el exterior: SII, pagos, bancos, tu tienda en línea y tus otras herramientas."
      />
      {CATEGORY_ORDER.map((category) => {
        const items = cards.filter((card) => card.category === category);
        if (items.length === 0) return null;
        return (
          <section key={category} className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">{category}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((card) => (
                <article key={card.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{card.name}</h3>
                    <StatusBadge tone={STATUS[card.status].tone}>{STATUS[card.status].label}</StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{card.description}</p>
                  <p className="mt-2 text-xs">{card.detail}</p>
                  {card.id === 'khipu' && <KhipuCredentialForm connected={card.status === 'connected'} />}
                  {card.href && (
                    <Link href={card.href} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                      Configurar <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  )}
                  {card.status === 'not_contracted' && <p className="mt-3 text-xs text-muted-foreground">Pide a tu administrador de Aether que active este módulo.</p>}
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
