'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { IMPORT_CURRENCIES, INCOTERMS } from '@/modules/purchases/schema';

export interface ImportHeaderValues {
  reference: string;
  contactId: string | null;
  currency: (typeof IMPORT_CURRENCIES)[number];
  exchangeRate: number;
  incoterm: (typeof INCOTERMS)[number] | null;
  dinNumber?: string;
  arrivalDate: string;
  warehouseId: string | null;
  allocationMethod: 'VALUE' | 'QUANTITY';
  notes?: string;
}

interface Props {
  title: string;
  initial?: ImportHeaderValues;
  suppliers: { id: string; label: string }[];
  warehouses: { id: string; name: string }[];
  onClose: () => void;
  onSubmit: (values: ImportHeaderValues) => Promise<boolean>;
}

/** Datos generales de la carpeta: embarque, moneda, tipo de cambio, bodega y método de reparto. */
export function ImportHeaderDialog({ title, initial, suppliers, warehouses, onClose, onSubmit }: Props) {
  const [reference, setReference] = useState(initial?.reference ?? '');
  const [contactId, setContactId] = useState(initial?.contactId ?? '');
  const [currency, setCurrency] = useState<ImportHeaderValues['currency']>(initial?.currency ?? 'USD');
  const [exchangeRate, setExchangeRate] = useState(initial ? String(initial.exchangeRate).replace('.', ',') : '');
  const [incoterm, setIncoterm] = useState<string>(initial?.incoterm ?? 'FOB');
  const [dinNumber, setDinNumber] = useState(initial?.dinNumber ?? '');
  const [arrivalDate, setArrivalDate] = useState(initial?.arrivalDate ?? '');
  const [warehouseId, setWarehouseId] = useState(initial?.warehouseId ?? warehouses[0]?.id ?? '');
  const [allocationMethod, setAllocationMethod] = useState<'VALUE' | 'QUANTITY'>(initial?.allocationMethod ?? 'VALUE');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const ok = await onSubmit({
        reference: reference.trim(),
        contactId: contactId || null,
        currency,
        // "945,32" (coma decimal chilena, con o sin puntos de miles) o "945.32".
        exchangeRate: Number(exchangeRate.includes(',') ? exchangeRate.replace(/\./g, '').replace(',', '.') : exchangeRate) || 0,
        incoterm: (incoterm || null) as ImportHeaderValues['incoterm'],
        dinNumber: dinNumber.trim() || undefined,
        arrivalDate,
        warehouseId: warehouseId || null,
        allocationMethod,
        notes: notes.trim() || undefined,
      });
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>El tipo de cambio es el de la declaración de ingreso (DIN) o el dólar observado del día de la internación.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="imp-ref">Referencia del embarque</Label>
            <Input id="imp-ref" value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} placeholder="Ej: BL MAEU123456 · Proforma 2026-114" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="imp-supplier">Proveedor extranjero</Label>
            <select id="imp-supplier" className={nativeSelectClass} value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">Sin especificar</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imp-currency">Moneda</Label>
            <select id="imp-currency" className={nativeSelectClass} value={currency} onChange={(e) => setCurrency(e.target.value as ImportHeaderValues['currency'])}>
              {IMPORT_CURRENCIES.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imp-rate">Tipo de cambio (pesos por {currency})</Label>
            <Input id="imp-rate" inputMode="decimal" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder="Ej: 945,32" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imp-incoterm">Incoterm</Label>
            <select id="imp-incoterm" className={nativeSelectClass} value={incoterm} onChange={(e) => setIncoterm(e.target.value)}>
              <option value="">Sin especificar</option>
              {INCOTERMS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imp-arrival">Llegada / internación</Label>
            <Input id="imp-arrival" type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imp-din">N° DIN</Label>
            <Input id="imp-din" value={dinNumber} maxLength={30} onChange={(e) => setDinNumber(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imp-warehouse">Bodega de destino</Label>
            <select id="imp-warehouse" className={nativeSelectClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Elegir al cerrar</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
              ))}
            </select>
          </div>
          <fieldset className="space-y-1.5 sm:col-span-2">
            <legend className="text-sm font-medium">Reparto de los costos</legend>
            <div className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
              <label className="flex items-start gap-2">
                <input type="radio" name="imp-method" className="mt-1" checked={allocationMethod === 'VALUE'} onChange={() => setAllocationMethod('VALUE')} />
                <span>Por valor FOB <span className="block text-xs text-muted-foreground">Lo habitual: seguro y arancel se calculan sobre valor.</span></span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="imp-method" className="mt-1" checked={allocationMethod === 'QUANTITY'} onChange={() => setAllocationMethod('QUANTITY')} />
                <span>Por unidades <span className="block text-xs text-muted-foreground">Cuando manda el flete y los productos son parecidos.</span></span>
              </label>
            </div>
          </fieldset>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="imp-notes">Notas</Label>
            <textarea id="imp-notes" className={textareaClass} rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={saving || !reference.trim() || !exchangeRate} onClick={submit}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
