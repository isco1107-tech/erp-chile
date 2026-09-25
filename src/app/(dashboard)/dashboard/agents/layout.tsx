import React from 'react';
import ModuleGate from '@/components/ModuleGate';
import { getAuthContext } from '@/lib/auth/guards';

/**
 * Los agentes llegan por dos módulos: el equipo ejecutivo con CRM y los
 * agentes financieros de eventos con Certámenes. Basta con uno de los dos;
 * si no hay ninguno, la puerta muestra el aviso del módulo CRM.
 */
export default async function AgentsLayout({ children }: { children: React.ReactNode }) {
  const context = await getAuthContext().catch(() => null);
  const moduleKey = context && !context.features.hasCrm && context.features.hasEventProjects ? 'hasEventProjects' : 'hasCrm';
  return (
    <ModuleGate moduleKey={moduleKey} permission="agents:view">
      {children}
    </ModuleGate>
  );
}
