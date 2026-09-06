'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ChevronDown, ArrowRight, Printer } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { ManualSection } from '@/modules/manual/content';

export default function ManualClient({ sections, companyName }: { sections: ManualSection[]; companyName: string }) {
  const [query, setQuery] = useState('');

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((section) => ({
        ...section,
        topics: section.topics.filter(
          (topic) =>
            topic.title.toLowerCase().includes(q) ||
            topic.steps.some((step) => step.toLowerCase().includes(q)) ||
            section.title.toLowerCase().includes(q)
        ),
      }))
      .filter((section) => section.topics.length > 0);
  }, [sections, query]);

  return (
    <div className="space-y-4">
      {/* Vista interactiva — oculta al imprimir: los <details> colapsados no
          imprimen su contenido de forma confiable entre navegadores, así que
          la versión para PDF/impresión es la sección de abajo (siempre
          expandida), no esta. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar en el manual (ej. “boleta”, “asistencia”, “plan de pago”)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          <Printer /> Descargar / Imprimir Manual
        </Button>
      </div>

      {filteredSections.length === 0 && (
        <p className="text-sm text-muted-foreground print:hidden">Sin resultados — prueba con otra palabra, o pregúntale al asistente.</p>
      )}

      <div className="space-y-3 print:hidden">
        {filteredSections.map((section) => (
          <div key={section.title} className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <p className="text-sm font-semibold text-foreground">{section.title}</p>
              <Link href={section.route} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Ir al módulo <ArrowRight className="size-3.5" />
              </Link>
            </div>
            {section.screenshot && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={section.screenshot}
                alt={`Captura de pantalla: ${section.title}`}
                className="w-full border-b border-border object-cover"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            <div className="divide-y divide-border">
              {section.topics.map((topic) => (
                <details key={topic.id} className="group px-4 py-2.5" open={query.trim().length > 0}>
                  <summary className="flex cursor-pointer list-none items-center justify-between text-sm text-foreground">
                    {topic.title}
                    <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                    {topic.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Vista de impresión/PDF — oculta en pantalla, todo expandido siempre. */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">Manual de Usuario — {companyName}</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Generado el {new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
        {sections.map((section) => (
          <div key={section.title} className="mb-6 break-inside-avoid">
            <h2 className="mb-2 text-lg font-semibold">{section.title}</h2>
            {section.topics.map((topic) => (
              <div key={topic.id} className="mb-3">
                <h3 className="mb-1 text-sm font-semibold">{topic.title}</h3>
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  {topic.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
