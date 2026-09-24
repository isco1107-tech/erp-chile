'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { ContactSearchSelect, type ContactOption } from '@/components/shared/ContactSearchSelect';
import { formatCurrency } from '@/lib/chile/tax';
import { toSantiagoDateInput } from '@/lib/chile/timezone';
import { BILLING_FREQUENCY_LABELS, monthlyRecurringRevenue } from '@/lib/services/recurring-billing';
import { computeDocument } from '@/modules/sales/calc';
import { DTE_TYPE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '@/modules/sales/schema';
import { BILLING_FREQUENCIES, CONTRACT_DTE_TYPES } from '@/modules/contracts/schema';
import { getContractLookupsAction, saveContractAction } from '@/modules/contracts/actions/contracts.actions';
import type { ContractLookups } from '@/modules/contracts/services/contracts.service';

interface LineState {
  key: number;
  productId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  isExempt: boolean;
}

export interface ContractFormValues {
  contact: ContactOption | null;
  projectId: string;
  name: string;
  dteType: (typeof CONTRACT_DTE_TYPES)[number];
  paymentMethod: (typeof PAYMENT_METHODS)[number];
  paymentTermDays: number;
  frequency: (typeof BILLING_FREQUENCIES)[number];
  startDate: string;
  endDate: string;
  autoIssue: boolean;
  warehouseId: string;
  notes: string;
  lines: Array<Omit<LineState, 'key'>>;
}

const today = () => toSantiagoDateInput(new Date());

export const EMPTY_CONTRACT: ContractFormValues = {
  contact: null,
  projectId: '',
  name: '',
  dteType: 'FACTURA_33',
  paymentMethod: 'CREDITO_30',
  paymentTermDays: 30,
  frequency: 'MONTHLY',
  startDate: '',
  endDate: '',
  autoIssue: false,
  warehouseId: '',
  notes: '',
  lines: [{ productId: '', description: '', quantity: 1, unitPrice: 0, isExempt: false }],
};

let lineSeq = 0;
const withKey = (line: Omit<LineState, 'key'>): LineState => ({ ...line, key: ++lineSeq });

export default function ContractForm({ contractId, initial }: { contractId: string | null; initial: ContractFormValues }) {
  const router = useRouter();
  const [lookups, setLookups] = useState<ContractLookups | null>(null);
  const [values, setValues] = useState<ContractFormValues>(() => ({ ...initial, startDate: initial.startDate || today() }));
  const [lines, setLines] = useState<LineState[]>(() => initial.lines.map(withKey));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getContractLookupsAction().then((result) => {
      if (result.success) setLookups(result.data);
      else toast.error(result.error);
    });
  }, []);

  const productById = useMemo(() => new Map((lookups?.products ?? []).map((product) => [product.id, product])), [lookups]);

  const preview = useMemo(() => {
    const computed = computeDocument(
      lines.map((line) => ({
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        isExempt: line.productId ? (productById.get(line.productId)?.isExempt ?? false) : line.isExempt,
      }))
    );
    return { ...computed.totals, mrr: monthlyRecurringRevenue(lines, values.frequency) };
  }, [lines, productById, values.frequency]);

  function patch(next: Partial<ContractFormValues>) {
    setValues((current) => ({ ...current, ...next }));
  }

  function patchLine(key: number, next: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...next } : line)));
  }

  function pickProduct(key: number, productId: string) {
    const product = productById.get(productId);
    patchLine(key, product ? { productId, description: product.name, unitPrice: product.netPrice } : { productId: '' });
  }

  async function save() {
    if (!values.contact) {
      toast.error('Elige el cliente del contrato');
      return;
    }
    setSaving(true);
    try {
      const result = await saveContractAction(contractId, {
        contactId: values.contact.id,
        projectId: values.projectId || undefined,
        name: values.name,
        dteType: values.dteType,
        paymentMethod: values.paymentMethod,
        paymentTermDays: values.paymentTermDays,
        frequency: values.frequency,
        startDate: values.startDate,
        endDate: values.endDate || undefined,
        autoIssue: values.autoIssue,
        warehouseId: values.warehouseId || undefined,
        notes: values.notes || undefined,
        lines: lines.map((line) => ({
          productId: line.productId || undefined,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          isExempt: line.isExempt,
        })),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Guardado');
      router.push(`/dashboard/contracts/${result.data.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label htmlFor="c-contact">Cliente</Label>
          <ContactSearchSelect id="c-contact" value={values.contact} onChange={(contact) => patch({ contact })} kind="customer" />
        </div>
        <div>
          <Label htmlFor="c-name">Nombre del contrato</Label>
          <Input id="c-name" value={values.name} maxLength={120} onChange={(e) => patch({ name: e.target.value })} placeholder="Ej. Mantención mensual de equipos" />
        </div>
        <div>
          <Label htmlFor="c-frequency">Se factura</Label>
          <select id="c-frequency" className={nativeSelectClass} value={values.frequency} onChange={(e) => patch({ frequency: e.target.value as ContractFormValues['frequency'] })}>
            {BILLING_FREQUENCIES.map((frequency) => (
              <option key={frequency} value={frequency}>
                {BILLING_FREQUENCY_LABELS[frequency]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="c-start">Inicio (día de facturación)</Label>
          <Input id="c-start" type="date" value={values.startDate} onChange={(e) => patch({ startDate: e.target.value })} />
          <p className="mt-1 text-xs text-muted-foreground">Se factura ese mismo día de cada período. Si la fecha ya pasó, parte en el próximo.</p>
        </div>
        <div>
          <Label htmlFor="c-end">Término (opcional)</Label>
          <Input id="c-end" type="date" value={values.endDate} onChange={(e) => patch({ endDate: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="c-dte">Documento</Label>
          <select id="c-dte" className={nativeSelectClass} value={values.dteType} onChange={(e) => patch({ dteType: e.target.value as ContractFormValues['dteType'] })}>
            {CONTRACT_DTE_TYPES.map((type) => (
              <option key={type} value={type}>
                {DTE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="c-method">Forma de pago</Label>
            <select id="c-method" className={nativeSelectClass} value={values.paymentMethod} onChange={(e) => patch({ paymentMethod: e.target.value as ContractFormValues['paymentMethod'] })}>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="c-term">Plazo (días)</Label>
            <Input id="c-term" type="number" min={0} max={180} value={values.paymentTermDays} onChange={(e) => patch({ paymentTermDays: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
          </div>
        </div>
        {lookups && lookups.projects.length > 0 && (
          <div>
            <Label htmlFor="c-project">Proyecto / centro de costo (opcional)</Label>
            <select id="c-project" className={nativeSelectClass} value={values.projectId} onChange={(e) => patch({ projectId: e.target.value })}>
              <option value="">Sin proyecto</option>
              {lookups.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {lookups && lookups.warehouses.length > 1 && (
          <div>
            <Label htmlFor="c-warehouse">Bodega (si factura productos con stock)</Label>
            <select id="c-warehouse" className={nativeSelectClass} value={values.warehouseId} onChange={(e) => patch({ warehouseId: e.target.value })}>
              <option value="">Bodega por defecto</option>
              {lookups.warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-3 md:col-span-2">
          <Switch checked={values.autoIssue} onCheckedChange={(checked) => patch({ autoIssue: checked })} label="Emitir automáticamente" />
          <div className="text-sm">
            <p className="font-medium">Emitir automáticamente</p>
            <p className="text-xs text-muted-foreground">
              {values.autoIssue
                ? 'Cada período se emite solo (consume folio y queda en Cuentas por Cobrar).'
                : 'Cada período se genera en borrador y aparece en Pendientes para que lo revises y emitas.'}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Servicios que se facturan cada período</h2>
          <Button type="button" size="sm" variant="outline" onClick={() => setLines((current) => [...current, withKey({ productId: '', description: '', quantity: 1, unitPrice: 0, isExempt: false })])}>
            <Plus aria-hidden="true" /> Agregar línea
          </Button>
        </header>
        <div className="divide-y divide-border">
          {lines.map((line) => (
            <div key={line.key} className="grid gap-2 px-5 py-3 md:grid-cols-[minmax(160px,1fr)_minmax(180px,2fr)_90px_150px_auto] md:items-end">
              <div>
                <Label className="text-xs">Producto / servicio</Label>
                <select aria-label="Producto del catálogo" className={nativeSelectClass} value={line.productId} onChange={(e) => pickProduct(line.key, e.target.value)}>
                  <option value="">Línea libre</option>
                  {(lookups?.products ?? []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Descripción</Label>
                <Input aria-label="Descripción" value={line.description} maxLength={300} onChange={(e) => patchLine(line.key, { description: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Cantidad</Label>
                <Input aria-label="Cantidad" type="number" min={0} step="any" value={line.quantity} onChange={(e) => patchLine(line.key, { quantity: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <Label className="text-xs">Precio neto unitario</Label>
                <CurrencyInput aria-label="Precio neto unitario" value={line.unitPrice} onChange={(value) => patchLine(line.key, { unitPrice: value })} />
              </div>
              <div className="flex items-center gap-2">
                {!line.productId && (
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={line.isExempt} onChange={(e) => patchLine(line.key, { isExempt: e.target.checked })} /> Exenta
                  </label>
                )}
                {line.productId && productById.get(line.productId)?.isExempt && <span className="text-xs text-muted-foreground">Exenta</span>}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Quitar línea"
                  disabled={lines.length === 1}
                  onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <footer className="grid gap-1 border-t border-border px-5 py-3 text-sm sm:grid-cols-2">
          <div className="text-muted-foreground">
            Ingreso mensual recurrente (neto): <span className="font-semibold text-foreground">{formatCurrency(preview.mrr)}</span>
          </div>
          <div className="space-y-0.5 sm:text-right">
            <p>Neto {formatCurrency(preview.netAmount)} · Exento {formatCurrency(preview.exemptAmount)} · IVA {formatCurrency(preview.ivaAmount)}</p>
            <p className="font-semibold">Total por período {formatCurrency(preview.totalAmount)}</p>
          </div>
        </footer>
      </section>

      <div>
        <Label htmlFor="c-notes">Notas internas</Label>
        <textarea id="c-notes" className={textareaClass} value={values.notes} maxLength={1000} onChange={(e) => patch({ notes: e.target.value })} />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? 'Guardando…' : contractId ? 'Guardar cambios' : 'Crear contrato'}
        </Button>
      </div>
    </div>
  );
}
