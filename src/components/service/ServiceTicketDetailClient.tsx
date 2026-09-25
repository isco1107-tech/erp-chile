'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Copy, ExternalLink, Eye, EyeOff, Pencil, Plus, Printer, Receipt, Trash2, Wrench } from 'lucide-react';
import type { ServiceTicketStatus } from '@prisma/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { formatCurrency } from '@/lib/chile/tax';
import { allowedTransitions, canEditEstimate, estimateTotals, SERVICE_STATUS_LABELS } from '@/lib/service/tickets';
import { cn } from '@/lib/utils';
import {
  addServiceNoteAction,
  changeServiceStatusAction,
  createServiceSalesOrderAction,
  saveDiagnosisAction,
  saveServiceLinesAction,
} from '@/modules/service-desk/actions/service-tickets.actions';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '@/modules/sales/schema';
import { SERVICE_PRIORITIES, SERVICE_PRIORITY_LABELS } from '@/modules/service-desk/schema';
import type { ServiceTicketDetail } from '@/modules/service-desk/services/service-tickets.service';
import { ProductSearch } from '@/components/purchases/ProductSearch';
import { SERVICE_STATUS_TONE } from './ServiceTicketsClient';

function formatMoment(value: Date | string): string {
  return new Date(value).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Santiago' });
}

function formatDay(value: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—';
}

function transitionLabel(from: ServiceTicketStatus, to: ServiceTicketStatus): string {
  switch (to) {
    case 'DIAGNOSING':
      return from === 'RECEIVED' ? 'Iniciar diagnóstico' : 'Volver a diagnóstico';
    case 'WAITING_APPROVAL':
      return 'Enviar presupuesto al cliente';
    case 'APPROVED':
      return 'Aprobado en mesón';
    case 'IN_REPAIR':
      return 'Pasar a reparación';
    case 'READY':
      return from === 'WAITING_APPROVAL' ? 'Cliente rechazó el presupuesto' : 'Listo para retiro';
    case 'DELIVERED':
      return 'Entregar al cliente';
    case 'CANCELLED':
      return 'Anular';
    default:
      return SERVICE_STATUS_LABELS[to];
  }
}

interface LineDraft {
  key: string;
  kind: 'PART' | 'LABOR';
  productId: string | null;
  sku: string | null;
  description: string;
  quantity: string;
  unitPrice: number;
}

let counter = 0;
const nextKey = () => `st-line-${(counter += 1)}`;

interface Props {
  ticket: ServiceTicketDetail;
  trackingUrl: string;
  technicians: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
  canWrite: boolean;
  canSell: boolean;
}

export default function ServiceTicketDetailClient({ ticket, trackingUrl, technicians, warehouses, canWrite, canSell }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [transition, setTransition] = useState<ServiceTicketStatus | null>(null);
  const [transitionNote, setTransitionNote] = useState('');
  const [transitionVisible, setTransitionVisible] = useState(true);
  const [diagnosis, setDiagnosis] = useState(ticket.diagnosis ?? '');
  const [technicianId, setTechnicianId] = useState(ticket.technicianId ?? '');
  const [promisedDate, setPromisedDate] = useState(ticket.promisedDate ? new Date(ticket.promisedDate).toISOString().slice(0, 10) : '');
  const [priority, setPriority] = useState(ticket.priority as (typeof SERVICE_PRIORITIES)[number]);
  const [lines, setLines] = useState<LineDraft[]>(() =>
    ticket.lines.map((line) => ({ key: nextKey(), kind: line.kind === 'LABOR' ? 'LABOR' : 'PART', productId: line.productId, sku: line.sku, description: line.description, quantity: String(line.quantity).replace('.', ','), unitPrice: line.unitPrice }))
  );
  const [linesDirty, setLinesDirty] = useState(false);
  const [note, setNote] = useState('');
  const [noteVisible, setNoteVisible] = useState(false);
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>('EFECTIVO');

  const closed = ticket.status === 'DELIVERED' || ticket.status === 'CANCELLED';
  const estimateEditable = canWrite && canEditEstimate(ticket.status, ticket.warranty) && !ticket.salesOrder;
  const parsedLines = lines.map((line) => ({ quantity: Number(line.quantity.replace(',', '.')) || 0, unitPrice: line.unitPrice }));
  const totals = estimateTotals(parsedLines);
  const nextStatuses = canWrite ? allowedTransitions(ticket.status, { warranty: ticket.warranty }) : [];

  async function run(action: () => Promise<{ success: true; message?: string } | { success: false; error: string }>, after?: () => void) {
    setBusy(true);
    try {
      const result = await action();
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      if (result.message) toast.success(result.message);
      after?.();
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    setLinesDirty(true);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(trackingUrl);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar: selecciónalo a mano');
    }
  }

  const whatsappText = encodeURIComponent(`Hola, puedes seguir la reparación de tu ${ticket.equipment} (orden N° ${ticket.folio}) aquí: ${trackingUrl}`);

  return (
    <div className="space-y-6">
      <Link href="/dashboard/service" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Servicio técnico
      </Link>
      <PageHeader
        eyebrow={`Orden de servicio N° ${ticket.folio} · recibida ${formatMoment(ticket.createdAt)}${ticket.receivedByName ? ` por ${ticket.receivedByName}` : ''}`}
        title={[ticket.equipment, ticket.brand, ticket.model].filter(Boolean).join(' · ')}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={SERVICE_STATUS_TONE[ticket.status]}>{SERVICE_STATUS_LABELS[ticket.status]}</StatusBadge>
            {ticket.warranty && <StatusBadge tone="accent">Garantía</StatusBadge>}
            {ticket.priority === 'HIGH' && <StatusBadge tone="danger">Urgente</StatusBadge>}
            {ticket.promisedDate && !closed && <span>Comprometida para el {formatDay(ticket.promisedDate)}</span>}
          </span>
        }
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <Link href={`/dashboard/service/${ticket.id}/recepcion`} className={buttonVariants({ variant: 'outline' })}>
              <Printer className="size-4" aria-hidden="true" /> Comprobante
            </Link>
            {canWrite && !closed && (
              <Link href={`/dashboard/service/${ticket.id}/edit`} className={buttonVariants({ variant: 'outline' })}>
                <Pencil className="size-4" aria-hidden="true" /> Editar
              </Link>
            )}
            {nextStatuses.map((status) => (
              <Button
                key={status}
                type="button"
                variant={status === 'CANCELLED' || (status === 'DIAGNOSING' && ticket.status !== 'RECEIVED') ? 'ghost' : status === nextStatuses[0] ? 'default' : 'outline'}
                disabled={busy || (status === 'WAITING_APPROVAL' && (lines.length === 0 || linesDirty))}
                title={status === 'WAITING_APPROVAL' && (lines.length === 0 || linesDirty) ? 'Guarda un presupuesto con líneas antes de enviarlo' : undefined}
                onClick={() => {
                  setTransition(status);
                  setTransitionNote('');
                  setTransitionVisible(status !== 'CANCELLED');
                }}
              >
                {transitionLabel(ticket.status, status)}
              </Button>
            ))}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <section className="grid gap-4 rounded-lg border border-border bg-card p-4 text-sm shadow-card sm:grid-cols-2" aria-label="Equipo">
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-muted-foreground uppercase">Falla reportada</p>
              <p className="mt-1 whitespace-pre-line">{ticket.reportedIssue}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">N° de serie</p>
              <p className="mt-1 font-mono">{ticket.serialNumber ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Accesorios</p>
              <p className="mt-1">{ticket.accessories ?? 'Sin accesorios'}</p>
            </div>
            {ticket.notes && (
              <div className="rounded-md bg-muted px-3 py-2 text-xs sm:col-span-2">
                <span className="font-medium">Nota interna:</span> {ticket.notes}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Diagnóstico">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Diagnóstico</h2>
              {canWrite && !closed && (
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => saveDiagnosisAction(ticket.id, { diagnosis: diagnosis.trim(), technicianId: technicianId || null, promisedDate, priority }))}>
                  Guardar
                </Button>
              )}
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="st-diagnosis">Qué tiene el equipo (lo ve el cliente en su enlace)</Label>
                <textarea id="st-diagnosis" className={textareaClass} rows={3} maxLength={2000} value={diagnosis} disabled={!canWrite || closed} onChange={(e) => setDiagnosis(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-tech">Técnico</Label>
                <select id="st-tech" className={nativeSelectClass} value={technicianId} disabled={!canWrite || closed} onChange={(e) => setTechnicianId(e.target.value)}>
                  <option value="">Sin asignar</option>
                  {technicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>{technician.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-promised">Fecha comprometida</Label>
                <Input id="st-promised" type="date" value={promisedDate} disabled={!canWrite || closed} onChange={(e) => setPromisedDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-priority">Prioridad</Label>
                <select id="st-priority" className={nativeSelectClass} value={priority} disabled={!canWrite || closed} onChange={(e) => setPriority(e.target.value as typeof priority)}>
                  {SERVICE_PRIORITIES.map((value) => (
                    <option key={value} value={value}>{SERVICE_PRIORITY_LABELS[value]}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Presupuesto">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold">Presupuesto</h2>
                <p className="text-xs text-muted-foreground">
                  {estimateEditable
                    ? 'Repuestos y mano de obra, precios netos. Al enviarlo, el cliente lo aprueba desde su enlace.'
                    : ticket.salesOrder
                      ? 'Ya se generó la nota de venta: los ajustes se hacen ahí.'
                      : 'Enviado al cliente: para cambiarlo, vuelve la orden a diagnóstico y reenvíalo.'}
                </p>
              </div>
              {estimateEditable && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setLines((current) => [...current, { key: nextKey(), kind: 'LABOR', productId: null, sku: null, description: 'Mano de obra', quantity: '1', unitPrice: 0 }]);
                      setLinesDirty(true);
                    }}
                  >
                    <Plus className="size-3.5" aria-hidden="true" /> Mano de obra
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || !linesDirty}
                    onClick={() =>
                      run(
                        () =>
                          saveServiceLinesAction(
                            ticket.id,
                            lines.map((line) => ({ kind: line.kind, productId: line.productId, description: line.description.trim(), quantity: Number(line.quantity.replace(',', '.')) || 0, unitPrice: line.unitPrice }))
                          ),
                        () => setLinesDirty(false)
                      )
                    }
                  >
                    Guardar presupuesto
                  </Button>
                </div>
              )}
            </div>
            {estimateEditable && (
              <div className="border-b border-border p-4">
                <ProductSearch
                  placeholder="Agregar repuesto del catálogo"
                  onPick={(product) => {
                    setLines((current) => [...current, { key: nextKey(), kind: 'PART', productId: product.id, sku: product.sku, description: product.name, quantity: '1', unitPrice: product.netPrice }]);
                    setLinesDirty(true);
                  }}
                />
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 font-medium">Detalle</th>
                    <th className="w-24 px-4 py-2 font-medium">Cantidad</th>
                    <th className="w-40 px-4 py-2 font-medium">Precio neto</th>
                    <th className="px-4 py-2 text-right font-medium">Subtotal</th>
                    {estimateEditable && <th className="w-10 px-2 py-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={estimateEditable ? 5 : 4} className="px-4 py-6 text-center text-muted-foreground">Sin líneas todavía.</td>
                    </tr>
                  )}
                  {lines.map((line, index) => (
                    <tr key={line.key}>
                      <td className="px-4 py-2">
                        <span className="mr-2 text-xs text-muted-foreground">{line.kind === 'LABOR' ? 'Mano de obra' : 'Repuesto'}</span>
                        {estimateEditable && !line.productId ? (
                          <Input aria-label="Detalle" className="mt-1" maxLength={160} value={line.description} onChange={(e) => updateLine(line.key, { description: e.target.value })} />
                        ) : (
                          <p className="font-medium">
                            {line.description}
                            {line.sku && <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{line.sku}</span>}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {estimateEditable ? <Input aria-label="Cantidad" inputMode="decimal" value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} /> : <span className="tabular-nums">{line.quantity}</span>}
                      </td>
                      <td className="px-4 py-2">
                        {estimateEditable ? <CurrencyInput aria-label="Precio neto" value={line.unitPrice} onChange={(value) => updateLine(line.key, { unitPrice: value })} /> : <span className="tabular-nums">{formatCurrency(line.unitPrice)}</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{formatCurrency(Math.round(parsedLines[index].quantity * parsedLines[index].unitPrice))}</td>
                      {estimateEditable && (
                        <td className="px-2 py-2">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Quitar línea"
                            onClick={() => {
                              setLines((current) => current.filter((item) => item.key !== line.key));
                              setLinesDirty(true);
                            }}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto max-w-xs space-y-1 border-t border-border px-4 py-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Neto</dt><dd className="tabular-nums">{formatCurrency(totals.net)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">IVA 19%</dt><dd className="tabular-nums">{formatCurrency(totals.iva)}</dd></div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatCurrency(totals.total)}</dd></div>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Bitácora">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Bitácora</h2>
            </div>
            {canWrite && !closed && (
              <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-start">
                <textarea aria-label="Nueva nota" className={cn(textareaClass, 'flex-1')} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Avance, llamada al cliente, repuesto pedido…" />
                <div className="flex shrink-0 flex-col gap-2">
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={noteVisible} onCheckedChange={setNoteVisible} label="Visible para el cliente" />
                    Visible para el cliente
                  </label>
                  <Button type="button" size="sm" disabled={busy || !note.trim()} onClick={() => run(() => addServiceNoteAction(ticket.id, { note: note.trim(), visibleToCustomer: noteVisible }), () => setNote(''))}>
                    Agregar nota
                  </Button>
                </div>
              </div>
            )}
            <ol className="divide-y divide-border">
              {ticket.events.map((event) => (
                <li key={event.id} className="flex gap-3 px-4 py-3 text-sm">
                  <span className="mt-0.5 text-muted-foreground" title={event.visibleToCustomer ? 'Lo ve el cliente' : 'Solo interno'}>
                    {event.visibleToCustomer ? <Eye className="size-4" aria-label="Lo ve el cliente" /> : <EyeOff className="size-4" aria-label="Solo interno" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p>
                      {event.status && <StatusBadge tone={SERVICE_STATUS_TONE[event.status]} className="mr-2">{SERVICE_STATUS_LABELS[event.status]}</StatusBadge>}
                      {event.note}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatMoment(event.createdAt)}{event.createdByName ? ` · ${event.createdByName}` : ''}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4 text-sm shadow-card" aria-label="Cliente">
            <h2 className="text-sm font-semibold">Cliente</h2>
            <p className="mt-2 font-medium">{ticket.customer.name}</p>
            <p className="text-xs text-muted-foreground">{ticket.customer.rut}</p>
            {ticket.customer.phone && <p className="text-xs">{ticket.customer.phone}</p>}
            {ticket.customer.email ? <p className="text-xs">{ticket.customer.email}</p> : <p className="text-xs text-warning">Sin correo: no le llegarán los avisos automáticos</p>}
            <div className="mt-3 space-y-2 rounded-md bg-muted p-3">
              <p className="text-xs font-medium">Enlace de seguimiento</p>
              <p className="truncate font-mono text-xs text-muted-foreground" title={trackingUrl}>{trackingUrl}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="xs" variant="outline" onClick={copyLink}>
                  <Copy aria-hidden="true" /> Copiar
                </Button>
                <a href={`https://wa.me/?text=${whatsappText}`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'xs', variant: 'outline' })}>
                  WhatsApp
                </a>
                <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'xs', variant: 'ghost' })}>
                  <ExternalLink aria-hidden="true" /> Ver
                </a>
              </div>
            </div>
            {ticket.estimateDecision && (
              <p className={cn('mt-3 rounded-md px-3 py-2 text-xs', ticket.estimateDecision === 'APPROVED' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
                Presupuesto {ticket.estimateDecision === 'APPROVED' ? 'aprobado' : 'rechazado'} {ticket.estimateDecidedBy === 'CUSTOMER' ? 'por el cliente desde su enlace' : 'en mesón'}
                {ticket.estimateDecidedAt ? ` · ${formatMoment(ticket.estimateDecidedAt)}` : ''}
              </p>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-4 text-sm shadow-card" aria-label="Cobro">
            <div className="flex items-center gap-2">
              <Receipt className="size-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold">Cobro</h2>
            </div>
            {ticket.salesOrder ? (
              <div className="mt-3 space-y-2">
                <p>
                  Nota de venta{' '}
                  <Link href={`/dashboard/sales/orders/${ticket.salesOrder.id}`} className="font-medium underline-offset-2 hover:underline">
                    N° {ticket.salesOrder.folio}
                  </Link>
                </p>
                <Link href={`/dashboard/sales/new?orderId=${ticket.salesOrder.id}`} className={cn(buttonVariants({ size: 'sm' }), 'w-full')}>
                  Emitir boleta o factura
                </Link>
              </div>
            ) : ticket.warranty && totals.total === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Reparación en garantía sin cobro.</p>
            ) : !ticket.warranty && ticket.estimateDecision !== 'APPROVED' ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {ticket.estimateDecision === 'REJECTED' ? 'El cliente rechazó el presupuesto: no hay reparación que cobrar.' : 'Disponible cuando el cliente apruebe el presupuesto.'}
              </p>
            ) : canWrite && canSell && ticket.status !== 'CANCELLED' ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">Genera la nota de venta con el presupuesto: los repuestos quedan reservados y desde ahí emites la boleta o factura.</p>
                <select aria-label="Bodega de los repuestos" className={nativeSelectClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                  ))}
                </select>
                <select aria-label="Forma de pago" className={nativeSelectClass} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>{PAYMENT_METHOD_LABELS[method]}</option>
                  ))}
                </select>
                <Button type="button" size="sm" className="w-full" disabled={busy || lines.length === 0 || linesDirty} onClick={() => run(() => createServiceSalesOrderAction(ticket.id, { warehouseId, paymentMethod }))}>
                  <Wrench className="size-3.5" aria-hidden="true" /> Generar nota de venta
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Ventas genera el cobro de esta orden.</p>
            )}
          </section>
        </aside>
      </div>

      <Dialog open={transition !== null} onOpenChange={(open) => !open && !busy && setTransition(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{transition ? transitionLabel(ticket.status, transition) : ''}</DialogTitle>
            <DialogDescription>
              {transition === 'WAITING_APPROVAL'
                ? `El cliente verá el presupuesto por ${formatCurrency(totals.total)} (IVA incluido) en su enlace y podrá aprobarlo o rechazarlo.`
                : transition === 'DELIVERED'
                  ? 'Confirma que el cliente retiró el equipo.'
                  : 'Puedes dejar una nota que queda en la bitácora.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <textarea aria-label="Nota" className={textareaClass} rows={3} maxLength={1000} value={transitionNote} onChange={(e) => setTransitionNote(e.target.value)} placeholder="Nota (opcional)" />
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={transitionVisible} onCheckedChange={setTransitionVisible} label="Visible para el cliente" />
              Visible para el cliente en su enlace
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTransition(null)}>Cancelar</Button>
            <Button
              type="button"
              variant={transition === 'CANCELLED' ? 'destructive' : 'default'}
              disabled={busy}
              onClick={() =>
                transition &&
                run(() => changeServiceStatusAction(ticket.id, { status: transition, note: transitionNote.trim() || undefined, visibleToCustomer: transitionVisible }), () => setTransition(null))
              }
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
