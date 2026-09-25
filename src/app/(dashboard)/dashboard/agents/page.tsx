import React, { Suspense } from 'react';
import AgentsClient from '@/components/agents/AgentsClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { visibleAgentRoles } from '@/modules/agents/constants';

export const metadata = { title: 'Agentes de Inteligencia de Negocio' };
/** "Analizar ahora" corre el agente dentro de la Server Action (puede llamar a Gemini). */
export const maxDuration = 60;

export default async function AgentsPage() {
  const context = await getAuthContext();
  const roles = visibleAgentRoles(context.features);
  const eventsOnly = !context.features.hasCrm;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase mb-1">Business intelligence / agents</p>
        <h1 className="text-2xl font-semibold text-foreground" data-tutorial="module-header">Agentes de Inteligencia de Negocio</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {eventsOnly
            ? 'Agentes financieros de tu productora: revisan la rentabilidad y el presupuesto de cada certamen y la cobranza de cuotas, pagarés y auspicios.'
            : 'Equipo ejecutivo virtual (CEO, CFO, COO, Ventas) que analiza tus datos reales de ventas, compras, inventario y tesorería.'}{' '}
          {context.features.hasEventProjects && !eventsOnly && 'Si produces eventos, se suman los agentes de finanzas de producción y cobranza. '}
          Dejan recomendaciones para que las leas: ningún agente envía comunicación externa ni ejecuta acciones fuera del sistema.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando...</p>}>
        <AgentsClient roles={roles} canRunNow={can(context, 'agents:approve')} />
      </Suspense>
    </div>
  );
}
