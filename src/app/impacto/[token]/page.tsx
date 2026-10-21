import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getClientIp } from '@/lib/security/cloudflare';
import { checkRateLimit, IMPACT_PAGE_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { producerCountLabel } from '@/lib/impact/summary';
import { getPublicImpact } from '@/modules/impact/services/impact.service';

export const metadata: Metadata = {
  title: 'Tu compra y sus productores',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

function Message({ title, text }: { title: string; text: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{text}</p>
    </main>
  );
}

export default async function ImpactPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const ip = getClientIp(await headers()) ?? 'unknown';
  if (!checkRateLimit(ip, IMPACT_PAGE_RATE_LIMIT).allowed) {
    return <Message title="Demasiadas consultas" text="Espera unos minutos y vuelve a escanear el código de tu boleta." />;
  }

  const impact = await getPublicImpact(token);
  if (!impact) {
    return (
      <Message
        title="Enlace no disponible"
        text="Este código no es válido, venció o la boleta ya no tiene información de productores. Revisa que hayas escaneado el código completo de tu boleta."
      />
    );
  }

  const date = impact.issuedAt.toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Santiago',
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 bg-background px-5 py-10 text-foreground">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {impact.companyName} · {date}
        </p>
        <h1 className="text-2xl font-semibold leading-tight text-balance">
          Compraste a {producerCountLabel(impact.producerCount)}
        </h1>
        <p className="text-sm text-muted-foreground">Gracias por elegir productos de quienes los hacen.</p>
      </header>

      <section aria-label="Productores de tu compra" className="rounded-xl border border-border bg-card p-4">
        <ul className="divide-y divide-border">
          {impact.producers.map((producer) => (
            <li key={producer.name} className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <span className="font-medium">{producer.name}</span>
              <span className="shrink-0 text-sm text-muted-foreground">
                {producer.itemCount} {producer.itemCount === 1 ? 'producto' : 'productos'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="text-xs text-muted-foreground">
        Información de tu boleta de {impact.companyName}. No incluye datos de pago ni de contacto de los productores.
      </footer>
    </main>
  );
}
