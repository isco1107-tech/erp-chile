import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function PromissoryNotesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasPromissoryNotes" permission="promissorynotes:read">
      {children}
    </ModuleGate>
  );
}
