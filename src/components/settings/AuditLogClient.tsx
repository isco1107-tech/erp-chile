'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { AuditAction, AuditLog } from '@prisma/client';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { listAuditLogsAction } from '@/lib/actions/audit';
import { ACTION_LABELS, ACTION_BADGE_CLASS } from '@/lib/auth/audit-labels';

const ACTIONS: AuditAction[] = ['CREATE', 'UPDATE', 'DELETE', 'ISSUE_DTE', 'CANCEL_DTE', 'STOCK_ADJUSTMENT', 'EXPORT'];

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

export default function AuditLogClient() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<AuditAction | ''>('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (action) params.set('action', action);
      if (query.trim()) params.set('query', query.trim());
      // Sin from/to el endpoint exporta el mes en curso por defecto — acá se
      // fuerza a "desde siempre" hasta hoy, porque una bitácora de
      // cumplimiento normalmente se revisa por rangos largos, no solo el mes.
      params.set('from', '2000-01-01');
      params.set('to', new Date().toISOString().slice(0, 10));

      const res = await fetch(`/api/audit/excel?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'No se pudo generar la bitácora');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="(.+)"/);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = match?.[1] ?? 'auditoria.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Bitácora exportada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error inesperado');
    } finally {
      setExporting(false);
    }
  }

  async function load() {
    setLoading(true);
    const result = await listAuditLogsAction({ query: query || undefined, action: action || undefined });
    if (result.success) setLogs(result.data);
    else toast.error(result.error);
    setLoading(false);
  }

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, action]);

  const metadataPreview = useMemo(() => {
    if (!selectedLog) return '';
    return JSON.stringify(selectedLog.metadata ?? {}, null, 2);
  }, [selectedLog]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar por usuario o entidad" value={query} onChange={(e) => setQuery(e.target.value)} className="w-64" />
        <select className={`${selectClass} w-56`} value={action} onChange={(e) => setAction(e.target.value as AuditAction | '')}>
          <option value="">Todas las acciones</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a]}</option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" className="gap-2" disabled={exporting} onClick={handleExport}>
          {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {exporting ? 'Generando...' : 'Exportar a Excel'}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[860px] table-auto text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Fecha / Hora</th>
              <th className="p-2 font-medium">Usuario</th>
              <th className="p-2 font-medium">Acción</th>
              <th className="p-2 font-medium">Módulo / Entidad</th>
              <th className="p-2 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={5}>Cargando...</td></tr>
            )}
            {!loading && logs.length === 0 && (
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={5}>Sin eventos registrados</td></tr>
            )}
            {!loading && logs.map((log) => (
              <tr key={log.id} className="border-t border-border">
                <td className="p-2">{new Date(log.createdAt).toLocaleString('es-CL')}</td>
                <td className="p-2">{log.userEmail}</td>
                <td className="p-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_BADGE_CLASS[log.action]}`}>
                    {ACTION_LABELS[log.action]}
                  </span>
                </td>
                <td className="p-2">
                  {log.entity} <span className="font-mono text-xs text-muted-foreground">#{log.entityId.slice(0, 8)}</span>
                </td>
                <td className="p-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setSelectedLog(log)}>Ver JSON</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle del evento</DialogTitle>
            <DialogDescription>
              {selectedLog && `${selectedLog.entity} #${selectedLog.entityId} — ${new Date(selectedLog.createdAt).toLocaleString('es-CL')}`}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs">{metadataPreview}</pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
