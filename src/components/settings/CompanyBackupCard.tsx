'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Database, Download, Loader2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';

/**
 * Descarga del respaldo completo de la empresa (Configuración → Empresa).
 *
 * El resumen se pide aparte y antes de la descarga a propósito: un tenant con
 * años de operación puede tardar bastante en generarse, y arrancar una descarga
 * sin saber su tamaño deja al usuario mirando una pestaña colgada sin saber si
 * el sistema está trabajando o se rompió.
 */

interface BackupSummary {
  models: number;
  rows: number;
  perModel: Record<string, number>;
}

const NUMBER_FORMAT = new Intl.NumberFormat('es-CL');

export default function CompanyBackupCard() {
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  async function loadSummary() {
    setLoadingSummary(true);
    try {
      const response = await fetch('/api/backup/company?resumen=1');
      const result: unknown = await response.json();
      if (
        typeof result === 'object' &&
        result !== null &&
        'success' in result &&
        result.success === true &&
        'data' in result
      ) {
        setSummary(result.data as BackupSummary);
      } else {
        const message =
          typeof result === 'object' && result !== null && 'error' in result
            ? String(result.error)
            : 'No se pudo calcular el contenido del respaldo';
        toast.error(message);
      }
    } catch {
      toast.error('No se pudo conectar para calcular el respaldo');
    } finally {
      setLoadingSummary(false);
    }
  }

  const topTables = summary
    ? Object.entries(summary.perModel)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
    : [];

  return (
    <div className="max-w-2xl space-y-4 rounded-xl border border-border p-4">
      <div>
        <h2 className="font-semibold">Respaldo y portabilidad de datos</h2>
        <p className="text-sm text-muted-foreground">
          Descarga un archivo JSON con todos los datos de tu empresa: clientes, productos, documentos de venta y compra, movimientos de
          inventario, tesorería, contabilidad y los módulos de producción que tengas activos. Sirve como respaldo propio y para llevarte tu
          información si dejas de usar el sistema. Por seguridad se excluyen contraseñas, códigos de 2FA y tokens de acceso.
        </p>
      </div>

      {!summary && (
        <Button type="button" variant="outline" onClick={loadSummary} disabled={loadingSummary}>
          {loadingSummary ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Database className="mr-2 size-4" />}
          Ver qué incluye el respaldo
        </Button>
      )}

      {summary && (
        <div className="space-y-3">
          <p className="text-sm">
            <strong>{NUMBER_FORMAT.format(summary.rows)}</strong> registros en{' '}
            <strong>{NUMBER_FORMAT.format(summary.models)}</strong> tablas.
          </p>

          {topTables.length > 0 && (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {topTables.map(([table, count]) => (
                <li key={table} className="flex justify-between gap-2">
                  <span className="truncate">{table}</span>
                  <span className="tabular-nums">{NUMBER_FORMAT.format(count)}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Un <a download> y no un router.push(): esto no es una navegación
              a una pantalla, es un archivo que el navegador debe escribir a
              disco mientras el servidor lo sigue emitiendo. Además deja
              disponible el "guardar enlace como" del menú contextual. */}
          <a href="/api/backup/company" download className={buttonVariants()}>
            <Download className="mr-2 size-4" />
            Descargar respaldo (.json)
          </a>

          <p className="text-xs text-muted-foreground">
            La descarga puede tardar varios minutos si tienes mucha información. Queda registrada en la bitácora de auditoría.
          </p>
        </div>
      )}
    </div>
  );
}
