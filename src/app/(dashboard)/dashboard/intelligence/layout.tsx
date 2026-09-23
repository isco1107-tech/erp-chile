import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasIntelligence" permission="intelligence:view">
      {children}
    </ModuleGate>
  );
}
