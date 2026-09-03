'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { Contact } from '@prisma/client';
import { toast } from 'sonner';
import type { ContactListItem } from '@/modules/contacts/services/contacts.service';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RutInput } from '@/components/ui/RutInput';
import { regions } from '@/lib/chile/locations';
import { contactCreateSchema, contactUpdateSchema } from '@/modules/contacts/schema';
import { createContactAction, lookupCompanyInfoAction, updateContactAction } from '@/modules/contacts/actions/contacts.actions';
import type { CompanyLookupCandidate } from '@/modules/contacts/services/company-lookup.service';

const EMPTY_FORM = {
  rut: '',
  razonSocial: '',
  nombreFantasia: '',
  giro: '',
  email: '',
  phone: '',
  address: '',
  region: '',
  comuna: '',
  isCustomer: true,
  isSupplier: false,
  creditLimit: 0,
  creditDays: 0,
};

type FormState = typeof EMPTY_FORM;

interface ContactFormProps {
  editingContact: ContactListItem | null;
  onSaved: (contact: Contact) => void;
  onCancelEdit: () => void;
}

export default function ContactForm({ editingContact, onSaved, onCancelEdit }: ContactFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // $0 de límite es un valor de negocio real ("este cliente no tiene crédito
  // autorizado, todo al contado"), así que "sin límite" necesita su propio
  // interruptor en vez de superponerse a 0.
  const [noCreditLimit, setNoCreditLimit] = useState(true);

  const [companyQuery, setCompanyQuery] = useState('');
  const [searchingCompany, setSearchingCompany] = useState(false);
  const [companyCandidates, setCompanyCandidates] = useState<CompanyLookupCandidate[] | null>(null);

  async function handleCompanySearch() {
    if (!companyQuery.trim()) return;
    setSearchingCompany(true);
    setCompanyCandidates(null);
    try {
      const result = await lookupCompanyInfoAction(companyQuery);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data.length === 0) toast.info('No se encontraron resultados — completa los datos manualmente');
      setCompanyCandidates(result.data);
    } finally {
      setSearchingCompany(false);
    }
  }

  function applyCompanyCandidate(candidate: CompanyLookupCandidate) {
    setForm((prev) => ({
      ...prev,
      razonSocial: candidate.razonSocial || prev.razonSocial,
      nombreFantasia: candidate.nombreFantasia || prev.nombreFantasia,
      giro: candidate.giro || prev.giro,
      rut: candidate.rut || prev.rut,
      address: candidate.address || prev.address,
      region: candidate.region || prev.region,
      comuna: candidate.comuna || prev.comuna,
    }));
    setCompanyCandidates(null);
    setCompanyQuery('');
    toast.success(
      candidate.rutVerified
        ? 'Datos precargados — revisa antes de guardar'
        : 'Datos precargados, pero no se confirmó el RUT — complétalo o verifícalo manualmente'
    );
  }

  useEffect(() => {
    if (editingContact) {
      setForm({
        rut: editingContact.rut,
        razonSocial: editingContact.razonSocial,
        nombreFantasia: editingContact.nombreFantasia ?? '',
        giro: editingContact.giro ?? '',
        email: editingContact.email ?? '',
        phone: editingContact.phone ?? '',
        address: editingContact.address ?? '',
        region: editingContact.region ?? '',
        comuna: editingContact.comuna ?? '',
        isCustomer: editingContact.isCustomer,
        isSupplier: editingContact.isSupplier,
        creditLimit: editingContact.creditLimit ?? 0,
        creditDays: editingContact.creditDays,
      });
      setNoCreditLimit(editingContact.creditLimit == null);
      setErrors({});
    } else {
      setForm(EMPTY_FORM);
      setNoCreditLimit(true);
    }
  }, [editingContact]);

  const comunaOptions = regions.find((r) => r.name === form.region)?.comunas ?? [];

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleRegionChange(value: string) {
    setForm((prev) => ({ ...prev, region: value, comuna: '' }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});

    const payload = { ...form, email: form.email || undefined, creditLimit: noCreditLimit ? null : form.creditLimit };
    const schema = editingContact ? contactUpdateSchema : contactCreateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      const result = editingContact
        ? await updateContactAction(editingContact.id, parsed.data)
        : await createContactAction(parsed.data);

      if (!result.success) {
        toast.error(result.error);
        setErrors({ form: result.error });
        return;
      }

      toast.success(result.message ?? 'Contacto guardado');
      setForm(EMPTY_FORM);
      onSaved(result.data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border p-4">
      {!editingContact && (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
          <Label htmlFor="companyQuery">Buscar empresa con IA</Label>
          <div className="flex gap-2">
            <Input
              id="companyQuery"
              value={companyQuery}
              onChange={(e) => setCompanyQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCompanySearch();
                }
              }}
              placeholder="Ej: Coca-Cola, Arauco, Falabella..."
            />
            <Button type="button" variant="outline" disabled={searchingCompany} onClick={handleCompanySearch}>
              {searchingCompany ? 'Buscando...' : 'Buscar'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Busca en internet razón social, RUT, giro y dirección para precargar el formulario. Siempre revisa los datos antes de guardar.
          </p>
          {companyCandidates && companyCandidates.length > 0 && (
            <ul className="space-y-1.5">
              {companyCandidates.map((c, i) => (
                <li key={i} className="rounded-lg border border-border p-2.5 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{c.razonSocial}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.rut ? c.rut : 'RUT no confirmado'}
                        {c.giro && ` — ${c.giro}`}
                      </p>
                      {c.address && <p className="text-xs text-muted-foreground">{c.address}</p>}
                      {!c.rutVerified && (
                        <p className="text-xs text-amber-600 dark:text-amber-500">RUT sin confirmar — verifícalo antes de guardar</p>
                      )}
                    </div>
                    <Button type="button" size="xs" onClick={() => applyCompanyCandidate(c)}>
                      Usar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="rut">RUT</Label>
          <RutInput id="rut" value={form.rut} onChange={(value) => update('rut', value)} invalid={!!errors.rut} />
          {errors.rut && <p className="mt-1 text-sm text-destructive">{errors.rut}</p>}
        </div>

        <div>
          <Label htmlFor="razonSocial">Razón Social</Label>
          <Input
            id="razonSocial"
            value={form.razonSocial}
            onChange={(e) => update('razonSocial', e.target.value)}
            aria-invalid={!!errors.razonSocial}
          />
          {errors.razonSocial && <p className="mt-1 text-sm text-destructive">{errors.razonSocial}</p>}
        </div>

        <div>
          <Label htmlFor="nombreFantasia">Nombre de Fantasía</Label>
          <Input id="nombreFantasia" value={form.nombreFantasia} onChange={(e) => update('nombreFantasia', e.target.value)} />
        </div>

        <div>
          <Label htmlFor="giro">Giro</Label>
          <Input id="giro" value={form.giro} onChange={(e) => update('giro', e.target.value)} />
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} aria-invalid={!!errors.email} />
          {errors.email && <p className="mt-1 text-sm text-destructive">{errors.email}</p>}
        </div>

        <div>
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
        </div>

        <div>
          <Label htmlFor="region">Región</Label>
          <select
            id="region"
            value={form.region}
            onChange={(e) => handleRegionChange(e.target.value)}
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          >
            <option value="">Seleccione región</option>
            {regions.map((r) => (
              <option key={r.code} value={r.name}>{r.name}</option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="comuna">Comuna</Label>
          <select
            id="comuna"
            value={form.comuna}
            onChange={(e) => update('comuna', e.target.value)}
            disabled={!form.region}
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
          >
            <option value="">{form.region ? 'Seleccione comuna' : 'Seleccione una región primero'}</option>
            {comunaOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="address">Dirección</Label>
          <Input id="address" value={form.address} onChange={(e) => update('address', e.target.value)} />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isCustomer} onChange={(e) => update('isCustomer', e.target.checked)} />
          Cliente
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isSupplier} onChange={(e) => update('isSupplier', e.target.checked)} />
          Proveedor
        </label>
      </div>

      {form.isCustomer && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-dashed border-border p-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="creditLimit">Límite de crédito</Label>
            <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={noCreditLimit} onChange={(e) => setNoCreditLimit(e.target.checked)} />
              Sin límite (no se bloquean ventas a crédito)
            </label>
            {!noCreditLimit && (
              <CurrencyInput id="creditLimit" className="mt-1.5" value={form.creditLimit} onChange={(v) => update('creditLimit', v)} />
            )}
          </div>
          <div>
            <Label htmlFor="creditDays">Días de crédito</Label>
            <Input
              id="creditDays"
              type="number"
              min={0}
              value={form.creditDays}
              onChange={(e) => update('creditDays', Number(e.target.value) || 0)}
            />
            <p className="mt-1 text-xs text-muted-foreground">0 = contado</p>
          </div>
        </div>
      )}

      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : editingContact ? 'Guardar cambios' : 'Crear contacto'}
        </Button>
        {editingContact && (
          <Button type="button" variant="outline" onClick={onCancelEdit}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
