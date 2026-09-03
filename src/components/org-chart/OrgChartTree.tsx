'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getOrgChartTreeAction } from '@/modules/org-chart/actions/org-chart.actions';
import type { OrgChartNode } from '@/modules/org-chart/services/org-chart.service';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function OrgChartNodeCard({ node }: { node: OrgChartNode }) {
  return (
    <div>
      <div
        className={`flex items-center gap-3 rounded-xl border border-border p-3 ${
          !node.user.isActive ? 'opacity-60' : ''
        }`}
      >
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/40">
          {node.user.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={node.user.photoUrl} alt={node.user.name} className="size-full object-cover" />
          ) : (
            <span className="text-xs font-bold text-muted-foreground">{initials(node.user.name)}</span>
          )}
        </div>
        <div>
          <p className="flex items-center gap-2 font-semibold text-foreground">
            {node.user.name}
            {!node.user.isActive && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Inactivo
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{node.jobPositionName ?? 'Sin cargo asignado'}</p>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="mt-2 ml-5 space-y-2 border-l border-border pl-4">
          {node.children.map((child) => (
            <OrgChartNodeCard key={child.user.id} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgChartTree() {
  const [roots, setRoots] = useState<OrgChartNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOrgChartTreeAction().then((result) => {
      if (result.success) setRoots(result.data);
      else toast.error(result.error);
      setLoading(false);
    });
  }, []);

  if (loading) return <p className="p-4 text-center text-sm text-muted-foreground">Cargando...</p>;
  if (roots.length === 0) {
    return <p className="p-4 text-center text-sm text-muted-foreground">Sin colaboradores registrados todavía.</p>;
  }

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      {roots.map((root) => (
        <OrgChartNodeCard key={root.user.id} node={root} />
      ))}
    </div>
  );
}
