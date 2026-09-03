'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Contact } from '@prisma/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { listContactsAction } from '@/modules/contacts/actions/contacts.actions';
import { listCandidatesAction } from '@/modules/candidates/actions/candidates.actions';
import { createPaymentPlanAction } from '@/modules/payment-plans/actions/payment-plans.actions';
import { computeDueDate, distributeInstallmentAmounts } from '@/modules/payment-plans/calc';
import {
  PAYMENT_PLAN_CLIENT_TYPE_LABELS,
  PAYMENT_PLAN_CLIENT_TYPES,
  PAYMENT_PLAN_FREQUENCIES,
  PAYMENT_PLAN_FREQUENCY_LABELS,
  paymentPlanCreateSchema,
} from '@/modules/payment-plans/schema';
import { formatCurrency } from '@/lib/chile/tax';

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

interface CandidateOption {
  id: string;
  fullName: string;
  stageName: string | null;
}

/** Preview client-side de las cuotas, con el mismo cálculo puro que usa el servidor (`@/modules/payment-plans/calc`). */
function previewInstallments(
  totalAmount: number,
  installmentCount: number,
  frequency: (typeof PAYMENT_PLAN_FREQUENCIES)[number],
  startDate: Date
): Array<{ number: number; amount: number; dueDate: Date }> {
  if (totalAmount <= 0 || installmentCount <= 0) return [];

  const amounts = distributeInstallmentAmounts(totalAmount, installmentCount);
  return amounts.map((amount, index) => ({ number: index + 1, amount, dueDate: computeDueDate(startDate, frequency, index) }));
}

export default function PaymentPlanForm() {
  const router = useRouter();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);

  const [clientType, setClientType] = useState<(typeof PAYMENT_PLAN_CLIENT_TYPES)[number]>('CANDIDATE');

  const [contactId, setContactId] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactQuery, setContactQuery] = useState('');

  const [candidateId, setCandidateId] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateOption | null>(null);
  const [candidateQuery, setCandidateQuery] = useState('');

  const [totalAmount, setTotalAmount] = useState(0);
  const [installmentCount, setInstallmentCount] = useState(6);
  const [frequency, setFrequency] = useState<(typeof PAYMENT_PLAN_FREQUENCIES)[number]>('MONTHLY');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [penaltyBps, setPenaltyBps] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listContactsAction().then((r) => {
      if (r.success) setContacts(r.data);
      else toast.error(r.error);
    });
    // Sin permiso `candidates:read` (ej. rol Contador sin ese módulo) esta
    // llamada falla en silencio: el buscador de candidata queda sin
    // resultados, pero el tipo de cliente "Sponsor" sigue funcionando.
    listCandidatesAction({ pageSize: 200 }).then((r) => {
      if (r.success) setCandidates(r.data.items.map((c) => ({ id: c.id, fullName: c.fullName, stageName: c.stageName })));
    });
  }, []);

  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return [];
    return contacts.filter((c) => c.rut.toLowerCase().includes(q) || c.razonSocial.toLowerCase().includes(q)).slice(0, 8);
  }, [contactQuery, contacts]);

  const filteredCandidates = useMemo(() => {
    const q = candidateQuery.trim().toLowerCase();
    if (!q) return [];
    return candidates
      .filter((c) => c.fullName.toLowerCase().includes(q) || (c.stageName ?? '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [candidateQuery, candidates]);

  const preview = useMemo(
    () => previewInstallments(totalAmount, installmentCount, frequency, new Date(`${startDate}T00:00:00`)),
    [totalAmount, installmentCount, frequency, startDate]
  );

  function buildPayload() {
    return {
      clientType,
      contactId: clientType === 'SPONSOR' ? (selectedContact?.id ?? contactId) : undefined,
      candidateId: clientType === 'CANDIDATE' ? (selectedCandidate?.id ?? candidateId) : undefined,
      totalAmount,
      installmentCount,
      frequency,
      startDate: new Date(`${startDate}T00:00:00`),
      penaltyBps,
      notes: notes || undefined,
    };
  }

  async function handleSave() {
    const payload = buildPayload();
    const parsed = paymentPlanCreateSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }

    setSaving(true);
    try {
      const result = await createPaymentPlanAction(parsed.data);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Plan de pago creado');
      router.push(`/dashboard/payment-plans/${result.data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Tipo de cliente</Label>
          <div className="mt-1 flex gap-4">
            {PAYMENT_PLAN_CLIENT_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-1.5 text-sm text-foreground">
                <input
                  type="radio"
                  checked={clientType === type}
                  onChange={() => {
                    setClientType(type);
                    setSelectedContact(null);
                    setContactId('');
                    setContactQuery('');
                    setSelectedCandidate(null);
                    setCandidateId('');
                    setCandidateQuery('');
                  }}
                />
                {PAYMENT_PLAN_CLIENT_TYPE_LABELS[type]}
              </label>
            ))}
          </div>
        </div>

        {clientType === 'SPONSOR' ? (
          <div className="sm:col-span-2">
            <Label>Sponsor</Label>
            {selectedContact ? (
              <div className="flex items-center justify-between rounded-lg border border-input px-2.5 py-1.5 text-sm">
                <span>{selectedContact.rut} — {selectedContact.razonSocial}</span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setSelectedContact(null);
                    setContactId('');
                  }}
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                <Input
                  placeholder="Buscar sponsor por RUT o Razón Social"
                  value={contactQuery}
                  onChange={(e) => setContactQuery(e.target.value)}
                />
                {filteredContacts.length > 0 && (
                  <ul className="rounded-lg border border-border text-sm">
                    {filteredContacts.map((c) => (
                      <li
                        key={c.id}
                        className="cursor-pointer px-2.5 py-1.5 hover:bg-muted"
                        onClick={() => {
                          setSelectedContact(c);
                          setContactId(c.id);
                          setContactQuery('');
                        }}
                      >
                        {c.rut} — {c.razonSocial}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="sm:col-span-2">
            <Label>Candidata</Label>
            {selectedCandidate ? (
              <div className="flex items-center justify-between rounded-lg border border-input px-2.5 py-1.5 text-sm">
                <span>{selectedCandidate.stageName || selectedCandidate.fullName}</span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setSelectedCandidate(null);
                    setCandidateId('');
                  }}
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                <Input
                  placeholder="Buscar candidata por nombre"
                  value={candidateQuery}
                  onChange={(e) => setCandidateQuery(e.target.value)}
                />
                {filteredCandidates.length > 0 && (
                  <ul className="rounded-lg border border-border text-sm">
                    {filteredCandidates.map((c) => (
                      <li
                        key={c.id}
                        className="cursor-pointer px-2.5 py-1.5 hover:bg-muted"
                        onClick={() => {
                          setSelectedCandidate(c);
                          setCandidateId(c.id);
                          setCandidateQuery('');
                        }}
                      >
                        {c.stageName || c.fullName}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <Label htmlFor="totalAmount">Monto total</Label>
          <CurrencyInput id="totalAmount" value={totalAmount} onChange={setTotalAmount} />
        </div>

        <div>
          <Label htmlFor="installmentCount">Número de cuotas</Label>
          <Input
            id="installmentCount"
            type="number"
            min={1}
            max={60}
            value={installmentCount}
            onChange={(e) => setInstallmentCount(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
          />
        </div>

        <div>
          <Label htmlFor="frequency">Frecuencia</Label>
          <select
            id="frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as (typeof PAYMENT_PLAN_FREQUENCIES)[number])}
            className={selectClass}
          >
            {PAYMENT_PLAN_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {PAYMENT_PLAN_FREQUENCY_LABELS[f]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="startDate">Fecha de la primera cuota</Label>
          <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="penaltyBps">Multa por atraso (bps sobre la cuota)</Label>
          <Input
            id="penaltyBps"
            type="number"
            min={0}
            max={10000}
            value={penaltyBps}
            onChange={(e) => setPenaltyBps(Math.max(0, Math.min(10000, Number(e.target.value) || 0)))}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Ej: 500 = 5% de multa sobre el monto de la cuota vencida. Deje en 0 para no aplicar multa.
          </p>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {preview.length > 0 && (
        <div className="rounded-xl border border-border p-4">
          <h3 className="mb-2 text-sm font-semibold">Vista previa de cuotas</h3>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2">N°</th>
                  <th className="py-1 pr-2">Vencimiento</th>
                  <th className="py-1 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.number} className="border-t border-border">
                    <td className="py-1 pr-2">{row.number}</td>
                    <td className="py-1 pr-2">{row.dueDate.toLocaleDateString('es-CL')}</td>
                    <td className="py-1 text-right">{formatCurrency(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-right text-sm font-medium">Total: {formatCurrency(totalAmount)}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" disabled={saving} onClick={handleSave}>
          {saving ? 'Guardando...' : 'Crear plan de pago'}
        </Button>
      </div>
    </div>
  );
}
