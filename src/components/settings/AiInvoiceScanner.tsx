'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MAX_AI_SCAN_IMAGES, type AiScanRow } from '@/modules/import/schema';
import { useAiRowsReview } from '@/hooks/use-ai-rows-review';
import AiRowsReviewTable from './AiRowsReviewTable';

/**
 * Sube fotos de facturas/boletas, las manda a escanear por IA
 * (`/api/import/ai-scan`) y deja una tabla editable (`AiRowsReviewTable`,
 * vía `useAiRowsReview`) donde el usuario corrige lo que haga falta antes de
 * confirmar. La confirmación pasa por `/api/import/commit-rows` — el mismo
 * commit que usa el asistente de Excel para `historicalSales`/
 * `historicalPurchases` — así que nada de lo que llega por foto se guarda sin
 * pasar antes por esta revisión humana.
 *
 * Limitación conocida: la imagen original no se conserva (no se sube a Vercel
 * Blob en esta primera versión). Solo se usa para la llamada al modelo y
 * luego se descarta — el documento queda en el sistema sin el comprobante
 * escaneado adjunto.
 */
export default function AiInvoiceScanner() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [scanning, setScanning] = useState(false);

  const {
    rows,
    sortedRows,
    blockingCount,
    committing,
    products,
    addRows,
    updateCell,
    removeRow,
    updateItem,
    addItem,
    removeItem,
    confirmImport,
  } = useAiRowsReview();

  async function scan() {
    if (files.length === 0) {
      toast.error('Selecciona al menos una foto');
      return;
    }
    if (files.length > MAX_AI_SCAN_IMAGES) {
      toast.error(`Máximo ${MAX_AI_SCAN_IMAGES} fotos por envío`);
      return;
    }

    const body = new FormData();
    for (const file of files) body.append('files', file);

    setScanning(true);
    try {
      const response = await fetch('/api/import/ai-scan', { method: 'POST', body });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? 'No se pudieron escanear las imágenes');
        return;
      }
      addRows(payload.data as AiScanRow[]);
      setFiles([]);
      if (fileRef.current) fileRef.current.value = '';
      toast.success(`${(payload.data as AiScanRow[]).length} foto(s) analizadas`);
    } catch {
      toast.error('No se pudo contactar al servidor');
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <div>
        <h2 className="text-lg font-semibold">Escanear fotos de facturas/boletas con IA</h2>
        <p className="text-sm text-muted-foreground">
          Sube fotos de tu archivo en papel. Una IA lee cada una y arma una fila con RUT, fecha y el detalle de
          productos (nombre, cantidad, precio) — el neto/IVA/total se calculan desde ese detalle, igual que el
          documento original. Revisa y corrige antes de guardar nada — nunca se guarda directo.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="ai-files">Fotos (JPG, PNG o WEBP)</Label>
          <input
            id="ai-files"
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="block w-full rounded-lg border border-input px-2.5 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Máximo {MAX_AI_SCAN_IMAGES} fotos por envío, 5 MB cada una. Puedes escanear varios lotes seguidos.
          </p>
        </div>
        <Button type="button" disabled={scanning || files.length === 0} onClick={scan}>
          <Camera className="mr-2 size-4" /> {scanning ? 'Analizando...' : `Escanear ${files.length || ''}`}
        </Button>
      </div>

      <AiRowsReviewTable
        rows={rows}
        sortedRows={sortedRows}
        blockingCount={blockingCount}
        committing={committing}
        products={products}
        updateCell={updateCell}
        removeRow={removeRow}
        updateItem={updateItem}
        addItem={addItem}
        removeItem={removeItem}
        confirmImport={confirmImport}
      />
    </div>
  );
}
