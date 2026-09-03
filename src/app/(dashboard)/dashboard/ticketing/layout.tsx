import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function TicketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasTicketing" permission="ticketing:read">
      {children}
    </ModuleGate>
  );
}
