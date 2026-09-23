'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  assignJobPositionAction,
  assignManagerAction,
  createJobPositionAction,
  deleteJobPositionAction,
  listJobPositionsAction,
  listStaffFlatAction,
  suggestOrgChartAction,
} from '@/modules/org-chart/actions/org-chart.actions';
import type { JobPositionWithUsage, StaffFlatRow } from '@/modules/org-chart/services/org-chart.service';
import type { OrgChartSuggestion } from '@/modules/org-chart/services/suggest-hierarchy.service';
import AiSuggestionPreview from './AiSuggestionPreview';

import { useConfirm } from '@/components/ui/confirm-provider';
const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

export default function OrgChartManageClient({ canUseAi }: { canUseAi: boolean }) {
  const confirm = useConfirm();
  const [staff, setStaff] = useState<StaffFlatRow[]>([]);
  const [positions, setPositions] = useState<JobPositionWithUsage[]>([]);
  const [loading, setLoading] = useState(true);

  const [newPositionName, setNewPositionName] = useState('');
  const [newPositionLevel, setNewPositionLevel] = useState('');
  const [creatingPosition, setCreatingPosition] = useState(false);

  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<OrgChartSuggestion[] | null>(null);

  async function load() {
    setLoading(true);
    const [staffResult, positionsResult] = await Promise.all([listStaffFlatAction(), listJobPositionsAction()]);
    if (staffResult.success) setStaff(staffResult.data);
    else toast.error(staffResult.error);
    if (positionsResult.success) setPositions(positionsResult.data);
    else toast.error(positionsResult.error);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleManagerChange(userId: string, managerId: string) {
    const result = await assignManagerAction(userId, managerId || null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Jefe asignado');
    load();
  }

  async function handleJobPositionChange(userId: string, jobPositionId: string) {
    const result = await assignJobPositionAction(userId, jobPositionId || null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Cargo asignado');
    load();
  }

  async function handleAddPosition() {
    if (!newPositionName.trim()) {
      toast.error('Ingrese el nombre del cargo');
      return;
    }
    setCreatingPosition(true);
    try {
      const result = await createJobPositionAction({
        name: newPositionName.trim(),
        level: newPositionLevel.trim() || undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Cargo creado');
      setNewPositionName('');
      setNewPositionLevel('');
      load();
    } finally {
      setCreatingPosition(false);
    }
  }

  async function handleDeletePosition(id: string, name: string) {
    if (!await confirm(`¿Eliminar el cargo "${name}"?`)) return;
    const result = await deleteJobPositionAction(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Cargo eliminado');
    load();
  }

  async function handleSuggest() {
    setSuggesting(true);
    try {
      const result = await suggestOrgChartAction();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSuggestions(result.data);
      if (result.data.length === 0) toast.error('La IA no generó sugerencias con los datos actuales');
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Catálogo de cargos</h2>
          {canUseAi && (
            <Button type="button" size="sm" variant="outline" disabled={suggesting} onClick={handleSuggest}>
              {suggesting ? 'Generando sugerencia...' : 'Sugerir con IA'}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {positions.map((position) => (
            <span
              key={position.id}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs"
            >
              {position.name}
              {position.level ? <span className="text-muted-foreground">· {position.level}</span> : null}
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                title="Eliminar cargo"
                onClick={() => handleDeletePosition(position.id, position.name)}
              >
                ×
              </button>
            </span>
          ))}
          {positions.length === 0 && <span className="text-xs text-muted-foreground">Sin cargos definidos todavía.</span>}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="newPositionName">Nuevo cargo</Label>
            <Input
              id="newPositionName"
              className="h-8 w-48"
              placeholder="Ej: Jefe de Ventas"
              value={newPositionName}
              onChange={(e) => setNewPositionName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="newPositionLevel">Nivel (opcional)</Label>
            <Input
              id="newPositionLevel"
              className="h-8 w-40"
              placeholder="Ej: Jefatura"
              value={newPositionLevel}
              onChange={(e) => setNewPositionLevel(e.target.value)}
            />
          </div>
          <Button type="button" size="sm" disabled={creatingPosition} onClick={handleAddPosition}>
            {creatingPosition ? 'Agregando...' : '+ Agregar cargo'}
          </Button>
        </div>
      </div>

      {suggestions && (
        <AiSuggestionPreview
          suggestions={suggestions}
          staff={staff}
          positions={positions}
          onApplied={() => {
            setSuggestions(null);
            load();
          }}
          onCancel={() => setSuggestions(null)}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] table-auto text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Nombre</th>
              <th className="p-2 font-medium">Estado</th>
              <th className="p-2 font-medium">Cargo</th>
              <th className="p-2 font-medium">Reporta a</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="p-4 text-center text-muted-foreground" colSpan={4}>
                  Cargando...
                </td>
              </tr>
            )}
            {!loading && staff.length === 0 && (
              <tr>
                <td className="p-4 text-center text-muted-foreground" colSpan={4}>
                  Sin colaboradores
                </td>
              </tr>
            )}
            {!loading &&
              staff.map((user) => (
                <tr key={user.id} className="border-t border-border">
                  <td className="p-2">
                    {user.name}
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </td>
                  <td className="p-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.isActive ? 'bg-green-600/10 text-green-600' : 'bg-destructive/10 text-destructive'
                      }`}
                    >
                      {user.isActive ? 'Activo' : 'Suspendido'}
                    </span>
                  </td>
                  <td className="p-2">
                    <select
                      className={selectClass}
                      value={user.jobPositionId ?? ''}
                      onChange={(e) => handleJobPositionChange(user.id, e.target.value)}
                    >
                      <option value="">— Sin cargo —</option>
                      {positions.map((position) => (
                        <option key={position.id} value={position.id}>
                          {position.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <select
                      className={selectClass}
                      value={user.managerId ?? ''}
                      onChange={(e) => handleManagerChange(user.id, e.target.value)}
                    >
                      <option value="">— Sin jefe —</option>
                      {staff
                        .filter((other) => other.id !== user.id)
                        .map((other) => (
                          <option key={other.id} value={other.id}>
                            {other.name}
                          </option>
                        ))}
                    </select>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
