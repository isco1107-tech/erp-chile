'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, History, Copy, RefreshCw, ChevronDown, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  WORKFLOW_TRIGGER_DEFINITIONS,
  WORKFLOW_ACTION_TYPE_LABELS,
  WORKFLOW_CONDITION_OPERATOR_LABELS,
  type WorkflowCondition,
  type WorkflowActionConfig,
  type WorkflowConditionOperator,
  type WorkflowTriggerEvent,
} from '@/lib/workflows/types';
import type { WorkflowActionType, WorkflowExecutionStatus } from '@prisma/client';
import {
  listWorkflowRulesAction,
  createWorkflowRuleAction,
  updateWorkflowRuleAction,
  deleteWorkflowRuleAction,
  setWorkflowRuleActiveAction,
  regenerateWorkflowRuleSecretAction,
  listWorkflowExecutionsAction,
} from '@/modules/automation/actions/workflow-rules.actions';
import type { WorkflowRuleRow, WorkflowExecutionRow } from '@/modules/automation/services/workflow-rules.service';
import type { WorkflowRuleInput } from '@/modules/automation/schema';

import { useConfirm } from '@/components/ui/confirm-provider';
const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';
const textareaClass =
  'min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

const TRIGGER_OPTIONS = Object.values(WORKFLOW_TRIGGER_DEFINITIONS);

const EXECUTION_STATUS_META: Record<WorkflowExecutionStatus, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  SUCCESS: { label: 'Correcta', tone: 'success' },
  PARTIAL_FAILURE: { label: 'Parcial', tone: 'warning' },
  FAILED: { label: 'Falló', tone: 'danger' },
};

function emptyAction(type: WorkflowActionType): WorkflowActionConfig {
  switch (type) {
    case 'SEND_EMAIL':
      return { type: 'SEND_EMAIL', to: '', subject: '', body: '' };
    case 'CREATE_NOTIFICATION':
      return { type: 'CREATE_NOTIFICATION', title: '', message: '', severity: 'INFO', href: '' };
    case 'CALL_WEBHOOK':
      return { type: 'CALL_WEBHOOK', url: '' };
  }
}

interface FormState {
  name: string;
  description: string;
  trigger: WorkflowTriggerEvent;
  conditions: WorkflowCondition[];
  actions: WorkflowActionConfig[];
  isActive: boolean;
}

function emptyForm(): FormState {
  return { name: '', description: '', trigger: TRIGGER_OPTIONS[0].event, conditions: [], actions: [emptyAction('SEND_EMAIL')], isActive: true };
}

function ruleToForm(rule: WorkflowRuleRow): FormState {
  return {
    name: rule.name,
    description: rule.description ?? '',
    trigger: rule.trigger,
    conditions: rule.conditions,
    actions: rule.actions,
    isActive: rule.isActive,
  };
}

export default function WorkflowRulesClient() {
  const confirm = useConfirm();
  const [rules, setRules] = useState<WorkflowRuleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [secretForId, setSecretForId] = useState<string | null>(null);
  const [secretValue, setSecretValue] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [executions, setExecutions] = useState<Record<string, WorkflowExecutionRow[]>>({});
  const [expandedExecutionId, setExpandedExecutionId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const result = await listWorkflowRulesAction();
    if (result.success) setRules(result.data);
    else toast.error(result.error);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(rule: WorkflowRuleRow) {
    setEditingId(rule.id);
    setForm(ruleToForm(rule));
    setFormOpen(true);
  }

  async function save() {
    if (!form.name.trim()) return toast.error('Ponle un nombre a la regla');
    if (form.actions.length === 0) return toast.error('Agrega al menos una acción');

    setSaving(true);
    const input: WorkflowRuleInput = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      trigger: form.trigger,
      conditions: form.conditions.filter((c) => c.field && c.value.trim()),
      actions: form.actions,
      isActive: form.isActive,
    };

    const result = editingId ? await updateWorkflowRuleAction(editingId, input) : await createWorkflowRuleAction(input);
    setSaving(false);

    if (!result.success) return toast.error(result.error);
    toast.success(result.message ?? 'Guardado');
    setFormOpen(false);
    await load();
  }

  async function remove(rule: WorkflowRuleRow) {
    if (!await confirm(`¿Eliminar la regla "${rule.name}"? Esta acción no se puede deshacer.`)) return;
    const result = await deleteWorkflowRuleAction(rule.id);
    if (!result.success) return toast.error(result.error);
    toast.success(result.message ?? 'Regla eliminada');
    await load();
  }

  async function toggleActive(rule: WorkflowRuleRow) {
    const result = await setWorkflowRuleActiveAction(rule.id, !rule.isActive);
    if (!result.success) return toast.error(result.error);
    await load();
  }

  async function openSecret(rule: WorkflowRuleRow) {
    setSecretForId(rule.id);
    setSecretValue(rule.signingSecret);
  }

  async function regenerateSecret() {
    if (!secretForId) return;
    if (!await confirm('¿Regenerar el secreto? Cualquier integración externa que use el secreto actual (n8n, Zapier, tu propio servidor) empezará a fallar la verificación de firma hasta que la actualices con el nuevo valor.')) return;
    setRegenerating(true);
    const result = await regenerateWorkflowRuleSecretAction(secretForId);
    setRegenerating(false);
    if (!result.success) return toast.error(result.error);
    setSecretValue(result.data.signingSecret);
    toast.success(result.message ?? 'Secreto regenerado');
  }

  async function toggleHistory(rule: WorkflowRuleRow) {
    if (historyOpenId === rule.id) {
      setHistoryOpenId(null);
      return;
    }
    setHistoryOpenId(rule.id);
    setExpandedExecutionId(null);
    if (!executions[rule.id]) {
      setHistoryLoading(true);
      const result = await listWorkflowExecutionsAction(rule.id);
      setHistoryLoading(false);
      if (!result.success) return toast.error(result.error);
      setExecutions((prev) => ({ ...prev, [rule.id]: result.data }));
    }
  }

  const triggerFields = WORKFLOW_TRIGGER_DEFINITIONS[form.trigger].fields;

  function updateCondition(index: number, patch: Partial<WorkflowCondition>) {
    setForm((prev) => ({ ...prev, conditions: prev.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)) }));
  }

  function updateAction(index: number, next: WorkflowActionConfig) {
    setForm((prev) => ({ ...prev, actions: prev.actions.map((a, i) => (i === index ? next : a)) }));
  }

  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <h2 className="font-semibold">Flujos de trabajo personalizados</h2>
          <p className="text-sm text-muted-foreground">
            Reglas propias: cuando ocurra X, si se cumple Y, hacer Z — sin escribir código ni depender de un cron fijo.
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-1.5 size-4" /> Nueva regla
        </Button>
      </div>

      {loading && <p className="p-6 text-center text-sm text-muted-foreground">Cargando…</p>}
      {!loading && rules.length === 0 && (
        <EmptyState
          title="Todavía no hay ninguna regla"
          description="Crea la primera para enviar un correo, avisar en la campanita o llamar un webhook cuando pase algo en el sistema."
          actionLabel="Nueva regla"
          onAction={openCreate}
        />
      )}

      {!loading && rules.length > 0 && (
        <ul className="divide-y divide-border">
          {rules.map((rule) => (
            <li key={rule.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{rule.name}</p>
                    <StatusBadge tone={rule.isActive ? 'success' : 'neutral'}>{rule.isActive ? 'Activa' : 'Inactiva'}</StatusBadge>
                  </div>
                  <p className="text-xs text-muted-foreground">{WORKFLOW_TRIGGER_DEFINITIONS[rule.trigger].label}</p>
                  {rule.description && <p className="mt-1 text-sm text-muted-foreground">{rule.description}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {rule.actions.length} acción(es)
                    {rule.lastExecution && (
                      <>
                        <span>· última corrida {rule.lastExecution.createdAt.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })} ·</span>
                        <StatusBadge tone={EXECUTION_STATUS_META[rule.lastExecution.status].tone}>{EXECUTION_STATUS_META[rule.lastExecution.status].label}</StatusBadge>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => toggleActive(rule)}>
                    {rule.isActive ? 'Desactivar' : 'Activar'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleHistory(rule)}>
                    <History className="mr-1.5 size-3.5" /> Historial
                  </Button>
                  {rule.actions.some((a) => a.type === 'CALL_WEBHOOK') && (
                    <Button variant="outline" size="sm" onClick={() => openSecret(rule)}>
                      Secreto
                    </Button>
                  )}
                  <Button variant="outline" size="icon-xs" onClick={() => openEdit(rule)} title="Editar regla" aria-label="Editar regla">
                    <Pencil />
                  </Button>
                  <Button variant="destructive" size="icon-xs" onClick={() => remove(rule)} title="Eliminar regla" aria-label="Eliminar regla">
                    <Trash2 />
                  </Button>
                </div>
              </div>

              {historyOpenId === rule.id && (
                <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                  {historyLoading && <p className="text-sm text-muted-foreground">Cargando historial…</p>}
                  {!historyLoading && (executions[rule.id]?.length ?? 0) === 0 && (
                    <p className="text-sm text-muted-foreground">Esta regla no se ha disparado todavía.</p>
                  )}
                  {!historyLoading && (executions[rule.id]?.length ?? 0) > 0 && (
                    <ul className="space-y-1.5">
                      {executions[rule.id]!.map((execution) => {
                        const meta = EXECUTION_STATUS_META[execution.status];
                        const expanded = expandedExecutionId === execution.id;
                        return (
                          <li key={execution.id} className="rounded-lg border border-border bg-card">
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                              onClick={() => setExpandedExecutionId(expanded ? null : execution.id)}
                            >
                              {expanded ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                              <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                              <span className="text-muted-foreground">{execution.createdAt.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                            </button>
                            {expanded && (
                              <div className="space-y-2 border-t border-border p-3 text-xs">
                                <div>
                                  <p className="mb-1 font-medium text-muted-foreground">Acciones ejecutadas</p>
                                  <ul className="space-y-1">
                                    {execution.actionResults.map((result, i) => (
                                      <li key={i} className="flex items-start gap-1.5">
                                        {result.success ? (
                                          <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-success" />
                                        ) : (
                                          <XCircle className="mt-0.5 size-3 shrink-0 text-destructive" />
                                        )}
                                        <span>
                                          <span className="font-medium">{WORKFLOW_ACTION_TYPE_LABELS[result.type as WorkflowActionType] ?? result.type}:</span> {result.detail}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div>
                                  <p className="mb-1 font-medium text-muted-foreground">Datos del evento</p>
                                  <pre className="overflow-x-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify(execution.eventPayload, null, 2)}</pre>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Formulario de creación/edición */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar regla' : 'Nueva regla de automatización'}</DialogTitle>
            <DialogDescription>Cuando ocurra el disparador, si se cumplen las condiciones, se ejecutan las acciones en orden.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="wf-name">Nombre</Label>
              <Input id="wf-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} maxLength={120} placeholder="Ej: Avisar por Slack cuando el stock cae" />
            </div>

            <div>
              <Label htmlFor="wf-description">Descripción (opcional)</Label>
              <textarea
                id="wf-description"
                className={textareaClass}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                maxLength={500}
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="wf-trigger">1. Disparador</Label>
              <select
                id="wf-trigger"
                className={selectClass}
                value={form.trigger}
                onChange={(e) => {
                  const nextTrigger = e.target.value as WorkflowTriggerEvent;
                  setForm((p) => {
                    if (p.conditions.length > 0) toast.info('Se reiniciaron las condiciones: el disparador nuevo expone campos distintos');
                    return { ...p, trigger: nextTrigger, conditions: [] };
                  });
                }}
              >
                {TRIGGER_OPTIONS.map((t) => (
                  <option key={t.event} value={t.event}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">{WORKFLOW_TRIGGER_DEFINITIONS[form.trigger].description}</p>
            </div>

            <div className="border-t border-border pt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <Label>2. Condiciones (opcional — vacío = siempre)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm((p) => ({ ...p, conditions: [...p.conditions, { field: triggerFields[0]?.field ?? '', operator: 'equals', value: '' }] }))}
                >
                  <Plus className="mr-1 size-3" /> Agregar condición
                </Button>
              </div>
              <div className="space-y-2">
                {form.conditions.map((condition, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border p-2">
                    <select
                      className={selectClass + ' w-auto flex-1'}
                      value={condition.field}
                      onChange={(e) => updateCondition(index, { field: e.target.value })}
                      aria-label="Campo"
                    >
                      {triggerFields.map((f) => (
                        <option key={f.field} value={f.field}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className={selectClass + ' w-auto flex-1'}
                      value={condition.operator}
                      onChange={(e) => updateCondition(index, { operator: e.target.value as WorkflowConditionOperator })}
                      aria-label="Operador"
                    >
                      {Object.entries(WORKFLOW_CONDITION_OPERATOR_LABELS).map(([op, label]) => (
                        <option key={op} value={op}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <Input
                      className="h-8 w-28 flex-1"
                      value={condition.value}
                      onChange={(e) => updateCondition(index, { value: e.target.value })}
                      placeholder="valor"
                      aria-label="Valor"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon-xs"
                      onClick={() => setForm((p) => ({ ...p, conditions: p.conditions.filter((_, i) => i !== index) }))}
                      title="Eliminar condición"
                      aria-label="Eliminar condición"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <Label>3. Acciones</Label>
                <div className="flex gap-1.5">
                  {(['SEND_EMAIL', 'CREATE_NOTIFICATION', 'CALL_WEBHOOK'] as WorkflowActionType[]).map((type) => (
                    <Button key={type} type="button" variant="outline" size="sm" onClick={() => setForm((p) => ({ ...p, actions: [...p.actions, emptyAction(type)] }))}>
                      <Plus className="mr-1 size-3" /> {WORKFLOW_ACTION_TYPE_LABELS[type]}
                    </Button>
                  ))}
                </div>
              </div>

              <p className="mb-2 text-xs text-muted-foreground">
                Usa <code className="rounded bg-muted px-1">{'{{campo}}'}</code> en los textos para insertar un dato del evento. Campos de este disparador:{' '}
                {triggerFields.map((f) => `${f.label} ({{${f.field}}})`).join(', ')}.
              </p>

              {form.actions.length === 0 && <p className="text-sm text-muted-foreground">Agrega al menos una acción para que la regla haga algo.</p>}

              <div className="space-y-3">
                {form.actions.map((action, index) => (
                  <div key={index} className="rounded-lg border border-border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium">{WORKFLOW_ACTION_TYPE_LABELS[action.type]}</p>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon-xs"
                        onClick={() => setForm((p) => ({ ...p, actions: p.actions.filter((_, i) => i !== index) }))}
                        title="Eliminar acción"
                        aria-label="Eliminar acción"
                      >
                        <Trash2 />
                      </Button>
                    </div>

                    {action.type === 'SEND_EMAIL' && (
                      <div className="space-y-2">
                        <Input placeholder="Destinatario (ej: {{buyerEmail}} o un correo fijo)" value={action.to} onChange={(e) => updateAction(index, { ...action, to: e.target.value })} />
                        <Input placeholder="Asunto" value={action.subject} onChange={(e) => updateAction(index, { ...action, subject: e.target.value })} />
                        <textarea className={textareaClass} placeholder="Mensaje" value={action.body} onChange={(e) => updateAction(index, { ...action, body: e.target.value })} rows={3} />
                      </div>
                    )}

                    {action.type === 'CREATE_NOTIFICATION' && (
                      <div className="space-y-2">
                        <Input placeholder="Título" value={action.title} onChange={(e) => updateAction(index, { ...action, title: e.target.value })} />
                        <textarea className={textareaClass} placeholder="Mensaje" value={action.message} onChange={(e) => updateAction(index, { ...action, message: e.target.value })} rows={2} />
                        <div className="flex gap-2">
                          <select
                            className={selectClass}
                            value={action.severity}
                            onChange={(e) => updateAction(index, { ...action, severity: e.target.value as 'INFO' | 'WARNING' | 'CRITICAL' })}
                          >
                            <option value="INFO">Informativa</option>
                            <option value="WARNING">Advertencia</option>
                            <option value="CRITICAL">Crítica</option>
                          </select>
                          <Input placeholder="Ruta interna (opcional, ej: /dashboard/sales)" value={action.href ?? ''} onChange={(e) => updateAction(index, { ...action, href: e.target.value })} />
                        </div>
                      </div>
                    )}

                    {action.type === 'CALL_WEBHOOK' && (
                      <div className="space-y-1.5">
                        <Input placeholder="https://..." value={action.url} onChange={(e) => updateAction(index, { ...action, url: e.target.value })} />
                        <p className="text-xs text-muted-foreground">Debe ser https:// y no puede apuntar a una red interna o privada. La llamada va firmada con el secreto de la regla (header X-Aether-Signature).</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} className="size-4 rounded border-input" />
              Regla activa
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secreto de firma del webhook */}
      <Dialog open={secretForId !== null} onOpenChange={(open) => !open && setSecretForId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Secreto de firma del webhook</DialogTitle>
            <DialogDescription>
              Cada llamada incluye el header <code className="rounded bg-muted px-1">X-Aether-Signature</code> con un HMAC-SHA256 de este secreto sobre el cuerpo — úsalo del otro lado (Zapier, n8n, tu propio servidor) para verificar que la llamada vino de aquí.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={secretValue ?? ''} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              title="Copiar secreto"
              aria-label="Copiar secreto"
              onClick={() => {
                if (secretValue) navigator.clipboard.writeText(secretValue).then(() => toast.success('Copiado'));
              }}
            >
              <Copy />
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSecretForId(null)}>
              Cerrar
            </Button>
            <Button variant="destructive" onClick={regenerateSecret} disabled={regenerating}>
              <RefreshCw className="mr-1.5 size-3.5" /> {regenerating ? 'Regenerando…' : 'Regenerar (invalida el anterior)'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
