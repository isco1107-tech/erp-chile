'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Contact, Project } from '@prisma/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { listContactsAction } from '@/modules/contacts/actions/contacts.actions';
import {
  createFeeDocumentAction,
  getHonorariumRetentionRateAction,
  listProjectsForFeesAction,
} from '@/modules/fees/actions/fees.actions';
import { feeDocumentCreateSchema } from '@/modules/fees/schema';
import { calculateFeeAmounts } from '@/lib/services/fees';
import { formatCurrency } from '@/lib/chile/tax';

const FALLBACK_RETENTION_RATE_BPS = 1525;

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

export default function FeeDocumentForm() {
  const router = useRouter();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [retentionRateBps, setRetentionRateBps] = useState(FALLBACK_RETENTION_RATE_BPS);

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactQuery, setContactQuery] = useState('');
  const [projectId, setProjectId] = useState('');
  const [folioNumber, setFolioNumber] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [serviceDescription, setServiceDescription] = useState('');
  const [grossAmount, setGrossAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listContactsAction().then((r) => {
      if (r.success) setContacts(r.data);
    });
    listProjectsForFeesAction().then((r) => {
      if (r.success) setProjects(r.data);
    });
    // Tasa vigente de la empresa: si el usuario no tiene `settings:company`
    // igual necesita este dato solo para la vista previa, por eso es una
    // acción propia gateada con `fees:read` en vez de `getCompanySettingsAction`.
    getHonorariumRetentionRateAction().then((r) => {
      if (r.success) setRetentionRateBps(r.data);
    });
  }, []);

  // Solo prestadores marcados como proveedor: una BHE la emite un freelance
  // contratado por la empresa, no uno de sus clientes.
  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return [];
    return contacts
      .filter((c) => c.isSupplier && (c.rut.toLowerCase().includes(q) || c.razonSocial.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [contactQuery, contacts]);

  const preview = calculateFeeAmounts(grossAmount, retentionRateBps);

  function buildPayload() {
    return {
      contactId: selectedContact?.id ?? '',
      projectId: projectId || undefined,
      folioNumber,
      issueDate,
      serviceDescription,
      grossAmount,
    };
  }

  async function handleSave() {
    const payload = buildPayload();
    const parsed = feeDocumentCreateSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }

    setSaving(true);
    try {
      const result = await createFeeDocumentAction(parsed.data);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Boleta de honorarios registrada');
      router.push(`/dashboard/fees/${result.data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Prestador de servicios</Label>
          {selectedContact ? (
            <div className="flex items-center justify-between rounded-lg border border-input px-2.5 py-1.5 text-sm">
              <span>{selectedContact.rut} — {selectedContact.razonSocial}</span>
              <Button type="button" size="xs" variant="ghost" onClick={() => setSelectedContact(null)}>Cambiar</Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Input
                placeholder="Buscar prestador por RUT o Razón Social"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
              />
              {filteredContacts.length > 0 && (
                <ul className="rounded-lg border border-border text-sm">
                  {filteredContacts.map((c) => (
                    <li
                      key={c.id}
                      className="cursor-pointer px-2.5 py-1.5 hover:bg-muted"
                      onClick={() => { setSelectedContact(c); setContactQuery(''); }}
                    >
                      {c.rut} — {c.razonSocial}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Solo se listan contactos marcados como proveedor.
              </p>
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="folioNumber">Folio de la BHE</Label>
          <Input
            id="folioNumber"
            value={folioNumber}
            onChange={(e) => setFolioNumber(e.target.value)}
            placeholder="N° de boleta emitida por el prestador ante el SII"
          />
        </div>

        <div>
          <Label htmlFor="issueDate">Fecha de Emisión</Label>
          <Input id="issueDate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </div>

        {projects.length > 0 && (
          <div>
            <Label htmlFor="project">Proyecto (opcional)</Label>
            <select id="project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={selectClass}>
              <option value="">Sin proyecto asociado</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <Label htmlFor="grossAmount">Monto Bruto</Label>
          <CurrencyInput id="grossAmount" value={grossAmount} onChange={setGrossAmount} />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="serviceDescription">Descripción del servicio</Label>
          <Input
            id="serviceDescription"
            value={serviceDescription}
            onChange={(e) => setServiceDescription(e.target.value)}
            placeholder="Ej: Maquillaje profesional para sesión fotográfica"
          />
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 rounded-xl border border-border p-4 text-sm sm:ml-auto sm:w-80">
        <div className="flex w-full justify-between"><span>Monto Bruto</span><span>{formatCurrency(grossAmount)}</span></div>
        <div className="flex w-full justify-between">
          <span>Retención 2ª Categoría ({(retentionRateBps / 100).toFixed(2)}%)</span>
          <span>-{formatCurrency(preview.retentionAmount)}</span>
        </div>
        <div className="flex w-full justify-between border-t border-border pt-1 text-base font-semibold">
          <span>Líquido a Pagar</span><span>{formatCurrency(preview.netToPay)}</span>
        </div>
        <p className="mt-1 text-right text-xs text-muted-foreground">
          La tasa final se recalcula en el servidor al guardar; esta es una vista previa.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" disabled={saving} onClick={handleSave}>
          {saving ? 'Registrando...' : 'Registrar Boleta'}
        </Button>
      </div>
    </div>
  );
}
