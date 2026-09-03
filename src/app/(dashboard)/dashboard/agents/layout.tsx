import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasCrm" permission="agents:view">
      {children}
    </ModuleGate>
  );
}
