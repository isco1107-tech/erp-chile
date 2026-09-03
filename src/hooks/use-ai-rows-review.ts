import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ENTITY_LABELS, IMPORT_COLUMNS, type AiScanItemLine, type AiScanRow, type ImportResult } from '@/modules/import/schema';
import { useProductOptions, type ProductOption } from './use-product-options';

export type { ProductOption };

let itemLocalIdSeq = 0;

/** Fila de trabajo local: la extracción de IA más un id estable para editar sin perder el foco. */
export interface WorkingAiScanRow extends AiScanRow {
  localId: string;
}

/**
 * Estado y acciones compartidas por cualquier pantalla que arme filas
 * candidatas vía IA (escaneo de fotos, interpretación de un prompt de texto)
 * y las deje editables antes de confirmar. Extraído de `AiInvoiceScanner` para
 * que el importador por prompt reutilice exactamente la misma revisión y el
 * mismo commit en vez de duplicar ~150 líneas de lógica.
 *
 * La confirmación pasa siempre por `/api/import/commit-rows` — el mismo
 * commit que usa el asistente de Excel para `historicalSales`/
 * `historicalPurchases` — así que nada de lo que arma la IA se guarda sin
 * pasar antes por esta revisión humana.
 */
export function useAiRowsReview() {
  const router = useRouter();
  // Correlativo único para toda la sesión de la pantalla: dos lotes/llamadas
  // distintas pueden devolver el mismo `rowNumber` desde el backend (empieza
  // en 1 cada vez), y es este número el que se manda al commit — así
  // `failedRows` del servidor siempre identifica sin ambigüedad a qué fila
  // local corresponde, sin importar de qué llamada vino.
  const nextRowNumber = useRef(1);

  const [rows, setRows] = useState<WorkingAiScanRow[]>([]);
  const [committing, setCommitting] = useState(false);
  const products = useProductOptions();

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) =>
        (a.row.values.issueDate || '9999-12-31').localeCompare(b.row.values.issueDate || '9999-12-31')
      ),
    [rows]
  );

  const blockingCount = rows.filter((r) => r.row.errors.length > 0).length;

  function addRows(newRows: AiScanRow[]) {
    const withIds = newRows.map((r) => {
      const rowNumber = nextRowNumber.current++;
      return { ...r, localId: `row-${rowNumber}`, row: { ...r.row, rowNumber } };
    });
    setRows((prev) => [...prev, ...withIds]);
  }

  function updateCell(localId: string, key: string, value: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.localId !== localId) return r;
        const columnLabel = IMPORT_COLUMNS[r.entity].find((c) => c.key === key)?.label;
        return {
          ...r,
          row: {
            ...r.row,
            values: { ...r.row.values, [key]: value },
            // Corrección optimista: al editar un campo se descartan sus
            // errores previos. La verdad final la vuelve a decidir el servidor
            // en `commitHistoricalRows` al confirmar — esto solo destraba el
            // botón para que el usuario no quede pegado corrigiendo a ciegas.
            errors: r.row.errors.filter((e) => e.column !== columnLabel),
          },
        };
      })
    );
  }

  function removeRow(localId: string) {
    setRows((prev) => prev.filter((r) => r.localId !== localId));
  }

  /** Edita cantidad/precio/descripción de una línea, o el producto vinculado (vía `productId`/`productLabel`). */
  function updateItem(rowLocalId: string, itemLocalId: string, patch: Partial<AiScanItemLine>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.localId !== rowLocalId) return r;
        const items = (r.row.items ?? []).map((item) => (item.localId === itemLocalId ? { ...item, ...patch } : item));
        return { ...r, row: { ...r.row, items } };
      })
    );
  }

  function addItem(rowLocalId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.localId !== rowLocalId) return r;
        const newItem: AiScanItemLine = {
          localId: `item-${++itemLocalIdSeq}`,
          description: '',
          quantity: 1,
          unitPrice: 0,
          productId: null,
          productLabel: null,
        };
        return {
          ...r,
          row: {
            ...r.row,
            items: [...(r.row.items ?? []), newItem],
            // Con al menos una línea de detalle, el Neto/Total del documento
            // se calcula desde las líneas al confirmar — el error "ingrese
            // neto o total" que la extracción original haya dejado ya no
            // aplica (misma corrección optimista que `updateCell`).
            errors: r.row.errors.filter((e) => e.column !== 'Monto Neto'),
          },
        };
      })
    );
  }

  function removeItem(rowLocalId: string, itemLocalId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.localId !== rowLocalId) return r;
        return { ...r, row: { ...r.row, items: (r.row.items ?? []).filter((item) => item.localId !== itemLocalId) } };
      })
    );
  }

  async function confirmImport() {
    if (rows.length === 0) return;
    if (blockingCount > 0) {
      toast.error('Corrige las filas con errores antes de confirmar');
      return;
    }

    setCommitting(true);
    try {
      const byEntity: Record<'historicalSales' | 'historicalPurchases', WorkingAiScanRow[]> = {
        historicalSales: rows.filter((r) => r.entity === 'historicalSales'),
        historicalPurchases: rows.filter((r) => r.entity === 'historicalPurchases'),
      };

      let totalCreated = 0;
      let totalFailed = 0;
      // `rowNumber` es único para toda la sesión (ver `nextRowNumber`), así que
      // sirve para reconciliar sin ambigüedad qué filas insertó cada request.
      const survivingRowNumbers = new Set<number>();
      // Motivo específico de cada fila que falló al confirmar (una fila puede
      // tener más de un error). Sin esto, el usuario solo veía un conteo
      // genérico en el toast ("2 fila(s) fallaron") sin ninguna pista de qué
      // corregir — quedaba adivinando.
      const failureReasons = new Map<number, { column: string; message: string }[]>();

      for (const entity of ['historicalSales', 'historicalPurchases'] as const) {
        const group = byEntity[entity];
        if (group.length === 0) continue;

        try {
          const response = await fetch('/api/import/commit-rows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entity, rows: group.map((r) => r.row) }),
          });
          const payload = await response.json();
          if (!payload.success) {
            toast.error(`${ENTITY_LABELS[entity]}: ${payload.error ?? 'No se pudo confirmar'}`);
            // La request completa falló (permiso, columna corrupta, etc): ninguna
            // fila de este grupo se tocó, así que todas quedan para reintentar.
            for (const r of group) survivingRowNumbers.add(r.row.rowNumber);
            continue;
          }
          const result = payload.data as ImportResult;
          totalCreated += result.created;
          totalFailed += result.failedRows?.length ?? 0;
          for (const failed of result.failedRows ?? []) {
            survivingRowNumbers.add(failed.rowNumber);
            const existing = failureReasons.get(failed.rowNumber) ?? [];
            existing.push({ column: failed.column, message: failed.message });
            failureReasons.set(failed.rowNumber, existing);
          }
        } catch {
          toast.error(`${ENTITY_LABELS[entity]}: no se pudo contactar al servidor`);
          for (const r of group) survivingRowNumbers.add(r.row.rowNumber);
        }
      }

      if (totalCreated > 0) toast.success(`${totalCreated} documento(s) importados`);
      if (totalFailed > 0) toast.error(`${totalFailed} fila(s) fallaron al confirmar. Revisa el detalle en la tabla`);

      // Se quitan del lote local solo las filas que sí se insertaron; las que
      // fallaron o cuya request no llegó a procesarse quedan para que el
      // usuario las corrija o reintente — con el motivo exacto ya cargado en
      // `row.errors` para que se vea en la columna "Estado", igual que un
      // error de validación normal.
      setRows((prev) =>
        prev
          .filter((r) => survivingRowNumbers.has(r.row.rowNumber))
          .map((r) => {
            const reasons = failureReasons.get(r.row.rowNumber);
            if (!reasons) return r;
            return { ...r, row: { ...r.row, errors: [...r.row.errors, ...reasons] } };
          })
      );
      if (totalCreated > 0) router.refresh();
    } finally {
      setCommitting(false);
    }
  }

  return {
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
  };
}
