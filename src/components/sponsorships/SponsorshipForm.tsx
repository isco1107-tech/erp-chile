'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Contact } from '@prisma/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import ContactForm from '@/components/ContactForm';
import { listContactsAction } from '@/modules/contacts/actions/contacts.actions';
import {
  createSponsorshipContractAction,
  listProjectsForSelectAction,
  updateSponsorshipContractAction,
} from '@/modules/sponsorships/actions/sponsorships.actions';
import type { ProjectSelectOption, SponsorshipContractWithRelations } from '@/modules/sponsorships/services/sponsorships.service';
import {
  SPONSORSHIP_STATUS_LABELS,
  SPONSORSHIP_STATUSES,
  SPONSORSHIP_TIER_LABELS,
  SPONSORSHIP_TIERS,
  sponsorshipContractCreateSchema,
} from '@/modules/sponsorships/schema';

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

interface Props {
  /** Presente solo en /dashboard/sponsorships/[id]/edit: precarga el contrato y guarda edición en vez de crear uno nuevo. */
  editingContract?: SponsorshipContractWithRelations;
}

export default function SponsorshipForm({ editingContract }: Props) {
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectSelectOption[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [projectId, setProjectId] = useState(editingContract?.projectId ?? '');
  const [contactId, setContactId] = useState(editingContract?.contactId ?? '');
  const [selectedBrand, setSelectedBrand] = useState<Contact | null>(editingContract?.contact ?? null);
  const [brandQuery, setBrandQuery] = useState('');
  const [showQuickBrand, setShowQuickBrand] = useState(false);
  const [tier, setTier] = useState<(typeof SPONSORSHIP_TIERS)[number]>(editingContract?.tier ?? 'GOLD');
  const [isBarter, setIsBarter] = useState(editingContract?.isBarter ?? false);
  const [cashAmount, setCashAmount] = useState(editingContract?.cashAmount ?? 0);
  const [barterValuation, setBarterValuation] = useState(editingContract?.barterValuation ?? 0);
  const [barterDescription, setBarterDescription] = useState(editingContract?.barterDescription ?? '');
  const [status, setStatus] = useState<(typeof SPONSORSHIP_STATUSES)[number]>(editingContract?.status ?? 'PROPOSAL');
  const [notes, setNotes] = useState(editingContract?.notes ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listProjectsForSelectAction().then((r) => {
      if (r.success) setProjects(r.data);
      else toast.error(r.error);
    });
    listContactsAction().then((r) => {
      if (r.success) setContacts(r.data);
      else toast.error(r.error);
    });
  }, []);

  const filteredBrands = useMemo(() => {
    const q = brandQuery.trim().toLowerCase();
    if (!q) return [];
    return contacts.filter((c) => c.rut.toLowerCase().includes(q) || c.razonSocial.toLowerCase().includes(q)).slice(0, 8);
  }, [brandQuery, contacts]);

  function buildPayload() {
    return {
      projectId,
      contactId: selectedBrand?.id ?? contactId,
      tier,
      isBarter,
      cashAmount,
      barterValuation: isBarter ? barterValuation : 0,
      barterDescription: isBarter ? barterDescription || undefined : undefined,
      status,
      notes: notes || undefined,
    };
  }

  async function handleSave() {
    const payload = buildPayload();
    const parsed = sponsorshipContractCreateSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }

    if (!isBarter && payload.cashAmount === 0) {
      toast.error('Ingrese un monto en efectivo, o marque "Incluye canje" para un aporte en especies');
      return;
    }

    setSaving(true);
    try {
      const result = editingContract
        ? await updateSponsorshipContractAction(editingContract.id, parsed.data)
        : await createSponsorshipContractAction(parsed.data);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Contrato guardado');
      router.push(`/dashboard/sponsorships/${result.data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="project">Proyecto / Evento</Label>
          <select id="project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={selectClass}>
            <option value="">Seleccione un proyecto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>Marca auspiciadora</Label>
          {selectedBrand ? (
            <div className="flex items-center justify-between rounded-lg border border-input px-2.5 py-1.5 text-sm">
              <span>{selectedBrand.rut} — {selectedBrand.razonSocial}</span>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => {
                  setSelectedBrand(null);
                  setContactId('');
                }}
              >
                Cambiar
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Input
                placeholder="Buscar marca por RUT o Razón Social"
                value={brandQuery}
                onChange={(e) => setBrandQuery(e.target.value)}
              />
              {filteredBrands.length > 0 && (
                <ul className="rounded-lg border border-border text-sm">
                  {filteredBrands.map((c) => (
                    <li
                      key={c.id}
                      className="cursor-pointer px-2.5 py-1.5 hover:bg-muted"
                      onClick={() => {
                        setSelectedBrand(c);
                        setContactId(c.id);
                        setBrandQuery('');
                      }}
                    >
                      {c.rut} — {c.razonSocial}
                    </li>
                  ))}
                </ul>
              )}
              <Button type="button" size="xs" variant="outline" onClick={() => setShowQuickBrand((s) => !s)}>
                {showQuickBrand ? 'Cerrar' : '+ Crear Marca Nueva'}
              </Button>
              {showQuickBrand && (
                <ContactForm
                  editingContact={null}
                  onSaved={(contact) => {
                    setContacts((prev) => [contact, ...prev]);
                    setSelectedBrand(contact);
                    setContactId(contact.id);
                    setShowQuickBrand(false);
                    toast.success('Marca creada y seleccionada');
                  }}
                  onCancelEdit={() => setShowQuickBrand(false)}
                />
              )}
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="tier">Nivel de auspicio</Label>
          <select id="tier" value={tier} onChange={(e) => setTier(e.target.value as (typeof SPONSORSHIP_TIERS)[number])} className={selectClass}>
            {SPONSORSHIP_TIERS.map((t) => (
              <option key={t} value={t}>
                {SPONSORSHIP_TIER_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="status">Estado</Label>
          <select id="status" value={status} onChange={(e) => setStatus(e.target.value as (typeof SPONSORSHIP_STATUSES)[number])} className={selectClass}>
            {SPONSORSHIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SPONSORSHIP_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="cashAmount">Aporte en efectivo</Label>
          <CurrencyInput id="cashAmount" value={cashAmount} onChange={setCashAmount} />
          <p className="mt-1 text-xs text-muted-foreground">Deje en $0 si el auspicio es 100% canje.</p>
        </div>

        <div className="flex items-end pb-1.5">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isBarter} onChange={(e) => setIsBarter(e.target.checked)} />
            Incluye canje / barter
          </label>
        </div>

        {isBarter && (
          <>
            <div>
              <Label htmlFor="barterValuation">Valorización del canje</Label>
              <CurrencyInput id="barterValuation" value={barterValuation} onChange={setBarterValuation} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="barterDescription">Descripción del canje</Label>
              <Input
                id="barterDescription"
                value={barterDescription}
                onChange={(e) => setBarterDescription(e.target.value)}
                placeholder="Ej: 20 noches de hotel, transporte de candidatas, catering del evento"
              />
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" disabled={saving} onClick={handleSave}>
          {saving ? 'Guardando...' : editingContract ? 'Guardar cambios' : 'Crear contrato'}
        </Button>
      </div>
    </div>
  );
}
