import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function ManufacturingLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasProduction" permission="manufacturing:read">
      {children}
    </ModuleGate>
  );
}
