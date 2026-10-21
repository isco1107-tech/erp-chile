import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function QualityLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasQuality" permission="quality:read">
      {children}
    </ModuleGate>
  );
}
