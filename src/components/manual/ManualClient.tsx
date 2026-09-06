'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ChevronDown, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { ManualSection } from '@/modules/manual/content';

export default function ManualClient({ sections }: { sections: ManualSection[] }) {
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
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar en el manual (ej. “boleta”, “asistencia”, “plan de pago”)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filteredSections.length === 0 && (
        <p className="text-sm text-muted-foreground">Sin resultados — prueba con otra palabra, o pregúntale al asistente.</p>
      )}

      <div className="space-y-3">
        {filteredSections.map((section) => (
          <div key={section.title} className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <p className="text-sm font-semibold text-foreground">{section.title}</p>
              <Link href={section.route} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Ir al módulo <ArrowRight className="size-3.5" />
              </Link>
            </div>
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
    </div>
  );
}
