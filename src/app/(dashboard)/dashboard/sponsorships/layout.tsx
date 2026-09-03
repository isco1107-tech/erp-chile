import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function SponsorshipsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasSponsorships" permission="sponsorships:read">
      {children}
    </ModuleGate>
  );
}
