'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { exportPersonalDataAction, searchPersonalDataAction } from '@/modules/data-protection/actions/data-protection.actions';
import type { PersonalDataResult } from '@/modules/data-protection/services/personal-data.service';
import type { SearchSeed } from './RequestsPanel';

const RETENTION_TEXT = {
  ERASABLE: { tone: 'info' as const, label: 'Se puede eliminar a pedido', hint: 'Elimínalo desde su ficha una vez resuelta la solicitud.' },
  LEGAL_RETENTION: { tone: 'warning' as const, label: 'Conservación legal', hint: 'Los documentos tributarios, contables y laborales no se eliminan mientras dure el plazo legal; se puede rectificar o limitar su uso.' },
  ACCOUNT: { tone: 'neutral' as const, label: 'Cuenta de usuario', hint: 'Se gestiona desde Equipo & Colaboradores.' },
};

/** Valores que no conviene mostrar en pantalla (fechas ISO, booleans) con formato legible. */
function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (value instanceof Date) return value.toLocaleString('es-CL');
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
}

export default function PersonSearchPanel({ initial }: { initial: SearchSeed | null }) {
  const [email, setEmail] = useState(initial?.email ?? '');
  const [rut, setRut] = useState(initial?.rut ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PersonalDataResult | null>(null);

  async function search(query: { email: string; rut: string } = { email, rut }, requestId?: string) {
    setBusy(true);
    try {
      const response = await searchPersonalDataAction(query, requestId);
      if (!response.success) return void toast.error(response.error);
      setResult(response.data);
    } finally {
      setBusy(false);
    }
  }

  // Al llegar desde una solicitud ("Buscar sus datos") se busca de inmediato.
  useEffect(() => {
    if (initial && (initial.email || initial.rut)) {
      setEmail(initial.email);
      setRut(initial.rut);
      void search({ email: initial.email, rut: initial.rut }, initial.requestId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  async function download() {
    setBusy(true);
    try {
      if (!initial) return;
      const response = await exportPersonalDataAction(initial.requestId);
      if (!response.success) return void toast.error(response.error);
      const url = URL.createObjectURL(new Blob([response.data.json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = response.data.filename;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-xs text-muted-foreground">
        Busca todo lo que tu empresa guarda de una persona por su correo o su RUT. Sirve para responder solicitudes de acceso y portabilidad (con la copia
        descargable) y para ubicar qué corregir o eliminar. Cada consulta y cada descarga queda en la auditoría.
      </p>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <div><Label htmlFor="personEmail">Correo</Label><Input id="personEmail" type="email" className="w-64" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label htmlFor="personRut">RUT</Label><Input id="personRut" className="w-44" value={rut} onChange={(e) => setRut(e.target.value)} placeholder="12.345.678-5" /></div>
        <Button type="submit" size="sm" disabled={busy || (!email.trim() && !rut.trim())}>Buscar</Button>
        {result && result.totalRecords > 0 && initial?.canExport && initial.identityVerified && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={download}><Download className="size-3.5" /> Descargar copia (JSON)</Button>
        )}
      </form>
      {result && result.totalRecords > 0 && initial?.canExport && !initial.identityVerified && (
        <p className="text-xs text-muted-foreground">Para descargar la copia, primero marca «Identidad verificada» en la solicitud.</p>
      )}
      {result && result.totalRecords > 0 && !initial && (
        <p className="text-xs text-muted-foreground">La copia descargable se entrega desde una solicitud de acceso o portabilidad ya verificada. Si la persona aún no la hizo, regístrala en la pestaña «Solicitudes de titulares».</p>
      )}
      {result && result.omitted.length > 0 && (
        <p className="rounded-lg bg-warning-soft p-2 text-xs text-warning">No se muestran por tus permisos: {result.omitted.join(', ')}. Pide a quien los tenga que los revise.</p>
      )}

      {result && (
        result.totalRecords === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No se encontraron datos de esa persona en tu empresa.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium">{result.totalRecords} registros encontrados</p>
            {result.sections.map((section) => {
              const retention = RETENTION_TEXT[section.retention];
              return (
                <section key={section.key} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold">{section.label} ({section.records.length})</h4>
                    <StatusBadge tone={retention.tone}>{retention.label}</StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{retention.hint}</p>
                  <ul className="mt-2 space-y-2">
                    {section.records.map((record) => (
                      <li key={record.id} className="rounded-lg bg-muted/40 p-2 text-xs">
                        <p className="mb-1">
                          <StatusBadge tone={record.matchedBy.length === 2 || (result.query.email === null || result.query.rutClean === null) ? 'success' : 'warning'}>
                            Coincide por {record.matchedBy.join(' y ') || '—'}
                          </StatusBadge>
                          {record.matchedBy.length === 1 && result.query.email && result.query.rutClean && (
                            <span className="ml-2 text-warning">Verifica que sea la misma persona antes de entregar o modificar estos datos.</span>
                          )}
                        </p>
                        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                          {Object.entries(record).filter(([key]) => key !== 'id' && key !== 'matchedBy').map(([key, value]) => (
                            <div key={key} className="min-w-0"><dt className="inline text-muted-foreground">{key}: </dt><dd className="inline break-words">{show(value)}</dd></div>
                          ))}
                        </dl>
                        {section.hrefTemplate && (
                          <Link href={section.hrefTemplate.replace('{id}', record.id)} className="mt-2 inline-block text-primary underline">Abrir registro</Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
