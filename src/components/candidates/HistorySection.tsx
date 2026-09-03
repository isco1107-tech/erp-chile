import type { CandidateHistoryEntry } from '@/modules/candidates/services/candidates.service';

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Ficha creada',
  UPDATE: 'Ficha editada',
  DELETE: 'Ficha eliminada',
  DOWNLOAD: 'Archivo consultado/descargado',
  EXPORT: 'Incluida en una exportación',
};

/** Bitácora de auditoría de la postulación (Sección 6/7 del módulo), leída
 * desde el `AuditLog` genérico — ver nota de arquitectura en
 * `candidates.service.ts`. Solo visible con `candidates:sensitive`. */
export default function HistorySection({ history }: { history: CandidateHistoryEntry[] }) {
  return (
    <div className="rounded border border-border p-3">
      <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Historial de la postulación</p>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin eventos registrados todavía.</p>
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto text-xs">
          {history.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2 border-b border-border/60 pb-1.5 last:border-0">
              <span>
                {ACTION_LABELS[entry.action] ?? entry.action}
                {entry.entity === 'CandidateDocument' ? ' (documento)' : ''}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {entry.userEmail} — {new Date(entry.createdAt).toLocaleString('es-CL')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
