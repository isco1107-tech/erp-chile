import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function VotingLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasPublicVoting" permission="publicvoting:read">
      {children}
    </ModuleGate>
  );
}
