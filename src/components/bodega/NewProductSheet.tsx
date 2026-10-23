'use client';

import { useEffect, useState } from 'react';
import { ScanBarcode, Sparkles } from 'lucide-react';
import { normalizeText } from '@/lib/warehouse-mobile/match';
import type { NewProductForm } from '@/lib/warehouse-mobile/draft';
import type { BootstrapResponse, VisionRead } from '@/modules/warehouse-mobile/types';
import CaptureScreen from './CaptureScreen';
import { BigButton, Field, PhotoThumb, Sheet, inputClass } from './ui';

/**
 * Alta de un producto nuevo desde el celular. Llega prellenado con lo que la IA
 * leyó de la foto o con el código escaneado, y TODO se puede corregir: lo que
 * se guarda es lo que la persona dejó en esta pantalla, no lo que "adivinó" la IA.
 */

interface Props {
  open: boolean;
  initial: NewProductForm;
  /** Lo que leyó la IA (para avisar que el formulario viene sugerido). */
  read: VisionRead | null;
  photoId: string | null;
  boot: BootstrapResponse;
  onSave: (form: NewProductForm) => void;
  onClose: () => void;
}

export default function NewProductSheet({ open, initial, read, photoId, boot, onSave, onClose }: Props) {
  const [form, setForm] = useState<NewProductForm>(initial);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Si la IA sugirió una categoría que ya existe, se elige esa en vez de crear otra igual.
    const hint = normalizeText(initial.categoryName);
    const existing = hint ? boot.categories.find((category) => normalizeText(category.name) === hint) : undefined;
    setForm(existing ? { ...initial, categoryId: existing.id, categoryName: '' } : initial);
    setError(null);
  }, [open, initial, boot.categories]);

  const set = <K extends keyof NewProductForm>(key: K, value: NewProductForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = () => {
    if (form.name.trim().length < 2) {
      setError('Ponle un nombre al producto.');
      return;
    }
    if (form.barcode.trim() && !/^[\x21-\x7e]+$/.test(form.barcode.trim())) {
      setError('El código de barras solo admite letras, números y símbolos, sin espacios.');
      return;
    }
    if (form.sku.trim() && !/^[A-Za-z0-9._\-/]+$/.test(form.sku.trim())) {
      setError('El SKU solo admite letras, números y . _ - /');
      return;
    }
    onSave(form);
  };

  return (
    <>
      <Sheet
        open={open && !scanning}
        title="Producto nuevo"
        onClose={onClose}
        footer={
          <div className="space-y-2">
            {error ? (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            ) : null}
            <BigButton className="w-full" onClick={save}>
              Usar este producto
            </BigButton>
          </div>
        }
      >
        <div className="space-y-4">
          {read ? (
            <p className="flex items-start gap-2 rounded-xl bg-accent p-3 text-sm text-accent-foreground">
              <Sparkles className="mt-0.5 size-4 shrink-0" />
              <span>
                Estos datos los sugirió la IA al mirar la foto{read.confidence === 'low' ? ' (con poca seguridad)' : ''}. <strong>Revísalos</strong> antes de guardar.
                {read.warnings.length > 0 ? ` ${read.warnings.join(' ')}` : ''}
              </span>
            </p>
          ) : null}

          {photoId ? (
            <div className="flex items-center gap-3">
              <PhotoThumb photoId={photoId} className="size-20" />
              <p className="text-sm text-muted-foreground">Esta foto quedará como la imagen del producto.</p>
            </div>
          ) : null}

          <Field label="Nombre *">
            <input value={form.name} onChange={(event) => set('name', event.target.value)} className={inputClass} placeholder="Ej. Aceite de Maravilla Chef 900 ml" autoComplete="off" maxLength={120} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca">
              <input value={form.brand} onChange={(event) => set('brand', event.target.value)} className={inputClass} maxLength={80} autoComplete="off" />
            </Field>
            <Field label="Unidad">
              <select value={form.unit} onChange={(event) => set('unit', event.target.value)} className={inputClass}>
                {boot.units.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Código de barras" hint="Con el código guardado, la próxima vez se reconoce con solo escanearlo (sin IA).">
            <div className="flex gap-2">
              <input value={form.barcode} onChange={(event) => set('barcode', event.target.value.replace(/\s/g, ''))} className={inputClass} inputMode="numeric" autoComplete="off" maxLength={64} />
              <button type="button" onClick={() => setScanning(true)} aria-label="Leer el código con la cámara" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <ScanBarcode className="size-6" />
              </button>
            </div>
          </Field>

          <Field label="SKU" hint="Si lo dejas vacío, el sistema asigna uno automático (PRD-000123).">
            <input value={form.sku} onChange={(event) => set('sku', event.target.value)} className={inputClass} autoComplete="off" maxLength={40} />
          </Field>

          <Field label="Categoría">
            <select value={form.categoryId} onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value, categoryName: event.target.value ? '' : current.categoryName }))} className={inputClass}>
              <option value="">{form.categoryName ? `Crear «${form.categoryName}»` : 'Sin categoría'}</option>
              {boot.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Descripción">
            <textarea value={form.description} onChange={(event) => set('description', event.target.value)} className={`${inputClass} h-20 py-2`} maxLength={500} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio de venta (neto)" hint="Opcional. Sin IVA.">
              <input value={form.netPrice} onChange={(event) => set('netPrice', event.target.value)} className={inputClass} inputMode="decimal" placeholder="$" autoComplete="off" />
            </Field>
            {boot.can.seeCosts ? (
              <Field label="Costo unitario (neto)" hint="Opcional. Vacío = $0.">
                <input value={form.unitCost} onChange={(event) => set('unitCost', event.target.value)} className={inputClass} inputMode="decimal" placeholder="$" autoComplete="off" />
              </Field>
            ) : null}
          </div>
          {form.netPrice.trim() === '' ? <p className="-mt-2 text-xs text-warning">Sin precio de venta, el producto se creará con precio $0: complétalo después en el Catálogo.</p> : null}

          <div className="space-y-2">
            <label className="flex min-h-12 items-center gap-3 rounded-xl bg-muted px-3">
              <input type="checkbox" checked={form.isExempt} onChange={(event) => set('isExempt', event.target.checked)} className="size-5" />
              <span className="text-sm">Exento de IVA</span>
            </label>
            <label className="flex min-h-12 items-center gap-3 rounded-xl bg-muted px-3">
              <input type="checkbox" checked={form.tracksLots} onChange={(event) => set('tracksLots', event.target.checked)} className="size-5" />
              <span className="text-sm">Maneja lotes y vencimientos</span>
            </label>
          </div>
        </div>
      </Sheet>

      {open && scanning ? (
        <CaptureScreen
          scanOnly
          onCode={(code) => {
            set('barcode', code);
            setScanning(false);
          }}
          onClose={() => setScanning(false)}
        />
      ) : null}
    </>
  );
}
