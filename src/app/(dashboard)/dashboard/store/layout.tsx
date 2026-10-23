import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasEcommerce" permission="store:read">
      {children}
    </ModuleGate>
  );
}
