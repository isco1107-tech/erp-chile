import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function WebSitesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasWebSites" permission="websites:read">
      {children}
    </ModuleGate>
  );
}
