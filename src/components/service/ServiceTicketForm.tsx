'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import type { Contact } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { listContactsAction } from '@/modules/contacts/actions/contacts.actions';
import { createServiceTicketAction, updateServiceTicketAction } from '@/modules/service-desk/actions/service-tickets.actions';
import { SERVICE_PRIORITIES, SERVICE_PRIORITY_LABELS } from '@/modules/service-desk/schema';

export interface ServiceTicketFormInitial {
  id: string;
  contactId: string;
  customerName: string;
  equipment: string;
  brand: string;
  model: string;
  serialNumber: string;
  accessories: string;
  reportedIssue: string;
  priority: (typeof SERVICE_PRIORITIES)[number];
  promisedDate: string;
  warranty: boolean;
  technicianId: string;
  notes: string;
}

export default function ServiceTicketForm({ technicians, initial }: { technicians: { id: string; name: string }[]; initial?: ServiceTicketFormInitial }) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactQuery, setContactQuery] = useState('');
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(initial ? { id: initial.contactId, name: initial.customerName } : null);
  const [equipment, setEquipment] = useState(initial?.equipment ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [serialNumber, setSerialNumber] = useState(initial?.serialNumber ?? '');
  const [accessories, setAccessories] = useState(initial?.accessories ?? '');
  const [reportedIssue, setReportedIssue] = useState(initial?.reportedIssue ?? '');
  const [priority, setPriority] = useState<(typeof SERVICE_PRIORITIES)[number]>(initial?.priority ?? 'NORMAL');
  const [promisedDate, setPromisedDate] = useState(initial?.promisedDate ?? '');
  const [warranty, setWarranty] = useState(initial?.warranty ?? false);
  const [technicianId, setTechnicianId] = useState(initial?.technicianId ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listContactsAction().then((result) => {
      if (result.success) setContacts(result.data);
    });
  }, []);

  const matches = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return [];
    return contacts.filter((contact) => contact.razonSocial.toLowerCase().includes(q) || contact.rut.toLowerCase().includes(q) || (contact.phone ?? '').includes(q)).slice(0, 8);
  }, [contactQuery, contacts]);

  async function save() {
    if (!customer) {
      toast.error('Selecciona el cliente');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        contactId: customer.id,
        equipment: equipment.trim(),
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
        serialNumber: serialNumber.trim() || undefined,
        accessories: accessories.trim() || undefined,
        reportedIssue: reportedIssue.trim(),
        priority,
        promisedDate,
        warranty,
        technicianId: technicianId || null,
        notes: notes.trim() || undefined,
      };
      const result = initial ? await updateServiceTicketAction(initial.id, payload) : await createServiceTicketAction(payload);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Guardado');
      if (initial) {
        router.push(`/dashboard/service/${initial.id}`);
      } else {
        const id = (result.data as { id: string }).id;
        // Directo al comprobante: se imprime y se entrega al cliente con su enlace.
        router.push(`/dashboard/service/${id}/recepcion`);
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card" aria-label="Cliente">
        <h2 className="text-sm font-semibold">Cliente</h2>
        {customer ? (
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
            <span className="font-medium">{customer.name}</span>
            <Button type="button" size="xs" variant="ghost" onClick={() => setCustomer(null)}>Cambiar</Button>
          </div>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <Input value={contactQuery} onChange={(e) => setContactQuery(e.target.value)} placeholder="Busca por nombre, RUT o teléfono" aria-label="Buscar cliente" className="pl-8" />
            {matches.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card text-sm shadow-card">
                {matches.map((contact) => (
                  <li key={contact.id}>
                    <button type="button" className="flex w-full justify-between gap-3 px-3 py-2 text-left hover:bg-muted" onClick={() => { setCustomer({ id: contact.id, name: contact.razonSocial }); setContactQuery(''); }}>
                      <span className="truncate">{contact.razonSocial}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{contact.rut}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">¿Cliente nuevo? Créalo primero en Clientes & Proveedores (con su correo, para avisarle cuando esté listo).</p>
          </div>
        )}
      </section>

      <section className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-card sm:grid-cols-2" aria-label="Equipo">
        <h2 className="text-sm font-semibold sm:col-span-2">Equipo</h2>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="st-equipment">Equipo</Label>
          <Input id="st-equipment" value={equipment} maxLength={120} onChange={(e) => setEquipment(e.target.value)} placeholder="Ej: Notebook, consola de audio, cafetera industrial" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-brand">Marca</Label>
          <Input id="st-brand" value={brand} maxLength={60} onChange={(e) => setBrand(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-model">Modelo</Label>
          <Input id="st-model" value={model} maxLength={60} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-serial">N° de serie</Label>
          <Input id="st-serial" value={serialNumber} maxLength={60} onChange={(e) => setSerialNumber(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-accessories">Accesorios que deja</Label>
          <Input id="st-accessories" value={accessories} maxLength={200} onChange={(e) => setAccessories(e.target.value)} placeholder="Ej: cargador y funda" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="st-issue">Falla que reporta el cliente</Label>
          <textarea id="st-issue" className={textareaClass} rows={3} maxLength={1000} value={reportedIssue} onChange={(e) => setReportedIssue(e.target.value)} />
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-card sm:grid-cols-3" aria-label="Atención">
        <h2 className="text-sm font-semibold sm:col-span-3">Atención</h2>
        <div className="space-y-1.5">
          <Label htmlFor="st-priority">Prioridad</Label>
          <select id="st-priority" className={nativeSelectClass} value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
            {SERVICE_PRIORITIES.map((value) => (
              <option key={value} value={value}>{SERVICE_PRIORITY_LABELS[value]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-promised">Fecha comprometida</Label>
          <Input id="st-promised" type="date" value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-tech">Técnico</Label>
          <select id="st-tech" className={nativeSelectClass} value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
            <option value="">Sin asignar</option>
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>{technician.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-sm sm:col-span-3">
          <Switch checked={warranty} onCheckedChange={setWarranty} label="Reparación en garantía" />
          <span>Reparación en garantía <span className="text-muted-foreground">(no requiere aprobación de presupuesto)</span></span>
        </div>
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="st-notes">Notas internas</Label>
          <textarea id="st-notes" className={textareaClass} rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="No las ve el cliente" />
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="button" disabled={saving || !equipment.trim() || !reportedIssue.trim()} onClick={save}>
          {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Recibir equipo e imprimir comprobante'}
        </Button>
      </div>
    </div>
  );
}
