'use client';

/**
 * `DataTable` es un Client Component (necesita hover/estado). Sus `columns`
 * llevan funciones `cell: (row) => ReactNode` — Next.js prohíbe pasar
 * funciones desde un Server Component a un Client Component (no son
 * serializables por el límite RSC). El Dashboard (`dashboard/page.tsx`) es un
 * Server Component que hace las queries a Prisma, así que las columnas con
 * sus `cell` deben definirse ACÁ, del lado cliente — a este componente solo
 * le llegan los datos (serializables: strings, números, Date), nunca
 * funciones. Mismo patrón que `DashboardCharts.tsx` para Recharts.
 */

import type { DteType, DocumentStatus } from '@prisma/client';
import { ReceiptText } from 'lucide-react';
import { DataTable, DataTablePrimaryCell } from '@/components/ui/DataTable';
import { DocumentStatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency } from '@/lib/chile/tax';

const DTE_TYPE_LABELS: Partial<Record<DteType, string>> = {
  FACTURA_33: 'Factura afecta',
  FACTURA_EXENTA_34: 'Factura exenta',
  BOLETA_39: 'Boleta',
  NOTA_CREDITO_61: 'Nota de crédito',
  NOTA_DEBITO_56: 'Nota de débito',
};

export interface RecentSaleRow {
  id: string;
  contact: { razonSocial: string };
  dteType: DteType;
  folio: number | null;
  status: DocumentStatus;
  issueDate: Date;
  totalAmount: number;
}

interface RecentSalesTableProps {
  documents: RecentSaleRow[];
}

export function RecentSalesTable({ documents }: RecentSalesTableProps) {
  return (
    <DataTable
      columns={[
        {
          id: 'contact',
          header: 'Cliente',
          cell: (document) => (
            <DataTablePrimaryCell
              icon={ReceiptText}
              title={document.contact.razonSocial}
              subtitle={`${DTE_TYPE_LABELS[document.dteType] ?? document.dteType} #${document.folio ?? '-'}`}
            />
          ),
        },
        {
          id: 'status',
          header: 'Estado',
          cell: (document) => <DocumentStatusBadge status={document.status} />,
        },
        {
          id: 'date',
          header: 'Fecha',
          cell: (document) => document.issueDate.toLocaleDateString('es-CL'),
        },
        {
          id: 'total',
          header: 'Total',
          align: 'right',
          cell: (document) => formatCurrency(document.totalAmount),
        },
      ]}
      data={documents}
      getRowId={(document) => document.id}
      emptyTitle="No hay ventas emitidas en el período"
    />
  );
}
