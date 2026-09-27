'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import type { ArchivedInvoice } from '@prisma/client';
import { Camera, ChevronDown, ExternalLink, FileText, Plus, Receipt, Search, Store, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { KpiCard } from '@/components/ui/KpiCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { textareaClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import { cn } from '@/lib/utils';
import { archivedInvoiceSchema, supplierKeyOf } from '@/modules/invoice-archive/schema';
import {
  deleteArchivedInvoiceAction,
  getArchiveOverviewAction,
  listSupplierInvoicesAction,
  listSupplierSuggestionsAction,
} from '@/modules/invoice-archive/actions/invoice-archive.actions';
import type { ArchiveOverview } from '@/modules/invoice-archive/services/invoice-archive.service';

/**
 * Archivo de facturas por proveedor: se ingresa proveedor, total, fecha y la
 * foto/PDF; se consulta el resumen por proveedor y, al desplegar uno, su
 * histórico de compras con cada factura.
 */

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function todayInput(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function formatDate(value: Date | string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Fotos del celular pesan 3–8 MB: se reducen a JPG de hasta 2000 px por lado
 * antes de subir (el tope por solicitud es ~4,5 MB). Un PDF se sube tal cual.
 */
async function prepareFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || (file.size <= 1.5 * 1024 * 1024 && file.type !== 'image/heic')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

function NewInvoiceDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (supplierKey: string) => void }) {
  const [supplierName, setSupplierName] = useState('');
  const [totalAmount, setTotalAmount] = useState(0);
  const [issueDate, setIssueDate] = useState(todayInput());
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ name: string; contactId: string | null }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    listSupplierSuggestionsAction().then((result) => {
      if (result.success) setSuggestions(result.data);
    });
  }, [open]);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function reset() {
    setSupplierName('');
    setTotalAmount(0);
    setIssueDate(todayInput());
    setInvoiceNumber('');
    setNotes('');
    setFile(null);
    setErrors({});
  }

  async function pick(selected: File | undefined) {
    if (!selected) return;
    setErrors((prev) => ({ ...prev, file: '' }));
    setFile(await prepareFile(selected));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = archivedInvoiceSchema.safeParse({ supplierName, totalAmount, issueDate, invoiceNumber, notes });
    const next: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!next[key]) next[key] = issue.message;
      }
    }
    if (!file) next.file = 'Adjunta la foto o el PDF de la factura';
    else if (file.size > MAX_UPLOAD_BYTES) next.file = 'El archivo supera los 4 MB. Prueba con otra foto o un PDF más liviano.';
    setErrors(next);
    if (Object.keys(next).length > 0 || !file) return;

    // Si el nombre coincide con un proveedor del maestro, queda vinculado a su ficha.
    const match = suggestions.find((s) => s.contactId && supplierKeyOf(s.name) === supplierKeyOf(supplierName));
    const body = new FormData();
    body.append('supplierName', supplierName);
    if (match?.contactId) body.append('contactId', match.contactId);
    body.append('totalAmount', String(totalAmount));
    body.append('issueDate', issueDate);
    body.append('invoiceNumber', invoiceNumber);
    body.append('notes', notes);
    body.append('file', file);

    setSaving(true);
    try {
      const response = await fetch('/api/invoice-archive', { method: 'POST', body });
      const json = (await response.json().catch(() => null)) as { success: boolean; data?: { supplierKey: string }; error?: string } | null;
      if (!json?.success || !json.data) {
        toast.error(json?.error ?? (response.status === 413 ? 'El archivo es demasiado pesado' : 'No se pudo guardar la factura'));
        return;
      }
      toast.success('Factura archivada');
      onSaved(json.data.supplierKey);
      reset();
    } catch {
      toast.error('No se pudo conectar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ingresar factura</DialogTitle>
        </DialogHeader>
        <form id="archive-form" onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="arch-supplier">Proveedor</Label>
            <Input
              id="arch-supplier"
              list="arch-supplier-options"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Nombre del proveedor"
              autoComplete="off"
              aria-invalid={!!errors.supplierName}
            />
            <datalist id="arch-supplier-options">
              {suggestions.map((s) => (
                <option key={s.name} value={s.name} />
              ))}
            </datalist>
            {errors.supplierName && <p className="mt-1 text-sm text-destructive">{errors.supplierName}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="arch-total">Total de la factura</Label>
              <CurrencyInput id="arch-total" value={totalAmount} onChange={setTotalAmount} aria-invalid={!!errors.totalAmount} />
              {errors.totalAmount && <p className="mt-1 text-sm text-destructive">{errors.totalAmount}</p>}
            </div>
            <div>
              <Label htmlFor="arch-date">Fecha</Label>
              <Input id="arch-date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} aria-invalid={!!errors.issueDate} />
              {errors.issueDate && <p className="mt-1 text-sm text-destructive">{errors.issueDate}</p>}
            </div>
          </div>
          <div>
            <Label htmlFor="arch-number">N° de factura (opcional)</Label>
            <Input id="arch-number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Folio" />
          </div>
          <div>
            <Label>Imagen o PDF de la factura</Label>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
            <div className="mt-1 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => cameraRef.current?.click()}>
                <Camera aria-hidden="true" /> Tomar foto
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <FileText aria-hidden="true" /> Elegir archivo
              </Button>
            </div>
            {file && (
              <div className="mt-2 flex items-center gap-3 rounded-lg border border-border p-2">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Vista previa de la factura" className="size-16 rounded object-cover" />
                ) : (
                  <FileText className="size-8 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setFile(null)}>
                  Quitar
                </Button>
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">Foto JPG o PNG, o PDF. Las fotos se optimizan antes de subir.</p>
            {errors.file && <p className="mt-1 text-sm text-destructive">{errors.file}</p>}
          </div>
          <div>
            <Label htmlFor="arch-notes">Nota (opcional)</Label>
            <textarea id="arch-notes" className={textareaClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="archive-form" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar factura'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupplierHistory({ supplierKey, canWrite, onChanged }: { supplierKey: string; canWrite: boolean; onChanged: () => void }) {
  const confirm = useConfirm();
  const [invoices, setInvoices] = useState<ArchivedInvoice[] | null>(null);

  const load = useCallback(async () => {
    const result = await listSupplierInvoicesAction(supplierKey);
    if (result.success) setInvoices(result.data);
    else toast.error(result.error);
  }, [supplierKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(invoice: ArchivedInvoice) {
    const ok = await confirm({
      title: 'Eliminar factura del archivo',
      description: `Se eliminará la factura de ${formatCurrency(invoice.totalAmount)} del ${formatDate(invoice.issueDate)} junto con su imagen. No se puede deshacer.`,
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    const result = await deleteArchivedInvoiceAction(invoice.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Factura eliminada');
    await load();
    onChanged();
  }

  if (!invoices) return <p className="px-4 py-3 text-sm text-muted-foreground">Cargando histórico…</p>;
  if (invoices.length === 0) return <p className="px-4 py-3 text-sm text-muted-foreground">Sin facturas.</p>;

  return (
    <ul className="divide-y divide-border">
      {invoices.map((invoice) => (
        <li key={invoice.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
          <a
            href={invoice.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted"
            aria-label={`Ver factura del ${formatDate(invoice.issueDate)}`}
          >
            {invoice.mimeType.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={invoice.fileUrl} alt="" className="size-full object-cover" loading="lazy" />
            ) : (
              <FileText className="size-5 text-muted-foreground" aria-hidden="true" />
            )}
          </a>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {formatDate(invoice.issueDate)}
              {invoice.invoiceNumber && <span className="ml-2 text-muted-foreground">N° {invoice.invoiceNumber}</span>}
            </p>
            {invoice.notes && <p className="truncate text-xs text-muted-foreground">{invoice.notes}</p>}
          </div>
          <p className="text-sm font-semibold tabular-nums">{formatCurrency(invoice.totalAmount)}</p>
          <div className="flex items-center gap-1">
            <a href={invoice.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:underline">
              <ExternalLink className="size-3.5" aria-hidden="true" /> Ver
            </a>
            {canWrite && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void remove(invoice)} aria-label="Eliminar factura">
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function InvoiceArchiveClient({ canWrite }: { canWrite: boolean }) {
  const [overview, setOverview] = useState<ArchiveOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    const result = await getArchiveOverviewAction();
    if (result.success) {
      setOverview(result.data);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const suppliers = useMemo(() => {
    const term = supplierKeyOf(search);
    return (overview?.suppliers ?? []).filter((s) => !term || s.key.includes(term));
  }, [overview, search]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Facturas archivadas" value={overview ? String(overview.invoiceCount) : '—'} icon={Receipt} hint="en total" />
        <KpiCard label="Total comprado" value={overview ? formatCurrency(overview.totalAmount) : '—'} icon={Wallet} tone="success" hint="suma de las facturas" />
        <KpiCard label="Proveedores" value={overview ? String(overview.suppliers.length) : '—'} icon={Store} tone="neutral" hint="con facturas archivadas" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input className="pl-8" placeholder="Buscar proveedor" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar proveedor" />
        </div>
        {canWrite && (
          <Button type="button" onClick={() => setDialogOpen(true)}>
            <Plus aria-hidden="true" /> Ingresar factura
          </Button>
        )}
      </div>

      {overview && overview.suppliers.length === 0 ? (
        <EmptyState
          title="Aún no hay facturas archivadas"
          description="Ingresa una factura con su proveedor, total y la foto o PDF. Después verás aquí el histórico de compras de cada proveedor."
          actionLabel={canWrite ? 'Ingresar la primera factura' : undefined}
          onAction={canWrite ? () => setDialogOpen(true) : undefined}
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {!overview && !loadError && <p className="px-4 py-6 text-sm text-muted-foreground">Cargando…</p>}
          {!overview && loadError && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-6">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
                Reintentar
              </Button>
            </div>
          )}
          {overview && suppliers.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">Ningún proveedor coincide con la búsqueda.</p>}
          {suppliers.map((supplier) => {
            const expanded = open.has(supplier.key);
            const panelId = `supplier-${supplier.key.replace(/\W+/g, '-')}`;
            return (
              <section key={supplier.key}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => toggle(supplier.key)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {supplier.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{supplier.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {supplier.invoiceCount} factura{supplier.invoiceCount === 1 ? '' : 's'} · última {formatDate(supplier.lastIssueDate)}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-semibold tabular-nums">{formatCurrency(supplier.totalAmount)}</span>
                    <span className="block text-xs text-muted-foreground">total comprado</span>
                  </span>
                  <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
                </button>
                {expanded && (
                  <div id={panelId} className="border-t border-border bg-muted/20">
                    <SupplierHistory key={`${supplier.key}-${version}`} supplierKey={supplier.key} canWrite={canWrite} onChanged={() => void load()} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {canWrite && (
        <NewInvoiceDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={(supplierKey) => {
            setDialogOpen(false);
            setOpen((prev) => new Set(prev).add(supplierKey));
            setVersion((v) => v + 1);
            void load();
          }}
        />
      )}
    </div>
  );
}
