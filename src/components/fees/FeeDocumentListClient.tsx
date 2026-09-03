'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { PaymentStatus } from '@prisma/client';
import { buttonVariants } from '@/components/ui/button';
import { DataTable, DataTablePrimaryCell, type DataTableColumn } from '@/components/ui/DataTable';
import { usePaginatedList } from '@/hooks/use-paginated-list';
import { listFeeDocumentsAction } from '@/modules/fees/actions/fees.actions';
import type { FeeDocumentWithRelations } from '@/modules/fees/services/fees.service';
import { formatCurrency } from '@/lib/chile/tax';
import { formatRut } from '@/lib/chile/rut';
import DeleteFeeDocumentButton from './DeleteFeeDocumentButton';

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagada',
};

const PAYMENT_STATUS_BADGE: Record<PaymentStatus, string> = {
  UNPAID: 'bg-amber-500/10 text-amber-600',
  PARTIAL: 'bg-blue-500/10 text-blue-600',
  PAID: 'bg-green-600/10 text-green-600',
};

const FILTER_OPTIONS: Array<{ value: PaymentStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Todas' },
  { value: 'UNPAID', label: 'Pendientes' },
  { value: 'PARTIAL', label: 'Pago parcial' },
  { value: 'PAID', label: 'Pagadas' },
];

export default function FeeDocumentListClient({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<FeeDocumentWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PaymentStatus | 'ALL'>('ALL');

  async function load(paymentStatus: PaymentStatus | 'ALL') {
    setLoading(true);
    const result = await listFeeDocumentsAction(paymentStatus === 'ALL' ? {} : { paymentStatus });
    if (result.success) setRows(result.data);
    else toast.error(result.error);
    setLoading(false);
  }

  useEffect(() => {
    load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const { page, setPage, pageSize, setPageSize, pageCount, pageItems, totalItems } = usePaginatedList(rows);

  const columns: DataTableColumn<FeeDocumentWithRelations>[] = [
    {
      id: 'contact',
      header: 'Prestador',
      cell: (row) => (
        <DataTablePrimaryCell title={row.contact.razonSocial} subtitle={formatRut(row.contact.rut)} />
      ),
    },
    { id: 'folio', header: 'Folio', cell: (row) => <span className="font-mono text-xs">{row.folioNumber}</span> },
    { id: 'issueDate', header: 'Fecha', cell: (row) => new Date(row.issueDate).toLocaleDateString('es-CL') },
    { id: 'gross', header: 'Bruto', align: 'right', cell: (row) => formatCurrency(row.grossAmount) },
    { id: 'retention', header: 'Retención', align: 'right', cell: (row) => formatCurrency(row.retentionAmount) },
    { id: 'net', header: 'Líquido', align: 'right', cell: (row) => formatCurrency(row.netToPay) },
    {
      id: 'status',
      header: 'Estado',
      cell: (row) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_STATUS_BADGE[row.paymentStatus]}`}>
          {PAYMENT_STATUS_LABEL[row.paymentStatus]}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Link href={`/dashboard/fees/${row.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Ver
          </Link>
          {canWrite && (
            <DeleteFeeDocumentButton
              documentId={row.id}
              folioNumber={row.folioNumber}
              variant="icon"
              onDeleted={() => load(filter)}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canWrite && (
          <Link href="/dashboard/fees/new" className={buttonVariants({ variant: 'default' })}>
            Registrar Boleta de Honorarios
          </Link>
        )}
      </div>

      <DataTable
        columns={columns}
        data={pageItems}
        getRowId={(row) => row.id}
        loading={loading}
        emptyTitle={filter === 'ALL' ? 'Todavía no hay boletas de honorarios' : 'Sin boletas para este filtro'}
        emptyDescription={
          filter === 'ALL'
            ? 'Registra la primera BHE de tu staff freelance para verla aquí.'
            : 'Prueba con otro filtro de estado de pago.'
        }
        filterSlot={FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === option.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {option.label}
          </button>
        ))}
        pagination={{ page, pageCount, pageSize, totalItems, onPageChange: setPage, onPageSizeChange: setPageSize }}
      />
    </div>
  );
}
