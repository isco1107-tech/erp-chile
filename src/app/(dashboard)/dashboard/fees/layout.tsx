import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function FeesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasFeeDocuments" permission="fees:read">
      {children}
    </ModuleGate>
  );
}
