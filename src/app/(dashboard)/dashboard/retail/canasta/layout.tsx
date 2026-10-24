import React from 'react';
import ModuleGate from '@/components/ModuleGate';

/** Funcionalidad con interruptor propio dentro de Métricas de retail (el layout padre ya exige el suyo). */
export default function BasketLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasBasketAnalysis" permission="retail:read">
      {children}
    </ModuleGate>
  );
}
