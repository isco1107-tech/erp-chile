'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import StudentsPanel from './StudentsPanel';
import AttendancePanel from './AttendancePanel';
import PaymentsPanel from './PaymentsPanel';
import GroupsPanel from './GroupsPanel';
import ApplicationsPanel from './ApplicationsPanel';
import { countPendingApplicationsAction } from '@/modules/academy/actions/academy.actions';

type Tab = 'STUDENTS' | 'APPLICATIONS' | 'ATTENDANCE' | 'PAYMENTS' | 'GROUPS';

export default function AcademyClient({ canWrite, canManage }: { canWrite: boolean; canManage: boolean }) {
  const [tab, setTab] = useState<Tab>('STUDENTS');
  const [pending, setPending] = useState(0);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    void countPendingApplicationsAction().then((result) => {
      if (active && result.success) setPending(result.data);
    });
    return () => {
      active = false;
    };
  }, [version]);
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: 'STUDENTS', label: 'Alumnas' },
    { value: 'APPLICATIONS', label: pending > 0 ? `Inscripciones (${pending})` : 'Inscripciones' },
    { value: 'ATTENDANCE', label: 'Pasar lista' },
    { value: 'PAYMENTS', label: 'Mensualidades' },
    { value: 'GROUPS', label: 'Grupos' },
  ];
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Secciones de la academia" className="inline-flex flex-wrap rounded-md bg-muted p-0.5">
        {tabs.map((t) => (
          <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)} className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', tab === t.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'STUDENTS' && <StudentsPanel canWrite={canWrite} canManage={canManage} />}
      {tab === 'APPLICATIONS' && <ApplicationsPanel canWrite={canWrite} canManage={canManage} onChanged={refresh} />}
      {tab === 'ATTENDANCE' && <AttendancePanel canWrite={canWrite} />}
      {tab === 'PAYMENTS' && <PaymentsPanel canWrite={canWrite} />}
      {tab === 'GROUPS' && <GroupsPanel canManage={canManage} canWrite={canWrite} />}
    </div>
  );
}
