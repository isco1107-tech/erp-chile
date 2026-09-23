import React, { Suspense } from 'react';
import AgentsClient from '@/components/agents/AgentsClient';

export const metadata = { title: 'Agentes de Inteligencia de Negocio' };

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase mb-1">Business intelligence / agents</p>
        <h1 className="text-2xl font-semibold text-foreground" data-tutorial="module-header">Agentes de Inteligencia de Negocio</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Equipo ejecutivo virtual (CEO, CFO, COO, Ventas) que analiza tus datos reales de ventas, compras,
          inventario y tesorería, y deja recomendaciones para que las leas. Ningún agente envía comunicación
          externa ni ejecuta acciones fuera del sistema — todo el resultado es texto informativo.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando...</p>}>
        <AgentsClient />
      </Suspense>
    </div>
  );
}
