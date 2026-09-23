import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import WardrobeClient from '@/components/production/WardrobeClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Vestuario' };

export default async function ProductionWardrobePage() {
  const context = await getAuthContext();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Producción en vivo"
        title="Vestuario"
        description="Looks por candidata y por bloque del show: pruebas, entregas, devoluciones y valor declarado de cada prenda (diseñador, auspicio, arriendo)."
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando vestuario…</p>}>
        <WardrobeClient canWrite={can(context, 'production:write')} />
      </Suspense>
    </div>
  );
}
