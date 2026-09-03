'use client';

import { Fragment, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  ENTITY_LABELS,
  IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  type AiScanItemLine,
  type ImportEntity,
  type ImportPreview,
  type ImportResult,
  type ParsedRow,
} from '@/modules/import/schema';
import { ItemLinesEditor } from './AiRowsReviewTable';
import { useProductOptions } from '@/hooks/use-product-options';

const selectClass =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

interface Props {
  /** Entidades que el plan y el rol del usuario permiten importar. */
  availableEntities: ImportEntity[];
}

export default function ImportWizard({ availableEntities }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [entity, setEntity] = useState<ImportEntity>(availableEntities[0] ?? 'products');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const products = useProductOptions();

  const columns = IMPORT_COLUMNS[entity];

  // Solo `historicalSales`/`historicalPurchases` pueden traer la columna
  // opcional "Detalle de Productos" (`buildPreview` ya la interpretó con IA
  // y la dejó en `row.items`, vinculada — o no — contra el catálogo real).
  const hasItemDetail = preview?.rows.some((row) => (row.items?.length ?? 0) > 0) ?? false;

  // Derivados desde `preview.rows` en vez de `preview.validRows`/`invalidRows`
  // (fijos desde la última respuesta del servidor): agregar/vincular una
  // línea de detalle puede destrabar el error "ingrese neto o total" de una
  // fila sin volver a pedirle el archivo al servidor.
  const liveInvalidRows = preview?.rows.filter((row) => row.errors.length > 0).length ?? 0;
  const liveValidRows = preview ? preview.rows.length - liveInvalidRows : 0;

  function reset() {
    setPreview(null);
    setResult(null);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  /** Edita las filas de la vista previa ya devuelta por el servidor (no vuelve a subir el archivo). */
  function updatePreviewRows(updater: (rows: ParsedRow[]) => ParsedRow[]) {
    setPreview((prev) => (prev ? { ...prev, rows: updater(prev.rows) } : prev));
  }

  function updateItem(rowLocalId: string, itemLocalId: string, patch: Partial<AiScanItemLine>) {
    const rowNumber = Number(rowLocalId);
    updatePreviewRows((rows) =>
      rows.map((row) =>
        row.rowNumber !== rowNumber
          ? row
          : { ...row, items: (row.items ?? []).map((item) => (item.localId === itemLocalId ? { ...item, ...patch } : item)) }
      )
    );
  }

  function addItem(rowLocalId: string) {
    const rowNumber = Number(rowLocalId);
    updatePreviewRows((rows) =>
      rows.map((row) => {
        if (row.rowNumber !== rowNumber) return row;
        const newItem: AiScanItemLine = {
          localId: `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          description: '',
          quantity: 1,
          unitPrice: 0,
          productId: null,
          productLabel: null,
        };
        return {
          ...row,
          items: [...(row.items ?? []), newItem],
          // Con al menos una línea, el Neto/Total se calcula desde las
          // líneas al confirmar — el error "ingrese neto o total" que la
          // fila original haya traído ya no aplica.
          errors: row.errors.filter((e) => e.column !== 'Monto Neto'),
        };
      })
    );
  }

  function removeItem(rowLocalId: string, itemLocalId: string) {
    const rowNumber = Number(rowLocalId);
    updatePreviewRows((rows) =>
      rows.map((row) =>
        row.rowNumber !== rowNumber ? row : { ...row, items: (row.items ?? []).filter((item) => item.localId !== itemLocalId) }
      )
    );
  }

  async function send(mode: 'preview' | 'commit') {
    if (!file) {
      toast.error('Selecciona un archivo .xlsx o .csv');
      return;
    }

    const body = new FormData();
    body.append('mode', mode);
    body.append('entity', entity);
    body.append('file', file);

    setBusy(true);
    try {
      // El archivo va por multipart a un Route Handler: una Server Action está
      // limitada a 1 MB de cuerpo y una planilla mediana la supera.
      const response = await fetch('/api/import', { method: 'POST', body });
      const payload = await response.json();

      if (!payload.success) {
        toast.error(payload.error ?? 'No se pudo procesar el archivo');
        return;
      }

      if (mode === 'preview') {
        const data = payload.data as ImportPreview;
        setPreview(data);
        setResult(null);
        if (data.invalidRows > 0) toast.error(`${data.invalidRows} fila(s) con errores`);
        else if (data.totalRows > 0) toast.success(`${data.validRows} fila(s) listas para importar`);
      } else {
        const data = payload.data as ImportResult;
        setResult(data);
        setPreview(null);
        if (data.created > 0) toast.success(`${data.created} registro(s) importados`);
        if (data.failedRows && data.failedRows.length > 0) {
          toast.error(`${data.failedRows.length} fila(s) no se pudieron insertar. Revisa el detalle abajo`);
        }
        router.refresh();
      }
    } catch {
      toast.error('No se pudo contactar al servidor');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Confirma la importación. Cuando hay detalle de productos editable en
   * pantalla, NO se vuelve a subir el archivo (eso descartaría cualquier
   * corrección hecha en la tabla y dispararía una segunda interpretación por
   * IA de la misma columna) — se manda directo `/api/import/commit-rows` con
   * las filas tal como quedaron editadas, el mismo commit que ya usa el
   * escaneo de fotos/prompt.
   */
  async function commit() {
    if (!preview) return;
    if (!hasItemDetail) {
      send('commit');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/import/commit-rows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, rows: preview.rows }),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? 'No se pudo confirmar la importación');
        return;
      }
      const data = payload.data as ImportResult;
      setResult(data);
      setPreview(null);
      if (data.created > 0) toast.success(`${data.created} registro(s) importados`);
      if (data.failedRows && data.failedRows.length > 0) {
        toast.error(`${data.failedRows.length} fila(s) no se pudieron insertar. Revisa el detalle abajo`);
      }
      router.refresh();
    } catch {
      toast.error('No se pudo contactar al servidor');
    } finally {
      setBusy(false);
    }
  }

  const EXAMPLES: Record<ImportEntity, string[]> = {
    products: ['SKU-001;Producto de ejemplo;9990;UN;5;General;no;Descripción opcional'],
    contacts: [
      '76.543.210-3;Comercial Ejemplo SpA;Venta al por menor;contacto@ejemplo.cl;+56912345678;Av. Siempre Viva 742;Santiago;cliente',
    ],
    stock: ['SKU-001;PRINCIPAL;100;5000'],
    historicalSales: [
      '76.543.210-3;Comercial Ejemplo SpA;Factura;1001;2024-03-15;SKU-001;Notebook Lenovo ThinkPad;2;650000;1300000;1315000;249850;1564850;si',
      '76.543.210-3;Comercial Ejemplo SpA;Factura;1001;2024-03-15;SKU-002;Mouse Inalámbrico;1;15000;15000;1315000;249850;1564850;si',
    ],
    historicalPurchases: [
      '76.543.210-3;Mayorista Central SpA;Factura;F-556;2024-03-10;SKU-001;Notebook Lenovo ThinkPad;5;500000;2500000;2550000;484500;3034500;si',
      '76.543.210-3;Mayorista Central SpA;Factura;F-556;2024-03-10;SKU-002;Mouse Inalámbrico;5;10000;50000;2550000;484500;3034500;si',
    ],
  };

  /** Genera una plantilla CSV con los encabezados exactos que el importador espera. */
  function downloadTemplate() {
    const headers = columns.map((column) => column.label).join(';');
    const example = EXAMPLES[entity].join('\n');

    const blob = new Blob([`\uFEFF${headers}\n${example}\n`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `plantilla_${entity}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Misma plantilla que `downloadTemplate`, en .xlsx. `xlsx` (npm) está vetado
   * por CVEs sin parche (CLAUDE.md) — se usa `exceljs`, igual que el resto del
   * proyecto (`src/modules/reports/services/workbook.service.ts`). Import
   * dinámico: exceljs es pesado y esta plantilla es la única razón para
   * cargarlo en el bundle del cliente.
   */
  async function downloadExcelTemplate() {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Plantilla');

    sheet.addRow(columns.map((column) => column.label));
    for (const row of EXAMPLES[entity]) {
      sheet.addRow(row.split(';'));
    }
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((col) => {
      col.width = 22;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `plantilla_${entity}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (availableEntities.length === 0) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Tu plan o tu rol no permiten crear productos ni contactos, así que no hay nada que importar.
      </p>
    );
  }

  const isHistorical = entity === 'historicalSales' || entity === 'historicalPurchases';

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[240px_1fr]">
        <div>
          <Label htmlFor="entity">¿Qué vas a importar?</Label>
          <select
            id="entity"
            className={selectClass}
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value as ImportEntity);
              reset();
            }}
          >
            {availableEntities.map((option) => (
              <option key={option} value={option}>
                {ENTITY_LABELS[option]}
              </option>
            ))}
          </select>
          <div className="mt-2 flex flex-col gap-1.5 sm:flex-row">
            <Button type="button" size="xs" variant="default" onClick={downloadExcelTemplate} className="gap-1">
              <FileSpreadsheet className="size-3.5" /> Plantilla Excel (.xlsx)
            </Button>
            <Button type="button" size="xs" variant="outline" onClick={downloadTemplate} className="gap-1">
              CSV
            </Button>
          </div>
        </div>

        <div>
          <Label htmlFor="file">Archivo (.xlsx o .csv)</Label>
          <input
            id="file"
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="block w-full rounded-lg border border-input px-2.5 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setResult(null);
            }}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            La primera fila debe tener los encabezados. Máximo {MAX_IMPORT_ROWS.toLocaleString('es-CL')} filas y 5 MB por archivo.
          </p>
          <Button type="button" className="mt-2" disabled={busy || !file} onClick={() => send('preview')}>
            <Upload className="mr-2 size-4" /> {busy ? 'Analizando...' : 'Analizar archivo'}
          </Button>
        </div>
      </div>

      {isHistorical && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs space-y-1.5 text-muted-foreground">
          <p className="font-semibold text-foreground text-sm flex items-center gap-1.5">
            <CheckCircle2 className="size-4 text-primary" /> Reglas de Auto-Creación y Agrupación Inteligente
          </p>
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Auto-Creación de Contactos:</strong> Si el RUT no existe en tu empresa, se registrará automáticamente como cliente/proveedor.</li>
            <li><strong>Auto-Creación de Productos:</strong> Si el producto no existe en tu catálogo, se creará automáticamente con su SKU, nombre y precio neto.</li>
            <li><strong>Agrupación por Documento:</strong> Las filas que compartan el mismo RUT, Tipo de Documento y Folio se agruparán en un único documento con múltiples líneas de producto.</li>
            <li><strong>Cuadratura de Totales:</strong> El IVA (19%) y el Monto Total se calculan automáticamente si no se especifican.</li>
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-border p-4">
        <h2 className="mb-2 text-sm font-semibold">Columnas reconocidas para {ENTITY_LABELS[entity]}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="pb-1 font-medium">Columna</th>
                <th className="pb-1 font-medium">Obligatoria</th>
                <th className="pb-1 font-medium">También acepta</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((column) => (
                <tr key={column.key} className="border-t border-border">
                  <td className="py-1.5">
                    <span className="font-medium">{column.label}</span>
                    {column.hint && <span className="block text-xs text-muted-foreground">{column.hint}</span>}
                  </td>
                  <td className="py-1.5">
                    {column.required ? (
                      <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">Obligatoria</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Opcional</span>
                    )}
                  </td>
                  <td className="py-1.5 text-xs text-muted-foreground">{column.aliases.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-xl border border-green-600/30 bg-green-600/10 p-4">
            <CheckCircle2 className="size-5 text-green-600" />
            <p className="text-sm">
              <span className="font-semibold">{result.created} registro(s) importados</span> en {ENTITY_LABELS[result.entity]}.
            </p>
            <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={reset}>
              Importar otro archivo
            </Button>
          </div>

          {result.failedRows && result.failedRows.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="size-4" /> {result.failedRows.length} fila(s) no se pudieron insertar
              </p>
              <ul className="space-y-1 text-xs text-destructive">
                {result.failedRows.map((row, i) => (
                  <li key={i}>
                    Fila {row.rowNumber} — {row.column}: {row.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {preview && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">Filas leídas</p>
              <p className="text-2xl font-bold">{preview.totalRows}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">Válidas</p>
              <p className="text-2xl font-bold text-green-600">{liveValidRows}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">Con errores</p>
              <p className={`text-2xl font-bold ${liveInvalidRows > 0 ? 'text-destructive' : ''}`}>
                {liveInvalidRows}
              </p>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                className="w-full"
                // `stock`/`historicalSales`/`historicalPurchases` toleran filas con
                // error: el servidor las salta y reporta en `failedRows` en vez de
                // rechazar todo el archivo. `products`/`contacts` siguen exigiendo
                // cero errores porque insertan todo en una única transacción.
                disabled={
                  busy ||
                  liveValidRows === 0 ||
                  ((entity === 'products' || entity === 'contacts') && liveInvalidRows > 0)
                }
                onClick={() => {
                  const message =
                    liveInvalidRows > 0
                      ? `Se importarán ${liveValidRows} fila(s) válidas; las ${liveInvalidRows} con error quedarán fuera. ¿Confirmar?`
                      : `Se crearán ${liveValidRows} registro(s). ¿Confirmar la importación?`;
                  if (confirm(message)) {
                    commit();
                  }
                }}
              >
                {busy ? 'Importando...' : `Importar ${liveValidRows}`}
              </Button>
            </div>
          </div>

          {preview.missingRequiredColumns.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                Faltan columnas obligatorias: <strong>{preview.missingRequiredColumns.join(', ')}</strong>. Revisa la
                primera fila del archivo o descarga la plantilla.
              </p>
            </div>
          )}

          {preview.truncated && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
              El archivo supera las {MAX_IMPORT_ROWS.toLocaleString('es-CL')} filas. Solo se analizaron las primeras;
              divide el archivo para importar el resto.
            </p>
          )}

          {preview.unknownHeaders.length > 0 && (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              Columnas ignoradas por no corresponder a ningún campo: {preview.unknownHeaders.join(', ')}
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] table-auto text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2 font-medium">Fila</th>
                  {columns.map((column) => (
                    <th key={column.key} className="p-2 font-medium">
                      {column.label}
                    </th>
                  ))}
                  <th className="p-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {[...preview.rows]
                  // Documentos históricos: se muestran en orden cronológico para
                  // revisarlos como corresponde antes de confirmar, en vez del
                  // orden en que quedaron en la planilla.
                  .sort((a, b) =>
                    entity === 'historicalSales' || entity === 'historicalPurchases'
                      ? (a.values.issueDate || '9999-12-31').localeCompare(b.values.issueDate || '9999-12-31')
                      : 0
                  )
                  .slice(0, 200)
                  .map((row) => {
                  const failedColumns = new Set(row.errors.map((error) => error.column));
                  return (
                    <Fragment key={row.rowNumber}>
                    <tr
                      className={`border-t border-border align-top ${row.errors.length > 0 ? 'bg-destructive/5' : ''}`}
                    >
                      <td className="p-2 text-muted-foreground">{row.rowNumber}</td>
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={`p-2 ${failedColumns.has(column.label) ? 'font-medium text-destructive' : ''}`}
                        >
                          {row.values[column.key] || <span className="text-muted-foreground">—</span>}
                        </td>
                      ))}
                      <td className="p-2">
                        {row.errors.length === 0 ? (
                          <span className="text-xs text-green-600">OK</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {row.errors.map((error, i) => (
                              <li key={i} className="text-xs text-destructive">
                                {error.column}: {error.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                    {hasItemDetail && (
                      <tr className="border-t border-border/50 bg-muted/10">
                        <td colSpan={columns.length + 2} className="p-2">
                          <ItemLinesEditor
                            rowLocalId={String(row.rowNumber)}
                            items={row.items ?? []}
                            products={products}
                            updateItem={updateItem}
                            addItem={addItem}
                            removeItem={removeItem}
                          />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 200 && (
            <p className="text-xs text-muted-foreground">
              Se muestran las primeras 200 filas de {preview.rows.length}. La validación cubre el archivo completo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
