'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { InventoryMovement, Warehouse } from '@prisma/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import StockMovementForm from './StockMovementForm';
import {
  createWarehouseAction,
  listMovementsAction,
  listStockByWarehouseAction,
  listWarehousesAction,
} from '@/modules/inventory/actions/inventory.actions';
import { listProductsAction } from '@/modules/inventory/actions/products.actions';
import type { StockByWarehouseRow } from '@/modules/inventory/services/stock.service';
import type { ProductWithStock } from '@/modules/inventory/services/products.service';
import { formatCurrency } from '@/lib/chile/tax';
import type { KardexRow } from '@/modules/inventory/services/stock.service';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { TAX_GLOSSARY } from '@/lib/chile/glossary';

const MOVEMENT_LABELS: Record<InventoryMovement['type'], string> = {
  PURCHASE_IN: 'Entrada por Compra',
  ADJUSTMENT_IN: 'Entrada por Ajuste',
  SALE_OUT: 'Salida por Venta',
  ADJUSTMENT_OUT: 'Salida por Ajuste',
  TRANSFER: 'Transferencia',
};

export default function InventoryClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<StockByWarehouseRow[]>([]);
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [newWarehouse, setNewWarehouse] = useState({ name: '', code: '' });
  const [creatingWarehouse, setCreatingWarehouse] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<{ id: string; label: string } | null>(null);
  const [movements, setMovements] = useState<KardexRow[]>([]);
  /** Bodega del kardex abierto: con varias bodegas el kardex es de UNA a la vez (el saldo corre por bodega). */
  const [kardexWarehouse, setKardexWarehouse] = useState('');
  const [loadingMovements, setLoadingMovements] = useState(false);

  async function loadStock(q?: string, wId?: string) {
    setLoading(true);
    const result = await listStockByWarehouseAction(q, wId || undefined);
    if (result.success) setRows(result.data);
    else toast.error(result.error);
    setLoading(false);
  }

  async function loadWarehouses() {
    const result = await listWarehousesAction();
    if (result.success) setWarehouses(result.data);
  }

  async function loadProducts() {
    const result = await listProductsAction();
    if (result.success) setProducts(result.data);
  }

  useEffect(() => {
    loadWarehouses();
    loadProducts();
  }, []);

  // Deep-link desde la paleta de comandos: "+ Entrada de Stock" abre el
  // formulario de movimiento directamente.
  useEffect(() => {
    if (searchParams.get('openStockForm')) {
      setShowMovementForm(true);
      router.replace('/dashboard/inventory');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => loadStock(query || undefined, warehouseId), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, warehouseId]);

  async function handleMovementSaved() {
    setShowMovementForm(false);
    await Promise.all([loadStock(query || undefined, warehouseId), loadProducts()]);
    if (selectedProduct) handleSelectProduct(selectedProduct.id, selectedProduct.label);
  }

  async function handleCreateWarehouse() {
    if (!newWarehouse.name.trim() || !newWarehouse.code.trim()) return;
    setCreatingWarehouse(true);
    try {
      const result = await createWarehouseAction({ name: newWarehouse.name.trim(), code: newWarehouse.code.trim() });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Bodega creada');
      setNewWarehouse({ name: '', code: '' });
      await loadWarehouses();
    } finally {
      setCreatingWarehouse(false);
    }
  }

  async function handleSelectProduct(productId: string, label: string, forWarehouse?: string) {
    // Con más de una bodega no se mezclan: el kardex abre en la bodega filtrada arriba (o la principal).
    const preferred = forWarehouse ?? kardexWarehouse ?? '';
    const chosen = warehouses.length > 1 ? (warehouses.some((entry) => entry.id === preferred) ? preferred : warehouses.some((entry) => entry.id === warehouseId) ? warehouseId : (warehouses.find((entry) => entry.isDefault) ?? warehouses[0])!.id) : '';
    setKardexWarehouse(chosen);
    setSelectedProduct({ id: productId, label });
    setLoadingMovements(true);
    const result = await listMovementsAction(productId, chosen || undefined);
    if (result.success) setMovements(result.data);
    else toast.error(result.error);
    setLoadingMovements(false);
  }

  return (
    <div className="space-y-4 duration-500 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            data-tutorial="module-search"
            placeholder="Buscar por SKU o Nombre"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-64"
          />
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="">Todas las bodegas</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-wrap gap-1">
            <Input
              placeholder="Nombre bodega"
              value={newWarehouse.name}
              onChange={(e) => setNewWarehouse((s) => ({ ...s, name: e.target.value }))}
              className="h-7 w-32 text-xs"
            />
            <Input
              placeholder="Código"
              value={newWarehouse.code}
              onChange={(e) => setNewWarehouse((s) => ({ ...s, code: e.target.value }))}
              className="h-7 w-20 text-xs"
            />
            <Button type="button" size="xs" variant="outline" disabled={creatingWarehouse} onClick={handleCreateWarehouse}>
              + Bodega
            </Button>
          </div>

          <Button type="button" onClick={() => setShowMovementForm((s) => !s)}>
            {showMovementForm ? 'Cerrar formulario' : 'Ajuste de Stock / Entrada Directa'}
          </Button>
        </div>
      </div>

      {showMovementForm && (
        <StockMovementForm
          products={products}
          warehouses={warehouses}
          onSaved={handleMovementSaved}
          onCancel={() => setShowMovementForm(false)}
        />
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-card">
        <table className="w-full min-w-[760px] table-auto text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th scope="col" className="p-2 font-medium">Producto</th>
              <th scope="col" className="p-2 font-medium">Bodega</th>
              <th scope="col" className="p-2 font-medium">Cantidad</th>
              <th scope="col" className="p-2 font-medium">
                PMP
                <InfoTooltip text={TAX_GLOSSARY.pmp} />
              </th>
              <th scope="col" className="p-2 font-medium">Valorizado</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="p-4 text-center text-muted-foreground" colSpan={5}>Cargando...</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    title={query || warehouseId ? 'Sin existencias para tu búsqueda' : 'Todavía no hay existencias registradas'}
                    description={
                      query || warehouseId
                        ? 'Prueba con otro SKU, nombre o bodega.'
                        : 'Registra una entrada de stock o una compra para ver existencias aquí.'
                    }
                    action={
                      !query && !warehouseId && (
                        <Button type="button" size="sm" onClick={() => setShowMovementForm(true)}>
                          Ajuste de Stock / Entrada Directa
                        </Button>
                      )
                    }
                  />
                </td>
              </tr>
            )}
            {!loading && rows.map((row) => (
              <tr
                key={`${row.productId}-${row.warehouseId}`}
                className={`cursor-pointer border-t border-border hover:bg-muted/40 ${selectedProduct?.id === row.productId ? 'bg-muted/30' : ''}`}
                onClick={() => handleSelectProduct(row.productId, `${row.productSku} — ${row.productName}`)}
              >
                <td className="p-2">{row.productSku} — {row.productName}</td>
                <td className="p-2">{row.warehouseName}</td>
                <td className="p-2">{row.quantity}</td>
                <td className="p-2">{formatCurrency(row.pmp)}</td>
                <td className="p-2">{formatCurrency(row.valued)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedProduct && (
        <div className="rounded-lg border border-border bg-card p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-medium">Kardex — {selectedProduct.label}</h3>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedProduct(null)}>Cerrar</Button>
          </div>
          {warehouses.length > 1 && (
            <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Bodega del kardex">
              <span className="text-xs text-muted-foreground">Bodega:</span>
              {warehouses.map((entry) => (
                <Button key={entry.id} type="button" size="sm" variant={entry.id === kardexWarehouse ? 'default' : 'outline'} aria-pressed={entry.id === kardexWarehouse} onClick={() => handleSelectProduct(selectedProduct.id, selectedProduct.label, entry.id)}>
                  {entry.name}
                </Button>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] table-auto text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="p-2 font-medium">Fecha</th>
                  <th scope="col" className="p-2 font-medium">Tipo</th>
                  <th scope="col" className="p-2 font-medium">Cantidad</th>
                  <th scope="col" className="p-2 font-medium">Costo Unit.</th>
                  <th scope="col" className="p-2 font-medium">Stock (antes → después)</th>
                  <th scope="col" className="p-2 font-medium">
                    PMP (antes → después)
                    <InfoTooltip text={TAX_GLOSSARY.pmp} />
                  </th>
                  <th scope="col" className="p-2 font-medium">Motivo</th>
                  <th scope="col" className="p-2 font-medium">Operario</th>
                  <th scope="col" className="p-2 font-medium">Foto</th>
                  <th scope="col" className="p-2 font-medium">Referencia</th>
                </tr>
              </thead>
              <tbody>
                {loadingMovements && (
                  <tr>
                    <td className="p-4 text-center text-muted-foreground" colSpan={10}>Cargando...</td>
                  </tr>
                )}
                {!loadingMovements && movements.length === 0 && (
                  <tr>
                    <td colSpan={10}>
                      <EmptyState
                        title="Sin movimientos registrados"
                        description="Este producto todavía no tiene entradas ni salidas de kardex."
                      />
                    </td>
                  </tr>
                )}
                {!loadingMovements && movements.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="p-2">{new Date(m.createdAt).toLocaleString('es-CL')}</td>
                    <td className="p-2">{MOVEMENT_LABELS[m.type]}</td>
                    <td className="p-2">{m.quantity}</td>
                    <td className="p-2">{formatCurrency(m.unitCost)}</td>
                    <td className="p-2">{m.previousStock} → {m.newStock}</td>
                    <td className="p-2">{formatCurrency(m.previousPmp)} → {formatCurrency(m.newPmp)}</td>
                    <td className="p-2">{m.reasonLabel ?? '—'}</td>
                    <td className="p-2">{m.operator ?? '—'}</td>
                    <td className="p-2">
                      {m.evidenceUrl ? (
                        <a href={m.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">Ver foto</a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-2">{m.reference ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
