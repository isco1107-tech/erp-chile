import React from 'react';
import ModuleGate from '@/components/ModuleGate';

/** Funcionalidad con interruptor propio dentro de Inventario (el layout padre ya exige el suyo). */
export default function ShrinkageLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasShrinkageLiability" permission="products:read">
      {children}
    </ModuleGate>
  );
}
