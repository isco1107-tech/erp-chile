import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function FixedAssetsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasFixedAssets" permission="assets:read">
      {children}
    </ModuleGate>
  );
}
