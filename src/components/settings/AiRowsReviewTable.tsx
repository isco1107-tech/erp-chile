'use client';

import { Fragment } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AiScanItemLine, AiScanRow } from '@/modules/import/schema';
import type { ProductOption, WorkingAiScanRow } from '@/hooks/use-ai-rows-review';

const inputClass =
  'h-8 w-full min-w-[140px] rounded-md border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50';

const itemInputClass =
  'h-7 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50';

const CONFIDENCE_LABEL: Record<AiScanRow['confidence'], string> = { high: 'Alta', medium: 'Media', low: 'Baja' };
const CONFIDENCE_CLASS: Record<AiScanRow['confidence'], string> = {
  high: 'text-green-600',
  medium: 'text-amber-600',
  low: 'text-destructive',
};

interface AiRowsReviewTableProps {
  rows: WorkingAiScanRow[];
  sortedRows: WorkingAiScanRow[];
  blockingCount: number;
  committing: boolean;
  products: ProductOption[];
  updateCell: (localId: string, key: string, value: string) => void;
  removeRow: (localId: string) => void;
  updateItem: (rowLocalId: string, itemLocalId: string, patch: Partial<AiScanItemLine>) => void;
  addItem: (rowLocalId: string) => void;
  removeItem: (rowLocalId: string, itemLocalId: string) => void;
  confirmImport: () => void | Promise<void>;
}

/**
 * Detalle de productos de una fila: cada línea se vincula (o no) a un
 * producto real del catálogo. Exportado (no solo usado por `AiRowsReviewTable`
 * internamente) porque `ImportWizard` lo reutiliza para el detalle que trae
 * la columna "Detalle de Productos" del Excel/CSV — no depende del shape
 * completo `WorkingAiScanRow`, solo de un `rowLocalId` (para identificar a
 * quién pertenecen las líneas en los handlers) y las `items` en sí.
 */
export function ItemLinesEditor({
  rowLocalId,
  items,
  products,
  updateItem,
  addItem,
  removeItem,
}: {
  rowLocalId: string;
  items: AiScanItemLine[];
  products: ProductOption[];
  updateItem: AiRowsReviewTableProps['updateItem'];
  addItem: AiRowsReviewTableProps['addItem'];
  removeItem: AiRowsReviewTableProps['removeItem'];
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-muted-foreground">
          Detalle de productos — las líneas vinculadas a un producto real descuentan inventario al confirmar
        </p>
        <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px]" onClick={() => addItem(rowLocalId)}>
          <Plus className="size-3" /> Línea
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Sin detalle de productos.</p>
      ) : (
        <table className="w-full min-w-[640px] table-auto text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="p-1 font-medium">Descripción</th>
              <th className="p-1 font-medium">Cant.</th>
              <th className="p-1 font-medium">Precio Unit. (Neto)</th>
              <th className="p-1 font-medium">Producto vinculado</th>
              <th className="p-1"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.localId} className="border-t border-border/50">
                <td className="p-1">
                  <input
                    className={itemInputClass}
                    value={item.description}
                    onChange={(e) => updateItem(rowLocalId, item.localId, { description: e.target.value })}
                  />
                </td>
                <td className="p-1">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className={`${itemInputClass} w-20`}
                    value={item.quantity}
                    onChange={(e) => updateItem(rowLocalId, item.localId, { quantity: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="p-1">
                  <input
                    type="number"
                    min={0}
                    className={`${itemInputClass} w-28`}
                    value={item.unitPrice}
                    onChange={(e) => updateItem(rowLocalId, item.localId, { unitPrice: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="p-1">
                  <select
                    className={itemInputClass}
                    value={item.productId ?? ''}
                    onChange={(e) => {
                      const selected = products.find((p) => p.id === e.target.value);
                      updateItem(rowLocalId, item.localId, {
                        productId: selected?.id ?? null,
                        productLabel: selected?.name ?? null,
                      });
                    }}
                  >
                    <option value="">— Sin vincular (solo informativo) —</option>
                    {item.productId && !products.some((p) => p.id === item.productId) && (
                      <option value={item.productId}>{item.productLabel ?? 'Producto sugerido'}</option>
                    )}
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-1">
                  <Button type="button" size="icon-sm" variant="ghost" onClick={() => removeItem(rowLocalId, item.localId)}>
                    <Trash2 className="size-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Tabla editable + barra de confirmación compartida por cualquier flujo que
 * arme filas candidatas vía IA (fotos, prompt de texto). Todo el estado y las
 * acciones vienen de `useAiRowsReview`; este componente solo renderiza.
 */
export default function AiRowsReviewTable({
  rows,
  sortedRows,
  blockingCount,
  committing,
  products,
  updateCell,
  removeRow,
  updateItem,
  addItem,
  removeItem,
  confirmImport,
}: AiRowsReviewTableProps) {
  if (rows.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">
          <span className="font-semibold">{rows.length}</span> fila(s) extraídas,{' '}
          <span className={blockingCount > 0 ? 'font-semibold text-destructive' : 'font-semibold text-green-600'}>
            {blockingCount}
          </span>{' '}
          con errores pendientes.
        </p>
        <Button type="button" disabled={committing || blockingCount > 0} onClick={confirmImport} className="ml-auto">
          {committing ? 'Importando...' : `Confirmar e importar ${rows.length - blockingCount}`}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[960px] table-auto text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Tipo</th>
              <th className="p-2 font-medium">Origen</th>
              <th className="p-2 font-medium">RUT Contraparte</th>
              <th className="p-2 font-medium">Documento</th>
              <th className="p-2 font-medium">Folio</th>
              <th className="p-2 font-medium">Fecha</th>
              <th className="p-2 font-medium">Neto</th>
              <th className="p-2 font-medium">Total</th>
              <th className="p-2 font-medium">Confianza IA</th>
              <th className="p-2 font-medium">Estado</th>
              <th className="p-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => {
              const docTypeKey = r.entity === 'historicalSales' ? 'dteType' : 'documentType';
              return (
                <Fragment key={r.localId}>
                <tr className={`border-t border-border align-top ${r.row.errors.length > 0 ? 'bg-destructive/5' : ''}`}>
                  <td className="p-2 text-xs font-medium">{r.entity === 'historicalSales' ? 'Venta' : 'Compra'}</td>
                  <td className="p-2 text-xs text-muted-foreground">{r.sourceFileName}</td>
                  <td className="p-2">
                    <input
                      className={inputClass}
                      value={r.row.values.contactRut ?? ''}
                      onChange={(e) => updateCell(r.localId, 'contactRut', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className={inputClass}
                      value={r.row.values[docTypeKey] ?? ''}
                      onChange={(e) => updateCell(r.localId, docTypeKey, e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className={inputClass}
                      value={r.row.values.folio ?? ''}
                      onChange={(e) => updateCell(r.localId, 'folio', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className={inputClass}
                      placeholder="AAAA-MM-DD"
                      value={r.row.values.issueDate ?? ''}
                      onChange={(e) => updateCell(r.localId, 'issueDate', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className={inputClass}
                      value={r.row.values.netAmount ?? ''}
                      disabled={(r.row.items?.length ?? 0) > 0}
                      title={(r.row.items?.length ?? 0) > 0 ? 'Se calcula desde el detalle de productos' : undefined}
                      onChange={(e) => updateCell(r.localId, 'netAmount', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className={inputClass}
                      value={r.row.values.totalAmount ?? ''}
                      disabled={(r.row.items?.length ?? 0) > 0}
                      title={(r.row.items?.length ?? 0) > 0 ? 'Se calcula desde el detalle de productos' : undefined}
                      onChange={(e) => updateCell(r.localId, 'totalAmount', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <span className={`text-xs font-medium ${CONFIDENCE_CLASS[r.confidence]}`}>
                      {CONFIDENCE_LABEL[r.confidence]}
                    </span>
                    {r.warnings.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {r.warnings.map((w, i) => (
                          <li key={i} className="text-[11px] text-muted-foreground">
                            {w}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="p-2">
                    {r.row.errors.length === 0 ? (
                      <span className="text-xs text-green-600">OK</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {r.row.errors.map((e, i) => (
                          <li key={i} className="flex items-start gap-1 text-xs text-destructive">
                            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                            {e.column}: {e.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="p-2">
                    <Button type="button" size="icon-sm" variant="ghost" onClick={() => removeRow(r.localId)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
                <tr className="border-t border-border/50 bg-muted/10">
                  <td colSpan={11} className="p-2">
                    <ItemLinesEditor
                      rowLocalId={r.localId}
                      items={r.row.items ?? []}
                      products={products}
                      updateItem={updateItem}
                      addItem={addItem}
                      removeItem={removeItem}
                    />
                  </td>
                </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
