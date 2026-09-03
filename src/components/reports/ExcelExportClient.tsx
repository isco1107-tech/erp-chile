'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const PRESETS = [
  {
    id: 'month',
    label: 'Mes en curso',
    build: () => {
      const now = new Date();
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    },
  },
  {
    id: 'prev-month',
    label: 'Mes anterior',
    build: () => {
      const now = new Date();
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0),
      };
    },
  },
  {
    id: 'quarter',
    label: 'Últimos 3 meses',
    build: () => {
      const now = new Date();
      return { from: new Date(now.getFullYear(), now.getMonth() - 2, 1), to: now };
    },
  },
  {
    id: 'year',
    label: 'Año en curso',
    build: () => {
      const now = new Date();
      return { from: new Date(now.getFullYear(), 0, 1), to: now };
    },
  },
] as const;

const SHEETS = [
  { name: 'Panel', desc: 'Indicadores con fórmulas vivas: margen, IVA F29, inventario, flujo' },
  { name: 'Productos', desc: 'Catálogo con PMP, precios, margen unitario y valorización' },
  { name: 'Inventario', desc: 'Stock por bodega, valorizado, con alerta de quiebre' },
  { name: 'Kardex', desc: 'Trazabilidad de cada movimiento con PMP antes y después' },
  { name: 'Ventas', desc: 'Documentos emitidos con costo de venta y margen' },
  { name: 'Ventas detalle', desc: 'Línea a línea, con margen por línea' },
  { name: 'Compras', desc: 'Facturas de proveedor con saldo pendiente' },
  { name: 'Compras detalle', desc: 'Línea a línea, con enlace a producto' },
  { name: 'Pagos', desc: 'Cobros y pagos del período' },
];

export default function ExcelExportClient() {
  const initial = useMemo(() => PRESETS[0].build(), []);
  const [from, setFrom] = useState(isoDate(initial.from));
  const [to, setTo] = useState(isoDate(initial.to));
  const [loading, setLoading] = useState(false);

  function applyPreset(preset: (typeof PRESETS)[number]) {
    const range = preset.build();
    setFrom(isoDate(range.from));
    setTo(isoDate(range.to));
  }

  async function handleDownload() {
    if (new Date(from) > new Date(to)) {
      toast.error('La fecha inicial es posterior a la final');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/excel?from=${from}&to=${to}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'No se pudo generar el reporte');
      }

      // Descarga vía blob: el endpoint responde con Content-Disposition, pero
      // fetch no dispara la descarga por sí solo.
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="(.+)"/);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = match?.[1] ?? 'reporte.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success('Reporte generado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5" /> Exportar a Excel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button key={preset.id} type="button" variant="outline" size="sm" onClick={() => applyPreset(preset)}>
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="from">Desde</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">Hasta</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button onClick={handleDownload} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {loading ? 'Generando…' : 'Descargar .xlsx'}
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            El período filtra ventas, compras, pagos y movimientos de inventario. El catálogo de productos y el stock
            actual se exportan completos, porque reflejan la situación al día de hoy.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qué incluye el archivo</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {SHEETS.map((sheet) => (
              <li key={sheet.name} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
                <span className="min-w-40 text-sm font-medium">{sheet.name}</span>
                <span className="text-sm text-muted-foreground">{sheet.desc}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
