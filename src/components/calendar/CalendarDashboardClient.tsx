'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Bell,
  Calendar as CalendarIcon,
  Cake,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Mail,
  RefreshCw,
  Sparkles,
  Trophy,
} from 'lucide-react';
import {
  getCalendarDataAction,
  regenerateCalendarSyncTokenAction,
  sendRemindersNowAction,
} from '@/modules/calendar/actions/calendar.actions';
import type { CalendarFeedData } from '@/modules/calendar/schema';

export default function CalendarDashboardClient({
  userEmail,
  canWrite,
}: {
  userEmail: string;
  canWrite: boolean;
}) {
  const [data, setData] = useState<CalendarFeedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  async function loadData() {
    setLoading(true);
    try {
      const result = await getCalendarDataAction();
      if (result.success) {
        setData(result.data);
      } else {
        toast.error(result.error);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado al portapapeles`);
  }

  async function handleRegenerateToken() {
    if (!confirm('¿Regenerar el enlace de Google Calendar? La URL anterior dejará de funcionar y deberás volver a suscribirte en Google Calendar.')) {
      return;
    }
    setRegenerating(true);
    try {
      const result = await regenerateCalendarSyncTokenAction();
      if (result.success) {
        toast.success(result.message);
        await loadData();
      } else {
        toast.error(result.error);
      }
    } finally {
      setRegenerating(false);
    }
  }

  async function handleSendReminderNow() {
    setSendingReminder(true);
    try {
      const result = await sendRemindersNowAction();
      if (result.success) {
        toast.success(`Recordatorio enviado con éxito al correo ${result.data.recipient}`);
      } else {
        toast.error(result.error);
      }
    } finally {
      setSendingReminder(false);
    }
  }

  function handleDownloadIcs() {
    if (!data) return;
    const url = `/api/calendar/feed/${data.syncToken}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `certamenes_${data.companyName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.ics`;
    a.click();
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-border bg-card">
        <p className="text-sm text-muted-foreground animate-pulse">Cargando calendario y sincronización...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm font-semibold text-destructive">No se pudo cargar la información del calendario.</p>
        <Button size="sm" variant="outline" onClick={loadData} className="mt-3">
          Reintentar
        </Button>
      </div>
    );
  }

  const filteredBirthdays = data.upcomingBirthdays.filter((b) =>
    b.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.stageName && b.stageName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* TARJETA 1: Sincronización Directa con Google Calendar */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <CalendarIcon className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">Sincronización con Google Calendar</h2>
                <p className="text-xs text-muted-foreground">
                  Vinculado al correo del administrador: <strong className="text-foreground">{data.adminEmail || userEmail}</strong>
                </p>
              </div>
            </div>
            <p className="max-w-2xl text-xs text-muted-foreground leading-relaxed">
              Todos los certámenes, hitos de escenario y <strong>cumpleaños de las candidatas (misses)</strong> se sincronizan automáticamente en tu teléfono y computador.
              Cuando agregues o modifiques un certamen o una miss en el ERP, se actualizará en tu Google Calendar sin configuraciones manuales.
            </p>
          </div>

          {/* Acciones principales de sincronización */}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={data.googleCalendarSubscribeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-blue-700 transition-colors"
            >
              <ExternalLink className="size-4" />
              Suscribir a Google Calendar (1 Clic)
            </a>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(data.httpsUrl || data.webcalUrl, 'Enlace de suscripción')}
              className="text-xs"
            >
              <Copy className="mr-1.5 size-3.5" />
              Copiar Enlace Feed
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadIcs}
              className="text-xs"
            >
              <Download className="mr-1.5 size-3.5" />
              Descargar .ics
            </Button>

            {canWrite && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                title="Regenerar enlace de suscripción"
                onClick={handleRegenerateToken}
                disabled={regenerating}
                className="text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={`size-3.5 ${regenerating ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>

        {/* Guía rápida de Google Calendar */}
        <div className="mt-5 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-300">
            <Sparkles className="size-4 text-blue-500" />
            ¿Cómo funciona la sincronización automática?
          </div>
          <p className="mt-1">
            Al pulsar <strong>"Suscribir a Google Calendar"</strong>, Google Calendar añadirá el calendario oficial de <em>{data.companyName}</em> a tu cuenta. Los eventos y cumpleaños se sincronizarán en segundo plano en todos tus dispositivos (Android, iPhone, Mac, Windows).
          </p>
        </div>
      </div>

      {/* TARJETA 2: Recordatorios Periódicos Automáticos */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Bell className="size-4" />
              </span>
              <h3 className="text-base font-bold text-foreground">Recordatorios Periódicos de Actividades</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              El sistema envía alertas por correo electrónico ({data.adminEmail || userEmail}) sobre eventos y cumpleaños en los horizontes de <strong>7 días, 48 horas y el mismo día</strong>.
            </p>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={handleSendReminderNow}
            disabled={sendingReminder}
            className="bg-amber-600 text-white hover:bg-amber-700 shadow-sm font-semibold shrink-0"
          >
            <Mail className="mr-1.5 size-4" />
            {sendingReminder ? 'Enviando...' : 'Enviar Recordatorio a mi Correo Ahora'}
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="font-semibold text-foreground">1. Alertas 7 Días Antes</p>
            <p className="text-muted-foreground mt-0.5">Resumen semanal de certámenes y cumpleaños para planificación y agenda.</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="font-semibold text-foreground">2. Alertas 48 Horas Antes</p>
            <p className="text-muted-foreground mt-0.5">Aviso urgente para preparación de pauta, producción y felicitaciones.</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="font-semibold text-foreground">3. El Día del Evento (8:00 AM)</p>
            <p className="text-muted-foreground mt-0.5">Notificación matutina con el cumpleaños del día o hito a realizarse.</p>
          </div>
        </div>
      </div>

      {/* SECCIÓN 3: Cumpleaños de las Misses / Candidatas */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Cake className="size-5 text-pink-500" />
              <h3 className="text-base font-bold text-foreground">
                Cumpleaños de Candidatas (Misses) ({data.upcomingBirthdays.length})
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Extraídos de la ficha oficial de cada candidata para subirse automáticamente al Google Calendar.
            </p>
          </div>

          <div className="w-full sm:w-64">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar candidata..."
              className="h-9 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredBirthdays.map((b) => {
            const isToday = b.daysUntil === 0;
            const isTomorrow = b.daysUntil === 1;
            const isSoon = b.daysUntil <= 7;
            const bdayDate = new Date(b.birthDate);
            const formattedDate = `${bdayDate.getUTCDate()} de ${bdayDate.toLocaleDateString('es-CL', { month: 'long' })}`;

            return (
              <div
                key={b.id}
                className={`flex items-center justify-between rounded-xl border p-3.5 text-sm transition-shadow shadow-xs ${
                  isToday
                    ? 'border-pink-500/50 bg-pink-500/10 shadow-sm'
                    : isSoon
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-border bg-background'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className="size-11 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
                    {b.photoUrl ? (
                      <img src={b.photoUrl} alt={b.fullName} className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center font-bold text-xs text-muted-foreground">
                        {b.fullName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-foreground truncate">
                      {b.stageName || b.fullName}
                    </p>
                    {b.stageName && (
                      <p className="text-xs text-muted-foreground truncate">{b.fullName}</p>
                    )}
                    <p className="text-xs text-pink-600 dark:text-pink-400 font-medium mt-0.5">
                      🎂 {formattedDate} · Cumple {b.turningAge} años
                    </p>
                    <div className="mt-1">
                      {isToday ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-pink-500 px-2 py-0.5 text-[10px] font-extrabold uppercase text-white animate-pulse">
                          🎉 ¡Cumpleaños Hoy!
                        </span>
                      ) : isTomorrow ? (
                        <span className="inline-flex rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                          Mañana
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          En {b.daysUntil} días
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Botón para añadir este cumpleaños directo a Google Calendar */}
                <div className="shrink-0">
                  <a
                    href={data.items.find((it) => it.id === `bday-${b.id}`)?.googleCalendarUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted shadow-2xs"
                    title="Añadir a Google Calendar"
                  >
                    <CalendarIcon className="size-3 text-blue-500" />
                    + Cal
                  </a>
                </div>
              </div>
            );
          })}

          {filteredBirthdays.length === 0 && (
            <p className="col-span-3 p-6 text-center text-sm text-muted-foreground">
              No se encontraron candidatas con fecha de nacimiento registrada.
            </p>
          )}
        </div>
      </div>

      {/* SECCIÓN 4: Próximos Certámenes & Eventos */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="size-5 text-amber-500" />
              <h3 className="text-base font-bold text-foreground">
                Certámenes & Eventos Programados ({data.upcomingEvents.length})
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Eventos oficiales y pautas con fecha de inicio registrada.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Tipo / Nombre</th>
                <th className="px-4 py-3">Fecha Inicio</th>
                <th className="px-4 py-3">Certamen</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.upcomingEvents.map((ev) => (
                <tr key={ev.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-foreground">
                    {ev.title}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(ev.startDate).toLocaleDateString('es-CL', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {ev.project?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={ev.googleCalendarUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                    >
                      <CalendarIcon className="size-3" /> + Google Cal
                    </a>
                  </td>
                </tr>
              ))}

              {data.upcomingEvents.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">
                    No hay certámenes u obras programadas próximas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
