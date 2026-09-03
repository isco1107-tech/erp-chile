'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MAX_AI_PROMPT_CHARS, type AiScanRow } from '@/modules/import/schema';
import { useAiRowsReview } from '@/hooks/use-ai-rows-review';
import AiRowsReviewTable from './AiRowsReviewTable';

const textareaClass =
  'block w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50';

/**
 * Describe en texto libre una o varias boletas/facturas/ventas y una IA las
 * interpreta (`/api/import/ai-prompt`) armando la misma tabla editable
 * (`AiRowsReviewTable`, vía `useAiRowsReview`) que usa el escaneo de fotos.
 * Nada se guarda hasta que el usuario revisa/corrige y confirma vía
 * `/api/import/commit-rows`.
 */
export default function AiPromptImporter() {
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);

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

  async function parse() {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error('Escribe una descripción del documento');
      return;
    }

    setParsing(true);
    try {
      const response = await fetch('/api/import/ai-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? 'No se pudo interpretar el texto');
        return;
      }
      const newRows = payload.data as AiScanRow[];
      addRows(newRows);
      setText('');
      toast.success(`${newRows.length} documento(s) interpretados`);
    } catch {
      toast.error('No se pudo contactar al servidor');
    } finally {
      setParsing(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <div>
        <h2 className="text-lg font-semibold">Importar ventas describiéndolas por texto</h2>
        <p className="text-sm text-muted-foreground">
          Escribe o pega la descripción de una o varias boletas/facturas: cliente, RUT, tipo de documento, folio,
          fecha, y el detalle de productos (nombre, cantidad, precio) — es obligatorio, el total se calcula desde
          ahí. Una IA arma las filas para que las revises y corrijas antes de guardar nada. El cliente debe existir
          en Clientes y Proveedores.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ai-prompt-text">Descripción</Label>
        <textarea
          id="ai-prompt-text"
          rows={4}
          maxLength={MAX_AI_PROMPT_CHARS}
          placeholder='Ej: "Boleta 1234 a Juan Pérez, RUT 12.345.678-9, el 3 de marzo: 2x Notebook Lenovo a $60.000, 1x Mouse inalámbrico a $10.000. Factura 5566 a Comercial ABC SPA, RUT 76.111.222-3, el 5 de marzo: 10x Resma de papel carta a $3.500 neto."'
          className={textareaClass}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{text.length}/{MAX_AI_PROMPT_CHARS} caracteres</p>
          <Button type="button" disabled={parsing || !text.trim()} onClick={parse}>
            <Sparkles className="mr-2 size-4" /> {parsing ? 'Interpretando...' : 'Interpretar con IA'}
          </Button>
        </div>
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
