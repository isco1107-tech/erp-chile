import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasInventory" permission="products:read">
      {children}
    </ModuleGate>
  );
}
