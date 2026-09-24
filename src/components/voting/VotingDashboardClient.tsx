'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Trophy, Vote, Wallet } from 'lucide-react';
import PaymentChannelFields, { DEFAULT_PAYMENT_CHANNEL } from '@/components/treasury/PaymentChannelFields';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/KpiCard';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { PaymentStatusBadge } from '@/components/ui/StatusBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/chile/tax';
import VotingLinkButton from './VotingLinkButton';
import {
  confirmVotePaymentAction,
  getCurrentVotePriceAction,
  getVoteLeaderboardAction,
  listProjectsForSelectAction,
  listVoteOrdersAction,
} from '@/modules/public-voting/actions/public-voting-admin.actions';
import type { ProjectSelectOption, VoteLeaderboardRow, VoteOrderWithCandidate } from '@/modules/public-voting/services/public-voting.service';

export default function VotingDashboardClient({ canWrite }: { canWrite: boolean }) {
  const [projects, setProjects] = useState<ProjectSelectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<VoteLeaderboardRow[]>([]);
  const [orders, setOrders] = useState<VoteOrderWithCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentOrder, setPaymentOrder] = useState<VoteOrderWithCandidate | null>(null);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentChannel, setPaymentChannel] = useState(DEFAULT_PAYMENT_CHANNEL);
  const [savingPayment, setSavingPayment] = useState(false);

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
    const [priceResult, leaderboardResult, ordersResult] = await Promise.all([
      getCurrentVotePriceAction(pid),
      getVoteLeaderboardAction(pid),
      listVoteOrdersAction({ projectId: pid }),
    ]);
    if (priceResult.success) setCurrentPrice(priceResult.data.pricePerVote);
    else toast.error(priceResult.error);
    if (leaderboardResult.success) setLeaderboard(leaderboardResult.data);
    else toast.error(leaderboardResult.error);
    if (ordersResult.success) setOrders(ordersResult.data);
    else toast.error(ordersResult.error);
    setLoading(false);
  }

  useEffect(() => {
    if (projectId) loadProjectData(projectId);
  }, [projectId]);

  function openPaymentDialog(order: VoteOrderWithCandidate) {
    setPaymentOrder(order);
    setPaidAmount(order.totalAmount);
  }

  async function handleConfirmPayment() {
    if (!paymentOrder) return;
    setSavingPayment(true);
    try {
      const result = await confirmVotePaymentAction(paymentOrder.id, {
        paidAmount,
        paymentMethod: paymentChannel.paymentMethod,
        treasuryAccountId: paymentChannel.treasuryAccountId || undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      setPaymentOrder(null);
      loadProjectData(projectId);
    } finally {
      setSavingPayment(false);
    }
  }

  const totalVotesConfirmed = leaderboard.reduce((sum, r) => sum + r.totalVotes, 0);
  const totalRevenueConfirmed = leaderboard.reduce((sum, r) => sum + r.totalRevenue, 0);
  const pendingOrders = orders.filter((o) => o.paymentStatus !== 'PAID').length;

  const columns: DataTableColumn<VoteOrderWithCandidate>[] = [
    { id: 'candidate', header: 'Candidata', cell: (o) => o.candidate.stageName || o.candidate.fullName },
    { id: 'buyer', header: 'Comprador', cell: (o) => o.buyerEmail },
    { id: 'votes', header: 'Votos', cell: (o) => o.voteCount, align: 'right' },
    { id: 'total', header: 'Total', cell: (o) => formatCurrency(o.totalAmount), align: 'right' },
    { id: 'status', header: 'Pago', cell: (o) => <PaymentStatusBadge status={o.paymentStatus} /> },
    { id: 'actions', header: '', cell: (o) => (
      canWrite && o.paymentStatus !== 'PAID' ? (
        <Button size="sm" variant="outline" onClick={() => openPaymentDialog(o)}>Confirmar pago</Button>
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
        {canWrite && projectId && <VotingLinkButton projectId={projectId} currentPrice={currentPrice} />}
      </div>

      {!projectId && <p className="text-sm text-muted-foreground">No hay proyectos/certámenes creados todavía.</p>}

      {projectId && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <KpiCard label="Votos confirmados (pagados)" value={String(totalVotesConfirmed)} icon={Vote} />
            <KpiCard label="Ingresos confirmados" value={formatCurrency(totalRevenueConfirmed)} icon={Wallet} tone="success" />
            <KpiCard label="Órdenes pendientes de pago" value={String(pendingOrders)} icon={Trophy} tone="warning" />
          </div>

          <Card>
            <CardHeader><CardTitle>Ranking en vivo</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {leaderboard.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay votos confirmados.</p>}
              {leaderboard.map((row, i) => (
                <div key={row.candidateId} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                    <span className="font-medium">{row.stageName || row.fullName}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{row.totalVotes} votos</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(row.totalRevenue)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <DataTable
            columns={columns}
            data={orders}
            getRowId={(o) => o.id}
            loading={loading}
            emptyTitle="Sin órdenes todavía"
            emptyDescription="Comparte el link público de votación para recibir compras de votos."
          />
        </>
      )}

      <Dialog open={paymentOrder !== null} onOpenChange={(open) => { if (!open) setPaymentOrder(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar pago de {paymentOrder?.buyerEmail}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Total de la orden: {paymentOrder ? formatCurrency(paymentOrder.totalAmount) : ''}</p>
            <div className="space-y-1.5">
              <Label htmlFor="paid-amount">Monto pagado (CLP)</Label>
              <CurrencyInput id="paid-amount" value={paidAmount} onChange={setPaidAmount} />
            </div>
            {paymentOrder && paidAmount !== paymentOrder.paidAmount && (
              <PaymentChannelFields context="voting" value={paymentChannel} onChange={setPaymentChannel} idPrefix="vote" />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOrder(null)} disabled={savingPayment}>Cancelar</Button>
            <Button onClick={handleConfirmPayment} disabled={savingPayment}>Confirmar pago</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
