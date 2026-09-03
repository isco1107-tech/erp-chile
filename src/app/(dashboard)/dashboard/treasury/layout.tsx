import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function TreasuryLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasTreasury" permission="treasury:read">
      {children}
    </ModuleGate>
  );
}
