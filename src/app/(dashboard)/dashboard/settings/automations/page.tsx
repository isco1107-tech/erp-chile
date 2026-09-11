import Link from 'next/link';
import { CheckCircle2, Circle, Mail, ShieldAlert, Sparkles, Webhook, AlertTriangle } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getScheduledAutomationsHealthAction } from '@/modules/automation/actions/automation.actions';
import type { AutomationRunStatus } from '@/modules/automation/services/automation-health.service';
import WorkflowRulesClient from '@/components/automation/WorkflowRulesClient';

export const metadata = { title: 'Automatizaciones' };

const STATUS_META: Record<AutomationRunStatus, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  ok: { label: 'Al día', tone: 'success' },
  stale: { label: 'Atrasada', tone: 'warning' },
  never: { label: 'Nunca ejecutada', tone: 'neutral' },
};

/**
 * Notificaciones disparadas por un evento (no por cron), sin concepto de
 * "última ejecución" — que nunca se hayan disparado es normal (nadie se
 * bloqueó, nadie compró un voto todavía), no una falla. Por eso van en una
 * lista simple aparte, no en la tabla con estado de salud.
 */
const EVENT_NOTIFICATIONS = [
  { icon: Webhook, title: 'Conciliación de pagos (n8n)', description: 'Marca ventas o compras como pagadas cuando llega el evento "payment.confirmed" al webhook — ver más abajo en Empresa.' },
  { icon: ShieldAlert, title: 'Cuenta bloqueada', description: 'Avisa a Dueño/Administrador cuando una cuenta se bloquea por 5 intentos de contraseña seguidos.' },
  { icon: ShieldAlert, title: 'Inicio de sesión desde IP nueva', description: 'Avisa al usuario cuando su cuenta inicia sesión desde una dirección IP que nunca había usado.' },
  { icon: Mail, title: 'Firma electrónica completada', description: 'Avisa al equipo cuando ZapSign confirma la firma de un contrato de imagen.' },
  { icon: Mail, title: 'Pago de auspicio confirmado', description: 'Confirma por correo a la marca auspiciadora cuando se registra su pago.' },
  { icon: Mail, title: 'Voto pagado confirmado', description: 'Confirma por correo a quien compró votos cuando se registra el pago.' },
  { icon: Sparkles, title: 'Resumen del agente CEO', description: 'Manda las 2-3 prioridades del día que el agente CEO condensó del trabajo de CFO/COO/Ventas (módulo Inteligencia de Negocio).' },
];

export default async function AutomationsSettingsPage() {
  const context = await getAuthContext();
  const allowed = can(context, 'automation:manage');
  const result = allowed ? await getScheduledAutomationsHealthAction() : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Automatizaciones</h1>
        <Link href="/dashboard/settings" className={buttonVariants({ variant: 'outline' })}>← Volver</Link>
      </div>

      {!allowed && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          No tienes permisos para ver esta sección. Está reservada para Dueños y Administradores.
        </p>
      )}

      {allowed && result && !result.success && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{result.error}</p>
      )}

      {allowed && result?.success && (
        <>
          <WorkflowRulesClient />

          <div className="rounded-xl border border-border">
            <div className="border-b border-border p-4">
              <h2 className="font-semibold">Tareas programadas</h2>
              <p className="text-sm text-muted-foreground">Corren solas en el horario indicado, sin que nadie tenga que entrar a generarlas.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-4 py-2 font-medium">Automatización</th>
                    <th scope="col" className="px-4 py-2 font-medium">Frecuencia</th>
                    <th scope="col" className="px-4 py-2 font-medium">Última corrida</th>
                    <th scope="col" className="px-4 py-2 font-medium">Resultado</th>
                    <th scope="col" className="px-4 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                        No hay tareas programadas configuradas para esta empresa.
                      </td>
                    </tr>
                  )}
                  {result.data.map((row) => {
                    const meta = STATUS_META[row.status];
                    return (
                      <tr key={row.key} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-medium">{row.label}</p>
                          <p className="text-xs text-muted-foreground">{row.description}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{row.frequencyLabel}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {row.lastRunAt ? row.lastRunAt.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{row.lastRunSummary ?? '—'}</td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={meta.tone}>
                            {row.status === 'ok' ? <CheckCircle2 className="mr-1 inline size-3" /> : row.status === 'stale' ? <AlertTriangle className="mr-1 inline size-3" /> : <Circle className="mr-1 inline size-3" />}
                            {meta.label}
                          </StatusBadge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-border">
            <div className="border-b border-border p-4">
              <h2 className="font-semibold">Notificaciones automáticas activas</h2>
              <p className="text-sm text-muted-foreground">Se disparan solas cuando ocurre el evento correspondiente — no tienen horario fijo.</p>
            </div>
            <ul className="divide-y divide-border">
              {EVENT_NOTIFICATIONS.map((item) => (
                <li key={item.title} className="flex items-start gap-3 p-4">
                  <item.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            El token para conectar automatizaciones externas (n8n, Zapier) se genera desde{' '}
            <Link href="/dashboard/settings/company" className="underline">
              Perfil de Empresa
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
