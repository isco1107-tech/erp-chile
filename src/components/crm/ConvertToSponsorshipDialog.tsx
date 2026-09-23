'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RutInput } from '@/components/ui/RutInput';
import { Switch } from '@/components/ui/switch';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { ContactSearchSelect, type ContactOption } from '@/components/shared/ContactSearchSelect';
import { createContactAction } from '@/modules/contacts/actions/contacts.actions';
import { convertToSponsorshipAction } from '@/modules/crm/actions/crm.actions';
import type { OpportunityDetail } from '@/modules/crm/services/crm.service';
import { SPONSORSHIP_TIER_LABELS, SPONSORSHIP_TIERS } from '@/modules/sponsorships/schema';

type TierKey = (typeof SPONSORSHIP_TIERS)[number];

interface Props {
  opportunity: OpportunityDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConverted: (contractId: string) => void;
}

/**
 * Cierra el círculo venta → operación: el negocio de auspicio ganado pasa a
 * ser un contrato en Auspicios & Marcas, con los beneficios del plan como
 * checklist de entregables. El contrato exige una marca con RUT; si el
 * negocio era de un prospecto sin ficha, se elige o se crea aquí mismo.
 */
export function ConvertToSponsorshipDialog({ opportunity, open, onOpenChange, onConverted }: Props) {
  const [contact, setContact] = useState<ContactOption | null>(opportunity.contact ? { id: opportunity.contact.id, razonSocial: opportunity.contact.razonSocial, rut: opportunity.contact.rut } : null);
  const [creatingContact, setCreatingContact] = useState(false);
  const [newRut, setNewRut] = useState('');
  const [newName, setNewName] = useState(opportunity.prospectName ?? '');
  const [tier, setTier] = useState<TierKey | ''>(opportunity.sponsorshipTier ?? opportunity.package?.tier ?? '');
  const [cashAmount, setCashAmount] = useState(opportunity.amount);
  const [isBarter, setIsBarter] = useState(opportunity.isBarter);
  const [barterValuation, setBarterValuation] = useState(opportunity.barterValuation);
  const [barterDescription, setBarterDescription] = useState(opportunity.barterDescription ?? '');
  const [createDeliverables, setCreateDeliverables] = useState(true);
  const [busy, setBusy] = useState(false);
  const benefits = opportunity.package?.benefits ?? [];

  async function createContact() {
    setBusy(true);
    try {
      const result = await createContactAction({
        rut: newRut,
        razonSocial: newName,
        email: opportunity.prospectEmail ?? '',
        phone: opportunity.prospectPhone ?? '',
        isCustomer: true,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setContact({ id: result.data.id, razonSocial: result.data.razonSocial, rut: result.data.rut });
      setCreatingContact(false);
      toast.success('Ficha de la marca creada');
    } finally {
      setBusy(false);
    }
  }

  async function convert() {
    if (!contact) {
      toast.error('Elige o crea la ficha de la marca');
      return;
    }
    if (!tier) {
      toast.error('Elige el nivel del auspicio');
      return;
    }
    setBusy(true);
    try {
      const result = await convertToSponsorshipAction(opportunity.id, {
        contactId: contact.id,
        tier,
        cashAmount,
        isBarter,
        barterValuation: isBarter ? barterValuation : 0,
        barterDescription: isBarter ? barterDescription : '',
        createDeliverables,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Contrato creado');
      onConverted(result.data.contractId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Convertir en contrato de auspicio</DialogTitle>
          <DialogDescription>
            {opportunity.project ? `${opportunity.project.name} · ` : ''}El contrato queda confirmado en Auspicios & Marcas, listo para carta de compromiso, cobranza y entregables.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="conv-contact">Marca (ficha con RUT)</Label>
            {!creatingContact ? (
              <>
                <ContactSearchSelect id="conv-contact" value={contact} onChange={setContact} />
                {!contact && (
                  <button type="button" className="mt-1 text-xs text-primary hover:underline" onClick={() => setCreatingContact(true)}>
                    ¿La marca no tiene ficha? Créala aquí
                  </button>
                )}
              </>
            ) : (
              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_1fr]">
                  <RutInput aria-label="RUT de la marca" value={newRut} onChange={setNewRut} />
                  <Input aria-label="Razón social" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Razón social" />
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={busy || !newRut || newName.trim().length < 2} onClick={() => void createContact()}>
                    Crear ficha
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setCreatingContact(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="conv-tier">Nivel</Label>
              <select id="conv-tier" className={nativeSelectClass} value={tier} onChange={(e) => setTier(e.target.value as TierKey | '')}>
                <option value="">Elige el nivel…</option>
                {SPONSORSHIP_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {SPONSORSHIP_TIER_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="conv-cash">Monto en efectivo (neto)</Label>
              <CurrencyInput id="conv-cash" value={cashAmount} onChange={setCashAmount} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
            <span className="text-sm">Incluye canje</span>
            <Switch checked={isBarter} onCheckedChange={setIsBarter} label="Incluye canje" />
          </div>
          {isBarter && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
              <CurrencyInput aria-label="Valor del canje" value={barterValuation} onChange={setBarterValuation} />
              <Input aria-label="Descripción del canje" value={barterDescription} onChange={(e) => setBarterDescription(e.target.value)} placeholder="Qué aporta en canje" />
            </div>
          )}

          {benefits.length > 0 && (
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Crear entregables desde el plan &quot;{opportunity.package?.name}&quot;</p>
                <Switch checked={createDeliverables} onCheckedChange={setCreateDeliverables} label="Crear entregables desde el plan" />
              </div>
              <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                {benefits.slice(0, 8).map((b) => (
                  <li key={b}>{b}</li>
                ))}
                {benefits.length > 8 && <li>y {benefits.length - 8} más…</li>}
              </ul>
            </div>
          )}

          {!opportunity.project && (
            <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
              Este negocio no tiene certamen asignado. Edítalo y elige el certamen antes de convertirlo.{' '}
              <Link href="/dashboard/projects" className="underline">
                Ver certámenes
              </Link>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={busy || !opportunity.project} onClick={() => void convert()}>
            <FileSignature aria-hidden="true" />
            {busy ? 'Creando…' : 'Crear contrato'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
