import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function TasksLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasTeamTasks" permission="tasks:read">
      {children}
    </ModuleGate>
  );
}
