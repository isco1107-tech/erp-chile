'use client';

import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, FileUp, Loader2, ShieldCheck, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';
import { getFolioAvailabilityAction, revokeCafAction, uploadCafAction } from '@/modules/dte/actions/caf.actions';
import type { FolioAvailability } from '@/modules/dte/services/caf.service';

import { useConfirm } from '@/components/ui/confirm-provider';
/**
 * Administración de folios autorizados (CAF) del SII.
 *
 * El archivo se lee en el navegador y se manda como texto a una Server Action:
 * un CAF pesa unos pocos KB, muy por debajo del límite de 1 MB de una Server
 * Action, así que no hace falta un Route Handler como en las subidas de
 * imágenes.
 */

const LOW_FOLIO_THRESHOLD = 20;
const NUMBER_FORMAT = new Intl.NumberFormat('es-CL');

interface FolioManagerClientProps {
  initialAvailability: FolioAvailability[];
  canManage: boolean;
}

export default function FolioManagerClient({ initialAvailability, canManage }: FolioManagerClientProps) {
  const confirm = useConfirm();
  const [availability, setAvailability] = useState(initialAvailability);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const xml = await file.text();
      const result = await uploadCafAction({ xml });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'CAF cargado');
      // Se recarga la disponibilidad desde el servidor en vez de recalcularla
      // en el cliente: el rango recién cargado puede convivir con otros.
      const refreshed = await getFolioAvailabilityAction();
      if (refreshed.success) setAvailability(refreshed.data);
    } catch {
      toast.error('No se pudo leer el archivo');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function handleRevoke(cafId: string, label: string) {
    if (!await confirm(`Se dejarán de asignar folios de este rango (${label}). Los documentos ya emitidos no se ven afectados. ¿Continuar?`)) {
      return;
    }
    startTransition(async () => {
      const result = await revokeCafAction(cafId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Rango revocado');
      setAvailability((current) =>
        current
          .map((entry) => ({
            ...entry,
            ranges: entry.ranges.filter((range) => range.id !== cafId),
          }))
          .filter((entry) => entry.ranges.length > 0)
          .map((entry) => ({
            ...entry,
            remaining: entry.ranges.reduce((sum, range) => sum + range.remaining, 0),
          }))
      );
    });
  }

  return (
    <div className="space-y-4">
      <div className="max-w-3xl space-y-4 rounded-xl border border-border p-4">
        <div>
          <h2 className="font-semibold">Cargar folios autorizados (CAF)</h2>
          <p className="text-sm text-muted-foreground">
            Un CAF es el archivo XML que descargas desde el portal del SII (Servicios Online → Factura Electrónica → Timbraje
            Electrónico) y que autoriza un rango de folios para un tipo de documento. Sin un CAF vigente no se pueden emitir documentos
            con validez tributaria: el folio no es un número que elija el sistema, es uno que el SII entregó de antemano.
          </p>
        </div>

        {canManage ? (
          <>
            <input
              ref={fileInput}
              type="file"
              accept=".xml,text/xml,application/xml"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <Button type="button" onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileUp className="mr-2 size-4" />}
              Seleccionar archivo CAF (.xml)
            </Button>
            <p className="text-xs text-muted-foreground">
              El archivo contiene la llave privada con la que se timbran tus documentos. Se guarda cifrado y nunca se muestra
              completo en pantalla.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No tienes permisos para cargar folios. Esta sección está reservada para Dueños, Administradores y Contadores.
          </p>
        )}
      </div>

      <div className="max-w-3xl space-y-3 rounded-xl border border-border p-4">
        <h2 className="font-semibold">Folios disponibles</h2>

        {availability.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Todavía no hay folios cargados. Mientras no cargues un CAF, los documentos que emitas llevan numeración interna y no
            tienen validez tributaria ante el SII.
          </p>
        )}

        {availability.map((entry) => {
          const low = entry.remaining <= LOW_FOLIO_THRESHOLD;
          return (
            <div key={entry.dteType} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {DTE_TYPE_LABELS[entry.dteType] ?? entry.dteType}{' '}
                    <span className="text-xs text-muted-foreground">(tipo {entry.siiCode})</span>
                  </p>
                  <p className={`text-sm ${low ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {low ? <AlertTriangle className="mr-1 inline size-3.5" /> : <ShieldCheck className="mr-1 inline size-3.5" />}
                    {NUMBER_FORMAT.format(entry.remaining)} folios disponibles
                    {low && ' — solicita un CAF nuevo en el SII antes de quedarte sin folios'}
                  </p>
                </div>
              </div>

              <ul className="mt-2 space-y-1">
                {entry.ranges.map((range) => (
                  <li key={range.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      Rango {NUMBER_FORMAT.format(range.rangeFrom)}–{NUMBER_FORMAT.format(range.rangeTo)} · usados{' '}
                      {NUMBER_FORMAT.format(range.rangeTo - range.rangeFrom + 1 - range.remaining)} · quedan{' '}
                      {NUMBER_FORMAT.format(range.remaining)}
                    </span>
                    {canManage && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => handleRevoke(range.id, `${range.rangeFrom}–${range.rangeTo}`)}
                      >
                        <Ban className="mr-1 size-3.5" /> Revocar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
