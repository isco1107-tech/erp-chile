'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DteType } from '@prisma/client';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/pagination';
import {
  cancelSalesDocumentAction,
  duplicateSalesDocumentAction,
  listSalesDocumentsAction,
} from '@/modules/sales/actions/sales.actions';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';
import { isSubmittedToSii } from '@/modules/sales/cancellation';
import type { SalesDocumentListItem } from '@/modules/sales/services/sales.service';
import { formatCurrency } from '@/lib/chile/tax';

import { useConfirm } from '@/components/ui/confirm-provider';
type SalesRow = SalesDocumentListItem;

const TABS: { key: string; label: string; dteTypes?: DteType[] }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'facturas', label: 'Facturas', dteTypes: ['FACTURA_33', 'FACTURA_EXENTA_34'] },
  { key: 'boletas', label: 'Boletas', dteTypes: ['BOLETA_39'] },
  { key: 'cotizaciones', label: 'Cotizaciones', dteTypes: ['COTIZACION'] },
];

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ISSUED: 'bg-green-600/10 text-green-600',
  CANCELLED: 'bg-destructive/10 text-destructive',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  ISSUED: 'Emitido',
  CANCELLED: 'Anulado',
};

type SortField = 'issueDate' | 'totalAmount';

const DEFAULT_PAGE_SIZE = 25;

export default function SalesHistoryClient() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<number>(DEFAULT_PAGE_SIZE);
  // Orden actual del backend (creación desc) se preserva como default: cambia
  // solo si el usuario hace click en un encabezado ordenable.
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Debounce del texto de búsqueda: evita disparar una consulta paginada al
  // backend en cada tecla.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Cualquier cambio en filtros u orden invalida la página actual: volver a
  // la 1 evita mostrar una página vacía o con contenido inconsistente.
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, tab, sortField, sortDir]);

  function currentDteTypes() {
    return TABS.find((t) => t.key === tab)?.dteTypes;
  }

  async function load() {
    setLoading(true);
    const result = await listSalesDocumentsAction(
      currentDteTypes(),
      undefined,
      debouncedQuery || undefined,
      page,
      pageSize,
      sortField ?? undefined,
      sortField ? sortDir : undefined
    );
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
  }, [debouncedQuery, tab, page, pageSize, sortField, sortDir]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function setPageSize(size: number) {
    setPageSizeState(size);
    setPage(1);
  }

  function toggleSort(field: SortField) {
    if (sortField !== field) {
      setSortField(field);
      setSortDir('desc');
      return;
    }
    setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
  }

  async function handleDuplicate(id: string) {
    const result = await duplicateSalesDocumentAction(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Documento duplicado');
    load();
  }

  async function handleCancel(id: string) {
    if (!await confirm('¿Anular este documento? Esto reingresará el stock descontado.')) return;
    const result = await cancelSalesDocumentAction(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Documento anulado');
    load();
  }

  return (
    <div className="space-y-4 duration-500 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <Button key={t.key} type="button" size="sm" variant={tab === t.key ? 'default' : 'outline'} onClick={() => setTab(t.key)}>
              {t.label}
            </Button>
          ))}
          <Input
            data-tutorial="module-search"
            placeholder="Buscar por RUT o Razón Social"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-64"
          />
        </div>

        <Link href="/dashboard/sales/new" className={buttonVariants({ variant: 'default' })} data-tutorial="module-primary-action">
          Nueva Venta
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-card shadow-card">
        <div className="max-h-[65vh] scroll-smooth overflow-auto">
          <table className="w-full min-w-[880px] table-auto text-sm">
            <thead className="sticky top-0 z-10 bg-muted/95 text-left backdrop-blur-sm">
              <tr>
                <th scope="col" className="p-2 font-medium">Folio</th>
                <th scope="col" className="p-2 font-medium">Tipo DTE</th>
                <th scope="col" className="p-2 font-medium">
                  <button type="button" className="flex items-center gap-1 font-medium" onClick={() => toggleSort('issueDate')}>
                    Fecha
                    {sortField === 'issueDate' && (sortDir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </button>
                </th>
                <th scope="col" className="p-2 font-medium">Cliente</th>
                <th scope="col" className="p-2 font-medium">
                  <button type="button" className="flex items-center gap-1 font-medium" onClick={() => toggleSort('totalAmount')}>
                    Total
                    {sortField === 'totalAmount' && (sortDir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </button>
                </th>
                <th scope="col" className="p-2 font-medium">Estado</th>
                <th scope="col" className="p-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="p-4 text-center text-muted-foreground" colSpan={7}>Cargando...</td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      title={query ? 'Sin resultados para tu búsqueda' : 'Todavía no hay ventas'}
                      description={
                        query
                          ? 'Prueba con otro RUT o razón social.'
                          : 'Emite tu primera boleta o factura para verla aquí.'
                      }
                      action={
                        !query && (
                          <Link href="/dashboard/sales/new" className={buttonVariants({ size: 'sm' })}>
                            Nueva Venta
                          </Link>
                        )
                      }
                    />
                  </td>
                </tr>
              )}
              {!loading && rows.map((doc) => (
                <tr key={doc.id} className="border-t border-border">
                  <td className="p-2 font-mono text-xs">{doc.folio ?? '—'}</td>
                  <td className="p-2">{DTE_TYPE_LABELS[doc.dteType]}</td>
                  <td className="p-2">{new Date(doc.issueDate).toLocaleDateString('es-CL')}</td>
                  <td className="p-2">{doc.contact.rut} — {doc.contact.razonSocial}</td>
                  <td className="p-2">{formatCurrency(doc.totalAmount)}</td>
                  <td className="p-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[doc.status]}`}>
                      {STATUS_LABEL[doc.status]}
                    </span>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/dashboard/sales/${doc.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                        Ver / Imprimir
                      </Link>
                      <Button type="button" size="sm" variant="outline" onClick={() => handleDuplicate(doc.id)}>Duplicar</Button>
                      {doc.status === 'ISSUED' && (
                        isSubmittedToSii(doc) ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled
                            title="Ya enviado al SII: corrígelo emitiendo una Nota de Crédito"
                          >
                            Anular
                          </Button>
                        ) : (
                          <Button type="button" size="sm" variant="destructive" onClick={() => handleCancel(doc.id)}>Anular</Button>
                        )
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

