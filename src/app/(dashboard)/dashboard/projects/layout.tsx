import React from 'react';
import ModuleGate from '@/components/ModuleGate';

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasEventProjects" permission="projects:read">
      {children}
    </ModuleGate>
  );
}
