'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Laptop, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listMySessionsAction, revokeMySessionAction, revokeOtherSessionsAction } from '@/lib/actions/sessions';
import type { SessionWithUser } from '@/lib/services/sessions.service';
import { formatRelative } from '@/lib/format';

import { useConfirm } from '@/components/ui/confirm-provider';
/**
 * Lectura aproximada del user-agent para mostrar algo legible ("Chrome en
 * Windows") en vez del string crudo. No pretende ser exhaustiva — alcanza
 * para que la persona reconozca su propio dispositivo o note uno ajeno.
 */
function describeDevice(userAgent: string | null): { label: string; isMobile: boolean } {
  if (!userAgent) return { label: 'Dispositivo desconocido', isMobile: false };
  const ua = userAgent;
  const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);

  let browser = 'Navegador desconocido';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Chromium')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';

  let os = '';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return { label: os ? `${browser} en ${os}` : browser, isMobile };
}

export default function SessionsClient() {
  const confirm = useConfirm();
  const [sessions, setSessions] = useState<SessionWithUser[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [scope, setScope] = useState<'own' | 'company'>('own');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const result = await listMySessionsAction();
    if (result.success) {
      setSessions(result.data.sessions);
      setCurrentSessionId(result.data.currentSessionId);
      setViewerUserId(result.data.viewerUserId);
      setScope(result.data.scope);
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRevoke(sessionId: string) {
    const isCurrent = sessionId === currentSessionId;
    if (isCurrent && !await confirm('Esta es tu sesión actual: cerrarla te llevará al login. ¿Continuar?')) return;
    setBusyId(sessionId);
    try {
      const result = await revokeMySessionAction(sessionId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Sesión cerrada');
      if (isCurrent) {
        window.location.href = '/login';
        return;
      }
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevokeOthers() {
    if (!await confirm('¿Cerrar todas las demás sesiones? Esta pantalla seguirá abierta.')) return;
    const result = await revokeOtherSessionsAction();
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Listo');
    load();
  }

  const ownSessionsCount = sessions.filter((s) => s.userId === viewerUserId).length;

  return (
    <div className="space-y-4">
      {scope === 'company' && (
        <p className="text-xs text-muted-foreground">
          Ves las sesiones activas de toda la empresa. Solo puedes cerrar las tuyas.
        </p>
      )}

      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={handleRevokeOthers} disabled={loading || ownSessionsCount <= 1}>
          Cerrar las demás sesiones
        </Button>
      </div>

      <div className="space-y-2">
        {loading && <p className="p-4 text-center text-sm text-muted-foreground">Cargando...</p>}
        {!loading && sessions.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">Sin sesiones activas registradas.</p>
        )}
        {!loading && sessions.map((session) => {
          const device = describeDevice(session.userAgent);
          const isCurrent = session.id === currentSessionId;
          const isOwn = session.userId === viewerUserId;
          const Icon = device.isMobile ? Smartphone : Laptop;
          return (
            <div
              key={session.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${isCurrent ? 'border-primary/40 bg-primary/5' : 'border-border'}`}
            >
              <div className="flex items-center gap-3">
                <Icon className="size-5 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {scope === 'company' && !isOwn ? `${session.user.name} · ${device.label}` : device.label}
                    {isCurrent && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Este dispositivo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {session.ipAddress ?? 'IP desconocida'} · activo {formatRelative(new Date(session.lastSeenAt))} · inició{' '}
                    {new Date(session.createdAt).toLocaleString('es-CL')}
                  </p>
                </div>
              </div>
              {isOwn && (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busyId === session.id}
                  onClick={() => handleRevoke(session.id)}
                >
                  {busyId === session.id ? 'Cerrando...' : 'Cerrar sesión'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
