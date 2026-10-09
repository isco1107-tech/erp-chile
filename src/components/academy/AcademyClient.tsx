'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import StudentsPanel from './StudentsPanel';
import AttendancePanel from './AttendancePanel';
import PaymentsPanel from './PaymentsPanel';
import GroupsPanel from './GroupsPanel';
import ApplicationsPanel from './ApplicationsPanel';
import SitePanel from './SitePanel';
import CalendarPanel from './CalendarPanel';
import MaterialsTab from './MaterialsTab';
import { countPendingApplicationsAction } from '@/modules/academy/actions/academy.actions';

type Tab = 'CALENDAR' | 'STUDENTS' | 'APPLICATIONS' | 'ATTENDANCE' | 'MATERIAL' | 'PAYMENTS' | 'GROUPS' | 'SITE';

export default function AcademyClient({ canWrite, canManage }: { canWrite: boolean; canManage: boolean }) {
  const [tab, setTab] = useState<Tab>('CALENDAR');
  const [pending, setPending] = useState(0);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const goToGroups = useCallback(() => setTab('GROUPS'), []);
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
    { value: 'CALENDAR', label: 'Calendario' },
    { value: 'STUDENTS', label: 'Alumnas' },
    { value: 'APPLICATIONS', label: pending > 0 ? `Inscripciones (${pending})` : 'Inscripciones' },
    { value: 'ATTENDANCE', label: 'Pasar lista' },
    { value: 'MATERIAL', label: 'Material' },
    { value: 'PAYMENTS', label: 'Mensualidades' },
    { value: 'GROUPS', label: 'Grupos' },
    { value: 'SITE', label: 'Sitio web' },
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
      {tab === 'CALENDAR' && <CalendarPanel canWrite={canWrite} onGoToGroups={goToGroups} />}
      {tab === 'STUDENTS' && <StudentsPanel canWrite={canWrite} canManage={canManage} />}
      {tab === 'APPLICATIONS' && <ApplicationsPanel canWrite={canWrite} canManage={canManage} onChanged={refresh} />}
      {tab === 'ATTENDANCE' && <AttendancePanel canWrite={canWrite} />}
      {tab === 'MATERIAL' && <MaterialsTab canWrite={canWrite} onGoToGroups={goToGroups} />}
      {tab === 'PAYMENTS' && <PaymentsPanel canWrite={canWrite} />}
      {tab === 'SITE' && <SitePanel canManage={canManage} />}
      {tab === 'GROUPS' && <GroupsPanel canManage={canManage} canWrite={canWrite} />}
    </div>
  );
}
