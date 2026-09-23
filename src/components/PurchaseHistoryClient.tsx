'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/pagination';
import {
  approvePurchaseDocumentAction,
  cancelPurchaseDocumentAction,
  listPurchaseDocumentsAction,
  rejectPurchaseDocumentAction,
} from '@/modules/purchases/actions/purchases.actions';
import { PURCHASE_DOCUMENT_TYPE_LABELS } from '@/modules/purchases/schema';
import type { PurchaseDocumentListItem } from '@/modules/purchases/services/purchases.service';
import { formatCurrency } from '@/lib/chile/tax';

import { useConfirm } from '@/components/ui/confirm-provider';
const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ISSUED: 'bg-green-600/10 text-green-600',
  CANCELLED: 'bg-destructive/10 text-destructive',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  ISSUED: 'Registrado',
  CANCELLED: 'Anulado',
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagado',
};

const DEFAULT_PAGE_SIZE = 25;

export default function PurchaseHistoryClient({ canApprove }: { canApprove: boolean }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<PurchaseDocumentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<number>(DEFAULT_PAGE_SIZE);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  async function load() {
    setLoading(true);
    const result = await listPurchaseDocumentsAction(undefined, debouncedQuery || undefined, page, pageSize);
    if (result.success) {
      setRows(result.data.items);
      setTotal(result.data.total);
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, page, pageSize]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function setPageSize(size: number) {
    setPageSizeState(size);
    setPage(1);
  }

  async function handleCancel(id: string) {
    if (!await confirm('¿Anular este documento de compra?')) return;
    const result = await cancelPurchaseDocumentAction(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Documento anulado');
    load();
  }

  async function handleApprove(id: string) {
    if (!await confirm('¿Aprobar esta compra? Se emitirá y afectará el inventario.')) return;
    setBusyId(id);
    try {
      const result = await approvePurchaseDocumentAction(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Compra aprobada');
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    const notes = prompt('Motivo del rechazo (opcional):') ?? undefined;
    setBusyId(id);
    try {
      const result = await rejectPurchaseDocumentAction(id, { notes: notes || undefined });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Compra rechazada');
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4 duration-500 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          data-tutorial="module-search"
          placeholder="Buscar por RUT o Razón Social"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-64"
        />
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/purchases/orders" className={buttonVariants({ variant: 'outline' })}>
            Órdenes de Compra
          </Link>
          <Link href="/dashboard/purchases/new" className={buttonVariants({ variant: 'default' })} data-tutorial="module-primary-action">
            Nueva Factura de Proveedor
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card shadow-card">
        <div className="max-h-[65vh] scroll-smooth overflow-auto">
        <table className="w-full min-w-[920px] table-auto text-sm">
          <thead className="sticky top-0 z-10 bg-muted/95 text-left backdrop-blur-sm">
            <tr>
              <th scope="col" className="p-2 font-medium">Folio</th>
              <th scope="col" className="p-2 font-medium">Tipo</th>
              <th scope="col" className="p-2 font-medium">Fecha</th>
              <th scope="col" className="p-2 font-medium">Proveedor</th>
              <th scope="col" className="p-2 font-medium">Total</th>
              <th scope="col" className="p-2 font-medium">Saldo</th>
              <th scope="col" className="p-2 font-medium">Estado</th>
              <th scope="col" className="p-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="p-4 text-center text-muted-foreground" colSpan={8}>Cargando...</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <EmptyState
                    title={query ? 'Sin resultados para tu búsqueda' : 'Todavía no hay compras'}
                    description={
                      query
                        ? 'Prueba con otro RUT o razón social.'
                        : 'Registra tu primera factura de proveedor para verla aquí.'
                    }
                    action={
                      !query && (
                        <Link href="/dashboard/purchases/new" className={buttonVariants({ size: 'sm' })}>
                          Nueva Factura de Proveedor
                        </Link>
                      )
                    }
                  />
                </td>
              </tr>
            )}
            {!loading && rows.map((doc) => (
              <tr key={doc.id} className="border-t border-border">
                <td className="p-2 font-mono text-xs">{doc.folio}</td>
                <td className="p-2">{PURCHASE_DOCUMENT_TYPE_LABELS[doc.documentType]}</td>
                <td className="p-2">{new Date(doc.issueDate).toLocaleDateString('es-CL')}</td>
                <td className="p-2">{doc.contact.rut} — {doc.contact.razonSocial}</td>
                <td className="p-2">{formatCurrency(doc.totalAmount)}</td>
                <td className="p-2">{formatCurrency(doc.totalAmount - doc.paidAmount)}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[doc.status]}`}>
                      {STATUS_LABEL[doc.status]}
                    </span>
                    {doc.status === 'ISSUED' && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                        {PAYMENT_STATUS_LABEL[doc.paymentStatus]}
                      </span>
                    )}
                    {doc.approvalStatus === 'PENDING' && (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                        Pendiente de aprobación
                      </span>
                    )}
                    {doc.approvalStatus === 'REJECTED' && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        Rechazada
                      </span>
                    )}
                    {doc.matchStatus === 'MISMATCHED' && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        No coincide con OC
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/dashboard/purchases/${doc.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                      Ver
                    </Link>
                    {canApprove && doc.approvalStatus === 'PENDING' && (
                      <>
                        <Button type="button" size="sm" disabled={busyId === doc.id} onClick={() => handleApprove(doc.id)}>
                          Aprobar
                        </Button>
                        <Button type="button" size="sm" variant="destructive" disabled={busyId === doc.id} onClick={() => handleReject(doc.id)}>
                          Rechazar
                        </Button>
                      </>
                    )}
                    {doc.status === 'ISSUED' && doc.paidAmount === 0 && (
                      <Button type="button" size="sm" variant="destructive" onClick={() => handleCancel(doc.id)}>Anular</Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <Pagination
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalItems={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
