'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { ContactSearchSelect, type ContactOption } from '@/components/shared/ContactSearchSelect';
import { formatCurrency } from '@/lib/chile/tax';
import { createOpportunityAction, updateOpportunityAction, type CrmLookups } from '@/modules/crm/actions/crm.actions';
import {
  DEAL_TYPE_HINTS,
  DEAL_TYPE_LABELS,
  DEAL_TYPES,
  OPEN_STAGES,
  OPPORTUNITY_SOURCES,
  PRIORITIES,
  PRIORITY_LABELS,
  STAGE_DEFAULT_PROBABILITY,
  STAGE_LABELS,
  type DealTypeKey,
  type OpportunityStageKey,
  type PriorityKey,
} from '@/modules/crm/schema';
import { SPONSORSHIP_TIER_LABELS, SPONSORSHIP_TIERS } from '@/modules/sponsorships/schema';
import type { OpportunityDetail, PersonOption } from '@/modules/crm/services/crm.service';
import { cn } from '@/lib/utils';
import { PersonSearchSelect } from './PersonSearchSelect';
import { TagInput } from './TagInput';
import { fromDateInput, toDateInput } from './crm-ui';

type TierKey = (typeof SPONSORSHIP_TIERS)[number];

export interface OpportunityFormValues {
  id?: string;
  title: string;
  dealType: DealTypeKey;
  priority: PriorityKey;
  contact: ContactOption | null;
  prospectName: string;
  prospectEmail: string;
  prospectPhone: string;
  person: PersonOption | null;
  projectId: string;
  packageId: string;
  sponsorshipTier: TierKey | '';
  isBarter: boolean;
  barterValuation: number;
  barterDescription: string;
  amount: number;
  probability: number;
  stage: OpportunityStageKey;
  source: string;
  expectedCloseDate: string;
  ownerUserId: string;
  notes: string;
  tags: string[];
}

export const EMPTY_OPPORTUNITY: OpportunityFormValues = {
  title: '',
  dealType: 'SPONSORSHIP',
  priority: 'MEDIUM',
  contact: null,
  prospectName: '',
  prospectEmail: '',
  prospectPhone: '',
  person: null,
  projectId: '',
  packageId: '',
  sponsorshipTier: '',
  isBarter: false,
  barterValuation: 0,
  barterDescription: '',
  amount: 0,
  probability: STAGE_DEFAULT_PROBABILITY.LEAD,
  stage: 'LEAD',
  source: '',
  expectedCloseDate: '',
  ownerUserId: '',
  notes: '',
  tags: [],
};

export function detailToForm(detail: OpportunityDetail): OpportunityFormValues {
  return {
    id: detail.id,
    title: detail.title,
    dealType: detail.dealType,
    priority: detail.priority,
    contact: detail.contact ? { id: detail.contact.id, razonSocial: detail.contact.razonSocial, rut: detail.contact.rut } : null,
    prospectName: detail.prospectName ?? '',
    prospectEmail: detail.prospectEmail ?? '',
    prospectPhone: detail.prospectPhone ?? '',
    person: detail.person
      ? { id: detail.person.id, fullName: detail.person.fullName, jobTitle: detail.person.jobTitle, organization: detail.contact?.razonSocial ?? detail.person.organizationName }
      : null,
    projectId: detail.projectId ?? '',
    packageId: detail.packageId ?? '',
    sponsorshipTier: detail.sponsorshipTier ?? '',
    isBarter: detail.isBarter,
    barterValuation: detail.barterValuation,
    barterDescription: detail.barterDescription ?? '',
    amount: detail.amount,
    probability: detail.probability,
    stage: detail.stage,
    source: detail.source ?? '',
    expectedCloseDate: toDateInput(detail.expectedCloseDate),
    ownerUserId: detail.ownerUserId ?? '',
    notes: detail.notes ?? '',
    tags: detail.tags,
  };
}

/**
 * El estado del formulario nace de `initial` al montar: el padre le cambia la
 * `key` en cada apertura para partir limpio, en vez de sincronizar con un
 * efecto que pisaría lo que el usuario está escribiendo.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: OpportunityFormValues;
  lookups: CrmLookups;
  onSaved: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

export function OpportunityFormDialog({ open, onOpenChange, initial, lookups, onSaved }: Props) {
  const [values, setValues] = useState<OpportunityFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const editing = Boolean(initial.id);
  const isSponsorship = values.dealType === 'SPONSORSHIP';

  const set = <K extends keyof OpportunityFormValues>(key: K, value: OpportunityFormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));

  const projectPackages = useMemo(
    () => lookups.packages.filter((pkg) => pkg.projectId === values.projectId),
    [lookups.packages, values.projectId]
  );
  const selectedPackage = lookups.packages.find((pkg) => pkg.id === values.packageId) ?? null;

  function choosePackage(packageId: string) {
    const pkg = lookups.packages.find((p) => p.id === packageId);
    setValues((prev) => ({
      ...prev,
      packageId,
      sponsorshipTier: pkg ? pkg.tier : prev.sponsorshipTier,
      // El precio de lista entra solo si todavía no se escribió un monto:
      // nunca pisa una cifra negociada.
      amount: pkg && prev.amount === 0 ? pkg.price : prev.amount,
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const common = {
        title: values.title,
        dealType: values.dealType,
        priority: values.priority,
        prospectEmail: values.contact ? '' : values.prospectEmail,
        prospectPhone: values.contact ? '' : values.prospectPhone,
        amount: values.amount,
        probability: values.probability,
        source: values.source,
        notes: values.notes,
        isBarter: values.isBarter,
        barterValuation: values.isBarter ? values.barterValuation : 0,
        barterDescription: values.isBarter ? values.barterDescription : '',
        tags: values.tags,
      };
      const sponsorship = {
        projectId: values.projectId,
        packageId: isSponsorship ? values.packageId : '',
      };
      const result = editing
        ? await updateOpportunityAction(initial.id as string, {
            ...common,
            ...sponsorship,
            contactId: values.contact?.id ?? null,
            prospectName: values.contact ? null : values.prospectName,
            personId: values.person?.id ?? null,
            ownerUserId: values.ownerUserId || null,
            sponsorshipTier: isSponsorship && values.sponsorshipTier ? values.sponsorshipTier : null,
            expectedCloseDate: fromDateInput(values.expectedCloseDate),
          })
        : await createOpportunityAction({
            ...common,
            ...sponsorship,
            contactId: values.contact?.id ?? '',
            prospectName: values.contact ? '' : values.prospectName,
            personId: values.person?.id ?? '',
            ownerUserId: values.ownerUserId,
            sponsorshipTier: isSponsorship ? values.sponsorshipTier : '',
            expectedCloseDate: fromDateInput(values.expectedCloseDate) ?? undefined,
            stage: values.stage,
          });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Guardado');
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar oportunidad' : 'Nueva oportunidad'}</DialogTitle>
          <DialogDescription>Un negocio posible con una marca, empresa o persona. Los montos son netos, sin IVA.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Section title="El negocio">
            <div>
              <Label htmlFor="opp-title">Nombre de la oportunidad</Label>
              <Input
                id="opp-title"
                value={values.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder={isSponsorship ? 'Ej.: Auspicio Gold — Miss Universe Chile 2026' : 'Ej.: Gala aniversario Banco Sur'}
                required
              />
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium">Tipo de negocio</span>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Tipo de negocio">
                {DEAL_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={values.dealType === type}
                    title={DEAL_TYPE_HINTS[type]}
                    onClick={() => set('dealType', type)}
                    className={cn(
                      'rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors',
                      values.dealType === type ? 'border-primary bg-accent font-medium text-accent-foreground' : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                    )}
                  >
                    {DEAL_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{DEAL_TYPE_HINTS[values.dealType]}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="opp-project">Certamen / evento</Label>
                <select
                  id="opp-project"
                  className={nativeSelectClass}
                  value={values.projectId}
                  onChange={(e) => setValues((prev) => ({ ...prev, projectId: e.target.value, packageId: '' }))}
                >
                  <option value="">Sin certamen</option>
                  {lookups.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} ({project.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="opp-priority">Prioridad</Label>
                <select id="opp-priority" className={nativeSelectClass} value={values.priority} onChange={(e) => set('priority', e.target.value as PriorityKey)}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Section>

          <Section title="Con quién">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="opp-contact">Marca / cliente con ficha</Label>
                <ContactSearchSelect id="opp-contact" value={values.contact} onChange={(contact) => set('contact', contact)} />
              </div>
              {!values.contact && (
                <div>
                  <Label htmlFor="opp-prospect">O nombre del prospecto</Label>
                  <Input id="opp-prospect" value={values.prospectName} onChange={(e) => set('prospectName', e.target.value)} placeholder="Marca, empresa o persona" />
                </div>
              )}
            </div>
            {!values.contact && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="opp-email">Correo del prospecto</Label>
                  <Input id="opp-email" type="email" value={values.prospectEmail} onChange={(e) => set('prospectEmail', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="opp-phone">Teléfono del prospecto</Label>
                  <Input id="opp-phone" value={values.prospectPhone} onChange={(e) => set('prospectPhone', e.target.value)} placeholder="+56 9 …" />
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="opp-person">Persona de contacto</Label>
              <PersonSearchSelect
                id="opp-person"
                value={values.person}
                onChange={(person) => set('person', person)}
                organization={values.contact ? { contactId: values.contact.id } : { name: values.prospectName || undefined }}
              />
            </div>
          </Section>

          {isSponsorship && (
            <Section title="Auspicio">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="opp-package">Plan del tarifario</Label>
                  <select
                    id="opp-package"
                    className={nativeSelectClass}
                    value={values.packageId}
                    disabled={!values.projectId}
                    onChange={(e) => choosePackage(e.target.value)}
                  >
                    <option value="">{values.projectId ? (projectPackages.length ? 'Sin plan (a medida)' : 'Este certamen no tiene planes') : 'Elige primero el certamen'}</option>
                    {projectPackages.map((pkg) => {
                      const soldOut = pkg.maxSlots !== null && pkg.soldSlots >= pkg.maxSlots;
                      return (
                        <option key={pkg.id} value={pkg.id} disabled={soldOut && pkg.id !== values.packageId}>
                          {pkg.name} · {formatCurrency(pkg.price)}
                          {pkg.maxSlots !== null ? ` · ${pkg.soldSlots}/${pkg.maxSlots} cupos` : ''}
                          {soldOut ? ' (agotado)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <Label htmlFor="opp-tier">Nivel propuesto</Label>
                  <select id="opp-tier" className={nativeSelectClass} value={values.sponsorshipTier} onChange={(e) => set('sponsorshipTier', e.target.value as TierKey | '')}>
                    <option value="">Por definir</option>
                    {SPONSORSHIP_TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {SPONSORSHIP_TIER_LABELS[tier]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {selectedPackage && (
                <p className="text-xs text-muted-foreground">
                  Precio de lista del plan: <span className="font-medium text-foreground">{formatCurrency(selectedPackage.price)}</span>
                  {selectedPackage.maxSlots !== null && ` · ${selectedPackage.maxSlots - selectedPackage.soldSlots} cupo(s) disponible(s)`}
                </p>
              )}
            </Section>
          )}

          <Section title="Monto y cierre">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="opp-amount">Monto en efectivo (neto)</Label>
                <CurrencyInput id="opp-amount" value={values.amount} onChange={(amount) => set('amount', amount)} />
              </div>
              {!editing && (
                <div>
                  <Label htmlFor="opp-stage">Etapa</Label>
                  <select
                    id="opp-stage"
                    className={nativeSelectClass}
                    value={values.stage}
                    onChange={(e) => {
                      const stage = e.target.value as OpportunityStageKey;
                      setValues((prev) => ({ ...prev, stage, probability: STAGE_DEFAULT_PROBABILITY[stage] }));
                    }}
                  >
                    {OPEN_STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {STAGE_LABELS[stage]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <Label htmlFor="opp-probability">Probabilidad de cierre</Label>
                <div className="flex h-8 items-center gap-2">
                  <input
                    id="opp-probability"
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={values.probability}
                    onChange={(e) => set('probability', Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <span className="w-10 text-right text-sm font-semibold tabular-nums">{values.probability}%</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
              <div>
                <p className="text-sm font-medium">Incluye canje</p>
                <p className="text-xs text-muted-foreground">Productos o servicios que la marca aporta en vez de efectivo (vestuario, maquillaje, hotel, traslados…).</p>
              </div>
              <Switch checked={values.isBarter} onCheckedChange={(checked) => set('isBarter', checked)} label="Incluye canje" />
            </div>
            {values.isBarter && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr]">
                <div>
                  <Label htmlFor="opp-barter-value">Valor del canje</Label>
                  <CurrencyInput id="opp-barter-value" value={values.barterValuation} onChange={(v) => set('barterValuation', v)} />
                </div>
                <div>
                  <Label htmlFor="opp-barter-desc">Qué aporta en canje</Label>
                  <Input id="opp-barter-desc" value={values.barterDescription} onChange={(e) => set('barterDescription', e.target.value)} placeholder="Ej.: 20 noches de hotel + traslados de candidatas" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="opp-close">Cierre esperado</Label>
                <Input id="opp-close" type="date" value={values.expectedCloseDate} onChange={(e) => set('expectedCloseDate', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="opp-source">Origen</Label>
                <select id="opp-source" className={nativeSelectClass} value={values.source} onChange={(e) => set('source', e.target.value)}>
                  <option value="">Sin especificar</option>
                  {OPPORTUNITY_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                  {values.source && !(OPPORTUNITY_SOURCES as readonly string[]).includes(values.source) && <option value={values.source}>{values.source}</option>}
                </select>
              </div>
              <div>
                <Label htmlFor="opp-owner">Responsable</Label>
                <select id="opp-owner" className={nativeSelectClass} value={values.ownerUserId} onChange={(e) => set('ownerUserId', e.target.value)}>
                  <option value="">{editing ? 'Sin responsable' : 'Yo'}</option>
                  {lookups.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Section>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label htmlFor="opp-tags">Etiquetas</Label>
              <TagInput id="opp-tags" value={values.tags} onChange={(tags) => set('tags', tags)} suggestions={lookups.tags} placeholder="Ej.: Renovación, Marca nueva, Canje" />
            </div>
            <div>
              <Label htmlFor="opp-notes">Notas</Label>
              <textarea id="opp-notes" className={textareaClass} value={values.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Contexto, objetivos de la marca, competencia, condiciones…" />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear oportunidad'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
