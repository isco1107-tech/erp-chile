import React from 'react';
import ModuleGate from '@/components/ModuleGate';

/** Funcionalidad con interruptor propio dentro de Métricas de retail (el layout padre ya exige el suyo). */
export default function ReorderLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasSmartReorder" permission="retail:read">
      {children}
    </ModuleGate>
  );
}
