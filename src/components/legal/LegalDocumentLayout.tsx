import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Envoltorio compartido de las páginas legales públicas (`/politica-privacidad`,
 * `/aether/privacidad`): mismo tipográfico y estructura para ambas en vez de
 * duplicar el layout en cada `page.tsx`. Sin sidebar ni sesión — vive fuera
 * del grupo `(dashboard)` y está exceptuada en `src/proxy.ts` (Sección de
 * `PUBLIC_ROUTES`), porque quien la lee normalmente no tiene cuenta ERP.
 */
export default function LegalDocumentLayout({
  eyebrow,
  title,
  lastUpdated,
  backHref,
  backLabel,
  children,
}: {
  eyebrow: string;
  title: string;
  lastUpdated: string;
  backHref: string;
  backLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background px-4 py-14 text-foreground">
      <article className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última actualización: {lastUpdated}</p>

        <div className="[&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mb-3 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-foreground/90 [&_li]:mb-1.5 [&_li]:text-sm [&_li]:leading-relaxed [&_li]:text-foreground/90 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 mt-8 border-t border-border pt-8">
          {children}
        </div>

        <Link href={backHref} className="mt-10 inline-block text-sm underline underline-offset-4">
          {backLabel}
        </Link>
      </article>
    </div>
  );
}
