'use client';

/**
 * Galería interna de los componentes del nuevo tema claro (tokens, KpiCard,
 * ChartCard, StatusBadge, ProgressRow, ActionCard, DataTable). Ruta temporal
 * para que el usuario revise cada variante antes de aprobar que el patrón se
 * replique al resto de los módulos (ventas, compras, inventario, POS...).
 *
 * Nombrada `ui-demo` (sin guión bajo inicial) a propósito: Next.js App Router
 * trata cualquier carpeta prefijada con `_` como "carpeta privada", excluida
 * por completo del ruteo (no genera una URL navegable). El encargo pedía
 * explícitamente que esta vista fuera navegable, así que ese prefijo
 * -aunque lo sugería el brief como ejemplo- habría roto justamente el
 * requisito que pedía cumplir. Se puede borrar esta carpeta completa sin
 * tocar nada más cuando el usuario ya no la necesite.
 */

import { useState } from 'react';
import {
  CircleDollarSign,
  Receipt,
  Users2,
  ShoppingCart,
  PackageSearch,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { KpiCard } from '@/components/ui/KpiCard';
import { ChartCard, ChartLegendItem, ChartTooltip } from '@/components/ui/ChartCard';
import { StatusBadge, DOCUMENT_STATUS_BADGE, PAYMENT_STATUS_BADGE, PURCHASE_APPROVAL_STATUS_BADGE } from '@/components/ui/StatusBadge';
import { ProgressRow } from '@/components/ui/ProgressRow';
import { ActionCard } from '@/components/ui/ActionCard';
import { DataTable, DataTablePrimaryCell } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton, CardsPageSkeleton } from '@/components/ui/skeleton';

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const WEEKLY_SALES = [
  { label: 'Sem 1', ventas: 4200000, meta: 3800000 },
  { label: 'Sem 2', ventas: 3900000, meta: 3800000 },
  { label: 'Sem 3', ventas: 5100000, meta: 3800000 },
  { label: 'Sem 4', ventas: 4700000, meta: 3800000 },
  { label: 'Sem 5', ventas: 5600000, meta: 3800000 },
  { label: 'Sem 6', ventas: 6100000, meta: 3800000 },
];

const PAYMENT_MIX = [
  { name: 'Débito', value: 42, color: 'var(--chart-1)' },
  { name: 'Crédito', value: 28, color: 'var(--chart-2)' },
  { name: 'Efectivo', value: 20, color: 'var(--chart-3)' },
  { name: 'Transferencia', value: 10, color: 'var(--chart-4)' },
];

const CATEGORY_MIX = [
  { label: 'Abarrotes', value: 68 },
  { label: 'Bebidas', value: 52 },
  { label: 'Limpieza', value: 34 },
  { label: 'Lácteos', value: 21 },
];

interface DemoRow {
  id: string;
  cliente: string;
  folio: string;
  sku: string;
  fecha: string;
  total: number;
  estado: 'DRAFT' | 'ISSUED' | 'CANCELLED';
}

const DEMO_ROWS: DemoRow[] = [
  { id: '1', cliente: 'Constructora Andina SpA', folio: 'F-0001284', sku: 'SKU-CEM-025', fecha: '18-08-2026', total: 1250000, estado: 'ISSUED' },
  { id: '2', cliente: 'María José Muñoz Silva', folio: 'B-0009873', sku: 'SKU-FER-118', fecha: '18-08-2026', total: 38500, estado: 'ISSUED' },
  { id: '3', cliente: 'Distribuidora Los Andes Ltda.', folio: 'F-0001285', sku: 'SKU-ELE-062', fecha: '17-08-2026', total: 940000, estado: 'DRAFT' },
  { id: '4', cliente: 'Pedro Antonio Rojas Vega', folio: 'B-0009874', sku: 'SKU-HOG-004', fecha: '17-08-2026', total: 15990, estado: 'CANCELLED' },
  { id: '5', cliente: 'Comercial Sur Limitada', folio: 'F-0001286', sku: 'SKU-CEM-031', fecha: '16-08-2026', total: 2180000, estado: 'ISSUED' },
  { id: '6', cliente: 'Javiera Ignacia Torres Paz', folio: 'B-0009875', sku: 'SKU-FER-092', fecha: '16-08-2026', total: 27300, estado: 'ISSUED' },
];

const PAGE_SIZE = 3;

export default function UiDemoPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(DEMO_ROWS.length / pageSize));
  const pageRows = DEMO_ROWS.slice((page - 1) * pageSize, page * pageSize);
  const [showLoading, setShowLoading] = useState(false);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Galería de componentes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vista interna con datos de ejemplo, no forma parte de la navegación del ERP. Muestra cada variante de los
          componentes base del tema claro.
        </p>
      </div>

      <Section title="KpiCard" description="Tarjeta de indicador: label + ícono tintado, cifra grande, tendencia opcional.">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Ventas del día" value="$ 1.284.500" icon={CircleDollarSign} tone="accent" trend="+18.2%" trendDirection="up" />
          <KpiCard label="Ticket promedio" value="$ 24.900" icon={Receipt} tone="danger" trend="-4.6%" trendDirection="down" />
          <KpiCard label="Clientes nuevos" value="12" icon={Users2} tone="info" trend="+0.3%" trendDirection="neutral" hint="vs. semana anterior" />
          <KpiCard label="Documentos emitidos" value="86" icon={ShoppingCart} tone="warning" />
        </div>
      </Section>

      <Section title="ChartCard" description="Contenedor estándar para gráficos Recharts: barras y donut, con las reglas del brief.">
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 lg:col-span-8">
            <ChartCard
              title="Ventas semanales"
              subtitle="Últimas 6 semanas"
              legend={
                <>
                  <ChartLegendItem color="var(--primary)" label="Ventas" />
                  <ChartLegendItem color="#E4E7EC" label="Meta" />
                </>
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={WEEKLY_SALES} barGap={4}>
                  <CartesianGrid vertical={false} stroke="#EAECF0" strokeDasharray="4 4" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} width={40} />
                  <Tooltip content={ChartTooltip} cursor={{ fill: 'var(--muted)' }} />
                  <Bar dataKey="ventas" name="Ventas" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={24} />
                  <Bar dataKey="meta" name="Meta" fill="#E4E7EC" radius={[6, 6, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="col-span-12 lg:col-span-4">
            <ChartCard title="Medios de pago" subtitle="Mix del mes">
              <div className="relative h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={PAYMENT_MIX} dataKey="value" nameKey="name" innerRadius={70} outerRadius={100} paddingAngle={3} strokeWidth={0}>
                      {PAYMENT_MIX.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold tabular-nums text-foreground">100%</span>
                  <span className="text-xs text-muted-foreground">del mes</span>
                </div>
              </div>
            </ChartCard>
            <div className="mt-3 space-y-2 rounded-lg border border-border bg-card p-3 shadow-card">
              {PAYMENT_MIX.map((entry) => (
                <div key={entry.name} className="flex items-center justify-between text-xs">
                  <ChartLegendItem color={entry.color} label={entry.name} />
                  <span className="font-semibold tabular-nums text-foreground">{entry.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="StatusBadge" description="Pill de estado, mapeado a los enums reales de Prisma (DocumentStatus, PaymentStatus, PurchaseApprovalStatus).">
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-5 shadow-card sm:grid-cols-3">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">Documentos de venta</p>
            <div className="flex flex-wrap gap-2">
              {Object.values(DOCUMENT_STATUS_BADGE).map((s) => (
                <StatusBadge key={s.label} tone={s.tone}>
                  {s.label}
                </StatusBadge>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">Pagos (tesorería)</p>
            <div className="flex flex-wrap gap-2">
              {Object.values(PAYMENT_STATUS_BADGE).map((s) => (
                <StatusBadge key={s.label} tone={s.tone}>
                  {s.label}
                </StatusBadge>
              ))}
              <StatusBadge tone="danger">Vencido</StatusBadge>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">Aprobación de compras</p>
            <div className="flex flex-wrap gap-2">
              {Object.values(PURCHASE_APPROVAL_STATUS_BADGE).map((s) => (
                <StatusBadge key={s.label} tone={s.tone}>
                  {s.label}
                </StatusBadge>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="ProgressRow" description="Fila label + barra + porcentaje, para mix de participación.">
        <div className="max-w-xl space-y-3 rounded-lg border border-border bg-card p-5 shadow-card">
          {CATEGORY_MIX.map((row, index) => (
            <ProgressRow key={row.label} label={row.label} value={row.value} color={`var(--chart-${index + 1})`} />
          ))}
        </div>
      </Section>

      <Section title="ActionCard" description="Tarjeta de acento sólido para una acción real y relevante.">
        <div className="max-w-sm">
          <ActionCard
            title="Reponer stock crítico"
            description="4 productos bajo el mínimo de bodega"
            actionLabel="Ir a inventario"
            href="/dashboard/inventory"
            icon={PackageSearch}
          />
        </div>
      </Section>

      <Section title="DataTable" description="Tabla con buscador, paginación real (client-side) y celda de identidad.">
        <DataTable
          columns={[
            {
              id: 'cliente',
              header: 'Cliente',
              cell: (row) => <DataTablePrimaryCell icon={Receipt} title={row.cliente} subtitle={`${row.folio} · ${row.sku}`} />,
            },
            { id: 'estado', header: 'Estado', cell: (row) => <StatusBadge tone={DOCUMENT_STATUS_BADGE[row.estado].tone}>{DOCUMENT_STATUS_BADGE[row.estado].label}</StatusBadge> },
            { id: 'fecha', header: 'Fecha', cell: (row) => row.fecha },
            { id: 'total', header: 'Total', align: 'right', cell: (row) => `$ ${row.total.toLocaleString('es-CL')}` },
          ]}
          data={pageRows}
          getRowId={(row) => row.id}
          emptyTitle="Sin resultados"
          pagination={{
            page,
            pageCount,
            pageSize,
            totalItems: DEMO_ROWS.length,
            onPageChange: setPage,
            onPageSizeChange: (size) => {
              setPageSize(size);
              setPage(1);
            },
          }}
        />
      </Section>

      <Section title="EmptyState" description="Vacío reutilizable: ilustración, título, descripción y CTA opcional.">
        <div className="rounded-lg border border-border bg-card shadow-card">
          <EmptyState
            title="No hay resultados para tu búsqueda"
            description="Ajusta los filtros o el término buscado e inténtalo de nuevo."
            actionLabel="Limpiar filtros"
            onAction={() => {}}
          />
        </div>
      </Section>

      <Section title="Skeleton" description="Estados de carga: bloques con animate-pulse respetando la forma del contenido real.">
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowLoading((v) => !v)}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-accent-hover"
          >
            {showLoading ? 'Ocultar' : 'Mostrar'} vista de carga
          </button>
          {showLoading ? (
            <CardsPageSkeleton cards={4} />
          ) : (
            <div className="flex gap-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
