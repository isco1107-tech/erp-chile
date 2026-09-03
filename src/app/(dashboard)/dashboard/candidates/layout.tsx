import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function CandidatesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasCandidates" permission="candidates:read">
      {children}
    </ModuleGate>
  );
}
