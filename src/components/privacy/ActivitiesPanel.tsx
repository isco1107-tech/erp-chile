'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LEGAL_BASIS_LABELS, PROCESSING_ACTIVITIES, activitySubprocessors } from '@/lib/privacy/processing-activities';
import { SCOPE_LABELS, SUBPROCESSORS } from '@/lib/privacy/subprocessors';

/** Una celda CSV con comillas y escape; `;` como separador porque es el que espera Excel en Chile. */
const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;

function buildCsv(companyName: string): string {
  const header = ['Actividad', 'Titulares', 'Datos tratados', 'Finalidad', 'Base de licitud', 'Datos sensibles o de menores', 'Plazo de conservación', 'Destinatarios', 'Encargados y transferencias'];
  const rows = PROCESSING_ACTIVITIES.map((a) => [
    a.name,
    a.dataSubjects,
    a.dataCategories.join(', '),
    a.purpose,
    a.legalBasis.map((b) => LEGAL_BASIS_LABELS[b]).join(', '),
    a.sensitive ? 'Sí' : 'No',
    a.retention,
    a.recipients.join(', '),
    activitySubprocessors(a, SUBPROCESSORS).map((s) => `${s.name} (${s.location})`).join(', '),
  ]);
  const lines = [[`Registro de actividades de tratamiento — ${companyName}`], [], header, ...rows].map((row) => row.map(cell).join(';'));
  return `﻿${lines.join('\r\n')}`;
}

export default function ActivitiesPanel({ companyName, contractedModules }: { companyName: string; contractedModules: string[] }) {
  const visible = PROCESSING_ACTIVITIES.filter((a) => a.module === 'always' || contractedModules.includes(a.module));

  function download() {
    const url = URL.createObjectURL(new Blob([buildCsv(companyName)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'registro-actividades-tratamiento.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-xs text-muted-foreground">
          Describe qué datos personales trata tu empresa en este sistema, para qué, con qué base, por cuánto tiempo y a quién llegan. Parte de lo que el
          ERP hace hoy; los plazos son sugerencias de partida que debes ajustar a tu política y validar con tu asesoría legal.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={download}><Download className="size-3.5" /> Descargar (CSV)</Button>
      </div>

      <ul className="space-y-3">
        {visible.map((a) => (
          <li key={a.id} className="rounded-xl border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold">{a.name}</h4>
              {a.sensitive && <StatusBadge tone="warning">Datos sensibles o de menores</StatusBadge>}
            </div>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Titulares</dt><dd>{a.dataSubjects}</dd></div>
              <div><dt className="text-muted-foreground">Finalidad</dt><dd>{a.purpose}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Datos</dt><dd>{a.dataCategories.join(' · ')}</dd></div>
              <div><dt className="text-muted-foreground">Base de licitud</dt><dd>{a.legalBasis.map((b) => LEGAL_BASIS_LABELS[b]).join(' · ')}</dd></div>
              <div><dt className="text-muted-foreground">Conservación</dt><dd>{a.retention}</dd></div>
              <div><dt className="text-muted-foreground">Destinatarios</dt><dd>{a.recipients.join(' · ')}</dd></div>
              <div><dt className="text-muted-foreground">Encargados</dt><dd>{activitySubprocessors(a, SUBPROCESSORS).map((s) => s.name).join(' · ')}</dd></div>
            </dl>
          </li>
        ))}
      </ul>

      <section>
        <h3 className="text-sm font-semibold">Encargados y transferencias internacionales</h3>
        <p className="mt-1 text-xs text-muted-foreground">Terceros que reciben datos para prestar el servicio. La mayoría trata los datos fuera de Chile; tu política debe decirlo.</p>
        <div className="mt-2 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground"><tr><th className="p-2">Proveedor</th><th className="p-2">Servicio</th><th className="p-2">País o región</th><th className="p-2">Alcance</th></tr></thead>
            <tbody>
              {SUBPROCESSORS.map((s) => (
                <tr key={s.id} className="border-t border-border align-top">
                  <td className="p-2 font-medium">{s.name}</td>
                  <td className="p-2">{s.service}</td>
                  <td className="p-2">{s.location}</td>
                  <td className="p-2">{SCOPE_LABELS[s.scope]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
