import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasServiceDesk" permission="service:read">
      {children}
    </ModuleGate>
  );
}
