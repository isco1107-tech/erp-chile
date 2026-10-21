'use client';

import { useState } from 'react';
import ActivitiesPanel from './ActivitiesPanel';
import IncidentsPanel from './IncidentsPanel';
import PersonSearchPanel from './PersonSearchPanel';
import RequestsPanel, { type RequestRow, type SearchSeed } from './RequestsPanel';
import type { PrivacyIncident } from '@prisma/client';

type Tab = 'requests' | 'search' | 'activities' | 'incidents';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'requests', label: 'Solicitudes de titulares' },
  { id: 'search', label: 'Buscar datos de una persona' },
  { id: 'activities', label: 'Registro de actividades' },
  { id: 'incidents', label: 'Incidentes de seguridad' },
];

interface Props {
  companyName: string;
  contractedModules: string[];
  requests: RequestRow[];
  incidents: PrivacyIncident[];
  portalUrl: string | null;
  openRequests: number;
  overdueRequests: number;
}

export default function PrivacyCenter({ companyName, contractedModules, requests, incidents, portalUrl, openRequests, overdueRequests }: Props) {
  const [tab, setTab] = useState<Tab>('requests');
  const [searchSeed, setSearchSeed] = useState<SearchSeed | null>(null);

  return (
    <div className="space-y-4">
      {overdueRequests > 0 && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Tienes {overdueRequests} {overdueRequests === 1 ? 'solicitud vencida' : 'solicitudes vencidas'}. Respóndelas cuanto antes o prorroga el plazo con su motivo.
        </p>
      )}
      <div role="tablist" aria-label="Protección de datos" className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === item.id ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {item.label}
            {item.id === 'requests' && openRequests > 0 && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-xs">{openRequests}</span>}
          </button>
        ))}
      </div>

      {tab === 'requests' && (
        <RequestsPanel
          initialRequests={requests}
          initialPortalUrl={portalUrl}
          onSearchPerson={(seed) => {
            setSearchSeed(seed);
            setTab('search');
          }}
        />
      )}
      {tab === 'search' && <PersonSearchPanel initial={searchSeed} />}
      {tab === 'activities' && <ActivitiesPanel companyName={companyName} contractedModules={contractedModules} />}
      {tab === 'incidents' && <IncidentsPanel initial={incidents} />}
    </div>
  );
}
