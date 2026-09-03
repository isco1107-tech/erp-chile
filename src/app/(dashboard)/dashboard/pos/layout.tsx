import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasPos" permission="pos:operate">
      {children}
    </ModuleGate>
  );
}
