'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BookOpenCheck, ClipboardCheck, ShieldAlert, Users } from 'lucide-react';
import { KpiCard } from '@/components/ui/KpiCard';
import { cn } from '@/lib/utils';
import { getQualityOverviewAction } from '@/modules/quality/actions/quality.actions';
import type { QualityOverview } from '@/modules/quality/services/quality.service';
import ProceduresPanel from './ProceduresPanel';
import InspectionsPanel from './InspectionsPanel';
import SuppliersPanel from './SuppliersPanel';
import TemplatesPanel from './TemplatesPanel';

type Tab = 'PROCEDIMIENTOS' | 'INSPECCIONES' | 'PRODUCTORES' | 'PLANTILLAS';
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'PROCEDIMIENTOS', label: 'Procedimientos' },
  { value: 'INSPECCIONES', label: 'Inspecciones' },
  { value: 'PRODUCTORES', label: 'Productores' },
  { value: 'PLANTILLAS', label: 'Plantillas' },
];

export default function QualityClient({ canWrite, canManage }: { canWrite: boolean; canManage: boolean }) {
  const [tab, setTab] = useState<Tab>('PROCEDIMIENTOS');
  const [overview, setOverview] = useState<QualityOverview | null>(null);

  useEffect(() => {
    let active = true;
    void getQualityOverviewAction().then((result) => {
      if (!active) return;
      if (result.success) setOverview(result.data);
      else toast.error(result.error);
    });
    return () => {
      active = false;
    };
  }, [tab]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Lotes aprobados (30 días)" value={overview?.passRate30d == null ? '—' : `${overview.passRate30d}%`} icon={ClipboardCheck} tone={overview?.passRate30d == null ? 'neutral' : overview.passRate30d >= 90 ? 'success' : 'warning'} hint={overview ? `${overview.inspections30d} inspecciones` : 'Cargando…'} />
        <KpiCard label="No aprobadas (30 días)" value={overview ? String(overview.failed30d) : '—'} icon={ShieldAlert} tone={overview && overview.failed30d > 0 ? 'danger' : 'neutral'} hint="Revisa la acción correctiva de cada una" />
        <KpiCard label="Por leer" value={overview ? String(overview.pendingForMe) : '—'} icon={BookOpenCheck} tone={overview && overview.pendingForMe > 0 ? 'warning' : 'neutral'} hint={overview ? `${overview.proceduresActive} procedimientos vigentes${overview.reviewsDue > 0 ? ` · ${overview.reviewsDue} por revisar` : ''}` : undefined} />
        <KpiCard label="Productores y proveedores" value={overview ? String(overview.suppliers) : '—'} icon={Users} tone="info" hint="Contactos marcados como proveedor" />
      </div>

      <div role="tablist" aria-label="Secciones de calidad" className="inline-flex flex-wrap rounded-md bg-muted p-0.5">
        {TABS.map((t) => (
          <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)} className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', tab === t.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'PROCEDIMIENTOS' && <ProceduresPanel canManage={canManage} />}
      {tab === 'INSPECCIONES' && <InspectionsPanel canWrite={canWrite} />}
      {tab === 'PRODUCTORES' && <SuppliersPanel canWrite={canWrite} />}
      {tab === 'PLANTILLAS' && <TemplatesPanel canManage={canManage} />}
    </div>
  );
}
