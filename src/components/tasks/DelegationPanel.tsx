'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import { DELEGATED_DECISIONS, DELEGATED_DECISION_LABELS, type DelegatedDecisionKey } from '@/lib/tasks/delegation';
import { checkDelegationAction, deleteDelegationRuleAction, listDelegationRulesAction, listTeamAction, saveDelegationRuleAction } from '@/modules/tasks/actions/tasks.actions';
import type { DelegationRuleRow } from '@/modules/tasks/services/tasks.service';

type RoleKey = 'ADMIN' | 'SALES' | 'WAREHOUSE' | 'ACCOUNTANT';
const ROLE_LABELS: Record<RoleKey, string> = { ADMIN: 'Administradores', SALES: 'Ventas', WAREHOUSE: 'Bodega y planta', ACCOUNTANT: 'Contabilidad' };
interface Draft { id: string | null; decision: DelegatedDecisionKey; title: string; who: string; maxAmount: string; maxPercent: string; conditions: string; isActive: boolean }
const fieldClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';
const IDEAS: Array<{ decision: DelegatedDecisionKey; title: string }> = [
  { decision: 'PURCHASE_APPROVAL', title: 'Compras de insumos habituales hasta un monto' },
  { decision: 'DISCOUNT', title: 'Descuento a clientes hasta un porcentaje' },
  { decision: 'STOCK_ADJUSTMENT', title: 'Ajustes de inventario por merma' },
];

export default function DelegationPanel({ canManage, onChanged }: { canManage: boolean; onChanged: () => void }) {
  const confirm = useConfirm();
  const [rules, setRules] = useState<DelegationRuleRow[]>([]);
  const [team, setTeam] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ask, setAsk] = useState<{ decision: DelegatedDecisionKey; amount: string; percent: string }>({ decision: 'PURCHASE_APPROVAL', amount: '', percent: '' });
  const [answer, setAnswer] = useState<{ allowed: boolean; reason: string } | null>(null);

  const load = useCallback(async () => {
    const [r, t] = await Promise.all([listDelegationRulesAction(), listTeamAction()]);
    if (r.success) setRules(r.data);
    else toast.error(r.error);
    if (t.success) setTeam(t.data.filter((u) => u.role !== 'OWNER'));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const byPerson = draft.who.startsWith('U:');
    setSaving(true);
    try {
      const result = await saveDelegationRuleAction(draft.id, {
        decision: draft.decision,
        title: draft.title,
        delegateeId: byPerson ? draft.who.slice(2) : null,
        delegateRole: byPerson ? null : draft.who.slice(2) || null,
        maxAmount: draft.maxAmount === '' ? null : Number(draft.maxAmount),
        maxPercent: draft.maxPercent === '' ? null : Number(draft.maxPercent),
        conditions: draft.conditions.trim() || undefined,
        isActive: draft.isActive,
      });
      if (!result.success) return void toast.error(result.error);
      toast.success(result.message ?? 'Regla guardada');
      setDraft(null);
      await load();
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove(rule: DelegationRuleRow) {
    if (!(await confirm({ title: `¿Eliminar la regla "${rule.title}"?`, description: 'Esa decisión vuelve a depender del dueño.', confirmLabel: 'Eliminar' }))) return;
    const result = await deleteDelegationRuleAction(rule.id);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Regla eliminada');
    await load();
    onChanged();
  }

  async function check() {
    const result = await checkDelegationAction({ decision: ask.decision, amount: ask.amount === '' ? undefined : Number(ask.amount), percent: ask.percent === '' ? undefined : Number(ask.percent) });
    if (result.success) setAnswer(result.data);
    else toast.error(result.error);
  }

  const blank = (decision: DelegatedDecisionKey = 'PURCHASE_APPROVAL', title = ''): Draft => ({ id: null, decision, title, who: '', maxAmount: '', maxPercent: '', conditions: '', isActive: true });
  const describe = (r: DelegationRuleRow) => (r.delegateeName ? r.delegateeName : r.delegateRole ? ROLE_LABELS[r.delegateRole as RoleKey] ?? r.delegateRole : 'Sin responsable');

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm text-muted-foreground">Escribe qué decisiones puede tomar cada persona sin consultarte y hasta qué monto. Así el equipo sabe cuándo actuar solo y cuándo preguntar. Estas reglas orientan; los permisos de cada rol siguen mandando en el sistema.</p>

      <section className="space-y-2 rounded-lg border border-border bg-card p-4" aria-label="Consulta rápida">
        <h3 className="text-sm font-semibold">¿Puedo decidir esto yo?</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs font-medium">Decisión
            <select className={fieldClass} value={ask.decision} onChange={(e) => { setAsk({ ...ask, decision: e.target.value as DelegatedDecisionKey }); setAnswer(null); }}>
              {DELEGATED_DECISIONS.map((d) => <option key={d} value={d}>{DELEGATED_DECISION_LABELS[d]}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium">Monto (opcional)<Input type="number" min={0} className="w-36" value={ask.amount} onChange={(e) => { setAsk({ ...ask, amount: e.target.value }); setAnswer(null); }} /></label>
          <label className="space-y-1 text-xs font-medium">% (opcional)<Input type="number" min={0} max={100} className="w-24" value={ask.percent} onChange={(e) => { setAsk({ ...ask, percent: e.target.value }); setAnswer(null); }} /></label>
          <Button size="sm" onClick={check}>Consultar</Button>
        </div>
        {answer && <p role="status" className={`rounded-md p-2 text-sm font-medium ${answer.allowed ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>{answer.allowed ? 'Sí. ' : 'No. '}{answer.reason}</p>}
      </section>

      {canManage && !draft && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Ideas para partir:
            {IDEAS.map((i) => <Button key={i.title} size="xs" variant="outline" onClick={() => setDraft(blank(i.decision, i.title))}>{i.title}</Button>)}
          </div>
          <Button size="sm" onClick={() => setDraft(blank())}><Plus aria-hidden="true" /> Nueva regla</Button>
        </div>
      )}

      {draft && (
        <form onSubmit={save} className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">{draft.id ? 'Editar regla' : 'Nueva regla de delegación'}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">Decisión
              <select className={fieldClass} value={draft.decision} onChange={(e) => setDraft({ ...draft, decision: e.target.value as DelegatedDecisionKey })}>
                {DELEGATED_DECISIONS.map((d) => <option key={d} value={d}>{DELEGATED_DECISION_LABELS[d]}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">Quién puede decidirla
              <select required className={fieldClass} value={draft.who} onChange={(e) => setDraft({ ...draft, who: e.target.value })}>
                <option value="">Elegir…</option>
                <optgroup label="Personas">{team.map((u) => <option key={u.id} value={`U:${u.id}`}>{u.name}</option>)}</optgroup>
                <optgroup label="Roles">{(Object.keys(ROLE_LABELS) as RoleKey[]).map((r) => <option key={r} value={`R:${r}`}>{ROLE_LABELS[r]}</option>)}</optgroup>
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-sm font-medium">Regla en una frase<Input required maxLength={140} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1 text-sm font-medium">Monto máximo en pesos (vacío = sin tope)<Input type="number" min={0} value={draft.maxAmount} onChange={(e) => setDraft({ ...draft, maxAmount: e.target.value })} /></label>
            <label className="space-y-1 text-sm font-medium">Porcentaje máximo (vacío = sin tope)<Input type="number" min={0} max={100} value={draft.maxPercent} onChange={(e) => setDraft({ ...draft, maxPercent: e.target.value })} /></label>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Regla vigente</label>
          </div>
          <label className="block space-y-1 text-sm font-medium">Condiciones (opcional)<Input maxLength={500} placeholder="Ej: solo proveedores habituales, avisar por WhatsApp después" value={draft.conditions} onChange={(e) => setDraft({ ...draft, conditions: e.target.value })} /></label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>Guardar regla</Button>
          </div>
        </form>
      )}

      <section className="rounded-lg border border-border bg-card" aria-label="Reglas de delegación">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : rules.length === 0 ? (
          <EmptyState title="Aún no delegas ninguna decisión" description="Parte con tres decisiones del día a día (compras habituales, descuentos, mermas) y ve sumando." />
        ) : (
          <ul className="divide-y divide-border">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{r.title} {!r.isActive && <StatusBadge tone="neutral">Suspendida</StatusBadge>}</p>
                  <p className="text-xs text-muted-foreground">
                    {DELEGATED_DECISION_LABELS[r.decision]} · {describe(r)} · {[r.maxAmount !== null ? `hasta ${formatCurrency(r.maxAmount)}` : null, r.maxPercent !== null ? `hasta ${r.maxPercent}%` : null].filter(Boolean).join(' y ') || 'sin tope'}
                    {r.conditions ? ` · ${r.conditions}` : ''}
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDraft({ id: r.id, decision: r.decision, title: r.title, who: r.delegateeId ? `U:${r.delegateeId}` : `R:${r.delegateRole ?? ''}`, maxAmount: r.maxAmount === null ? '' : String(r.maxAmount), maxPercent: r.maxPercent === null ? '' : String(r.maxPercent), conditions: r.conditions ?? '', isActive: r.isActive })}>Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(r)}>Eliminar</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
