'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressRow } from '@/components/ui/ProgressRow';
import type { GettingStartedStep } from '@/modules/inbox/getting-started.service';

function storageKey(companyId: string) {
  return `getting-started-hidden:${companyId}`;
}

/**
 * Lista de primeros pasos del inicio. Se oculta sola al completarse y se
 * puede cerrar antes; lo cerrado se recuerda por navegador (es una
 * preferencia de vista, no un dato de la empresa).
 */
export default function GettingStartedCard({ companyId, steps }: { companyId: string; steps: GettingStartedStep[] }) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(storageKey(companyId)) === '1');
    } catch {
      setHidden(false);
    }
  }, [companyId]);

  const done = steps.filter((step) => step.done).length;
  if (hidden || done === steps.length) return null;

  function dismiss() {
    setHidden(true);
    try {
      window.localStorage.setItem(storageKey(companyId), '1');
    } catch {
      // Sin almacenamiento local (modo privado): se oculta solo por esta visita.
    }
  }

  const next = steps.find((step) => !step.done);

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Primeros pasos</h2>
          <p className="text-sm text-muted-foreground">
            {done} de {steps.length} listos{next ? ` · siguiente: ${next.title.toLowerCase()}` : ''}
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" aria-label="Ocultar primeros pasos" onClick={dismiss}>
          <X aria-hidden="true" />
        </Button>
      </div>
      <ProgressRow label="Avance" value={(done / steps.length) * 100} color="var(--success)" className="mt-3" />
      <ul className="mt-4 grid gap-2 md:grid-cols-2">
        {steps.map((step) => (
          <li key={step.id}>
            <Link href={step.href} className="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50">
              {step.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
              <span>
                <span className={`block text-sm font-medium ${step.done ? 'text-muted-foreground line-through' : ''}`}>{step.title}</span>
                {!step.done && <span className="block text-xs text-muted-foreground">{step.description}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
