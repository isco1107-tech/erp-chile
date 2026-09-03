'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { QrCode, Plus, Trash2, Ticket, TicketCheck, Wallet, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/KpiCard';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { PaymentStatusBadge, StatusBadge } from '@/components/ui/StatusBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/chile/tax';
import TicketingLinkButton from './TicketingLinkButton';
import {
  checkInTicketAction,
  confirmTicketPaymentAction,
  createTicketTypeAction,
  deleteTicketTypeAction,
  getTicketingSummaryAction,
  listProjectsForSelectAction,
  listTicketSalesAction,
  listTicketTypesAction,
  updateTicketTypeAction,
} from '@/modules/ticketing/actions/ticketing.actions';
import type { ProjectSelectOption, TicketingSummaryRow, TicketSaleWithType } from '@/modules/ticketing/services/ticketing.service';
import type { TicketType } from '@prisma/client';

const EMPTY_TYPE_FORM = { name: '', price: '', quantityAvailable: '' };

export default function TicketingDashboardClient({ canWrite }: { canWrite: boolean }) {
  const [projects, setProjects] = useState<ProjectSelectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [summary, setSummary] = useState<TicketingSummaryRow[]>([]);
  const [sales, setSales] = useState<TicketSaleWithType[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE_FORM);
  const [savingType, setSavingType] = useState(false);
  const [paymentSale, setPaymentSale] = useState<TicketSaleWithType | null>(null);
  const [paidAmountInput, setPaidAmountInput] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [checkInCode, setCheckInCode] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);

  useEffect(() => {
    (async () => {
      const result = await listProjectsForSelectAction();
      if (result.success) {
        setProjects(result.data);
        if (result.data.length > 0) setProjectId(result.data[0]!.id);
      } else {
        toast.error(result.error);
      }
    })();
  }, []);

  async function loadProjectData(pid: string) {
    setLoading(true);
    const [typesResult, summaryResult, salesResult] = await Promise.all([
      listTicketTypesAction(pid),
      getTicketingSummaryAction(pid),
      listTicketSalesAction({ projectId: pid }),
    ]);
    if (typesResult.success) setTicketTypes(typesResult.data);
    else toast.error(typesResult.error);
    if (summaryResult.success) setSummary(summaryResult.data);
    else toast.error(summaryResult.error);
    if (salesResult.success) setSales(salesResult.data);
    else toast.error(salesResult.error);
    setLoading(false);
  }

  useEffect(() => {
    if (projectId) loadProjectData(projectId);
  }, [projectId]);

  async function handleCreateType(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setSavingType(true);
    try {
      const result = await createTicketTypeAction({
        projectId,
        name: typeForm.name,
        price: Number(typeForm.price) || 0,
        quantityAvailable: typeForm.quantityAvailable ? Number(typeForm.quantityAvailable) : null,
        salesOpen: true,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      setTypeForm(EMPTY_TYPE_FORM);
      loadProjectData(projectId);
    } finally {
      setSavingType(false);
    }
  }

  async function handleToggleOpen(tt: TicketType) {
    const result = await updateTicketTypeAction(tt.id, { salesOpen: !tt.salesOpen });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    loadProjectData(projectId);
  }

  async function handleDeleteType(tt: TicketType) {
    if (!confirm(`¿Eliminar el tipo de entrada "${tt.name}"?`)) return;
    const result = await deleteTicketTypeAction(tt.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    loadProjectData(projectId);
  }

  function openPaymentDialog(sale: TicketSaleWithType) {
    setPaymentSale(sale);
    setPaidAmountInput(String(sale.totalAmount));
  }

  async function handleConfirmPayment() {
    if (!paymentSale) return;
    setSavingPayment(true);
    try {
      const result = await confirmTicketPaymentAction(paymentSale.id, { paidAmount: Number(paidAmountInput) || 0 });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      setPaymentSale(null);
      loadProjectData(projectId);
    } finally {
      setSavingPayment(false);
    }
  }

  async function handleCheckIn() {
    if (!checkInCode.trim()) return;
    setCheckingIn(true);
    try {
      const result = await checkInTicketAction(checkInCode.trim());
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      setCheckInCode('');
      loadProjectData(projectId);
    } finally {
      setCheckingIn(false);
    }
  }

  const totalConfirmedRevenue = summary.reduce((sum, s) => sum + s.revenueConfirmed, 0);
  const totalSold = summary.reduce((sum, s) => sum + s.quantitySold, 0);
  const totalConfirmed = summary.reduce((sum, s) => sum + s.quantityConfirmed, 0);
  const totalCheckedIn = summary.reduce((sum, s) => sum + s.checkedIn, 0);

  const columns: DataTableColumn<TicketSaleWithType>[] = [
    { id: 'buyer', header: 'Comprador', cell: (s) => (
      <div>
        <p className="font-medium">{s.buyerName}</p>
        <p className="text-xs text-muted-foreground">{s.buyerEmail}</p>
      </div>
    ) },
    { id: 'type', header: 'Tipo', cell: (s) => s.ticketType.name },
    { id: 'quantity', header: 'Cant.', cell: (s) => s.quantity, align: 'right' },
    { id: 'total', header: 'Total', cell: (s) => formatCurrency(s.totalAmount), align: 'right' },
    { id: 'status', header: 'Pago', cell: (s) => <PaymentStatusBadge status={s.paymentStatus} /> },
    { id: 'checkin', header: 'Check-in', cell: (s) => (s.checkedInAt ? <StatusBadge tone="success">Ingresó</StatusBadge> : <StatusBadge tone="neutral">Pendiente</StatusBadge>) },
    { id: 'actions', header: '', cell: (s) => (
      canWrite && s.paymentStatus !== 'PAID' ? (
        <Button size="sm" variant="outline" onClick={() => openPaymentDialog(s)}>Confirmar pago</Button>
      ) : null
    ) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-56">
          <Label htmlFor="project-select">Proyecto/certamen</Label>
          <select
            id="project-select"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-input bg-muted px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        {canWrite && projectId && <TicketingLinkButton projectId={projectId} />}
      </div>

      {!projectId && <p className="text-sm text-muted-foreground">No hay proyectos/certámenes creados todavía.</p>}

      {projectId && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard label="Entradas vendidas (reservadas)" value={String(totalSold)} icon={Ticket} />
            <KpiCard label="Entradas confirmadas (pagadas)" value={String(totalConfirmed)} icon={TicketCheck} tone="success" />
            <KpiCard label="Ingresos confirmados" value={formatCurrency(totalConfirmedRevenue)} icon={Wallet} tone="success" />
            <KpiCard label="Check-in realizado" value={String(totalCheckedIn)} icon={ScanLine} />
          </div>

          <Card>
            <CardHeader><CardTitle>Tipos de entrada</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {ticketTypes.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay tipos de entrada para este proyecto.</p>}
              {ticketTypes.map((tt) => {
                const row = summary.find((s) => s.ticketTypeId === tt.id);
                return (
                  <div key={tt.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                    <div>
                      <p className="font-medium">{tt.name} — {formatCurrency(tt.price)}</p>
                      <p className="text-xs text-muted-foreground">
                        Vendidas: {row?.quantitySold ?? 0}{tt.quantityAvailable !== null ? ` / ${tt.quantityAvailable}` : ''} · Confirmadas: {row?.quantityConfirmed ?? 0}
                      </p>
                    </div>
                    {canWrite && (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleToggleOpen(tt)}>
                          {tt.salesOpen ? 'Cerrar venta' : 'Abrir venta'}
                        </Button>
                        <Button size="icon-sm" variant="ghost" onClick={() => handleDeleteType(tt)}><Trash2 className="size-4" /></Button>
                      </div>
                    )}
                  </div>
                );
              })}

              {canWrite && (
                <form onSubmit={handleCreateType} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
                  <div className="w-40">
                    <Label htmlFor="tt-name">Nombre</Label>
                    <Input id="tt-name" value={typeForm.name} onChange={(e) => setTypeForm((f) => ({ ...f, name: e.target.value }))} required />
                  </div>
                  <div className="w-32">
                    <Label htmlFor="tt-price">Precio</Label>
                    <Input id="tt-price" type="number" min={0} value={typeForm.price} onChange={(e) => setTypeForm((f) => ({ ...f, price: e.target.value }))} required />
                  </div>
                  <div className="w-32">
                    <Label htmlFor="tt-qty">Cupo (opcional)</Label>
                    <Input id="tt-qty" type="number" min={1} value={typeForm.quantityAvailable} onChange={(e) => setTypeForm((f) => ({ ...f, quantityAvailable: e.target.value }))} />
                  </div>
                  <Button type="submit" disabled={savingType}><Plus /> Agregar</Button>
                </form>
              )}
            </CardContent>
          </Card>

          {canWrite && (
            <Card>
              <CardHeader><CardTitle>Control de acceso (check-in)</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-end gap-2">
                  <div className="max-w-sm flex-1">
                    <Label htmlFor="checkin-code">Código QR de la entrada</Label>
                    <Input id="checkin-code" value={checkInCode} onChange={(e) => setCheckInCode(e.target.value)} placeholder="Escanea o pega el código" />
                  </div>
                  <Button onClick={handleCheckIn} disabled={checkingIn || !checkInCode.trim()}>
                    <QrCode /> Registrar ingreso
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <DataTable
            columns={columns}
            data={sales}
            getRowId={(s) => s.id}
            loading={loading}
            emptyTitle="Sin ventas todavía"
            emptyDescription="Comparte el link público de venta para recibir compras."
          />
        </>
      )}

      <Dialog open={paymentSale !== null} onOpenChange={(open) => { if (!open) setPaymentSale(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar pago de {paymentSale?.buyerName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Total de la orden: {paymentSale ? formatCurrency(paymentSale.totalAmount) : ''}</p>
            <div className="space-y-1.5">
              <Label htmlFor="paid-amount">Monto pagado (CLP)</Label>
              <Input id="paid-amount" type="number" min={0} value={paidAmountInput} onChange={(e) => setPaidAmountInput(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentSale(null)}>Cancelar</Button>
            <Button onClick={handleConfirmPayment} disabled={savingPayment}>Confirmar pago</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
