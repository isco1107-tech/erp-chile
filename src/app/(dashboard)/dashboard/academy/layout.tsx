import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function AcademyLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasAcademy" permission="academy:read">
      {children}
    </ModuleGate>
  );
}
