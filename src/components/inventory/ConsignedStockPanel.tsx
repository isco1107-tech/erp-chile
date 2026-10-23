'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCommission } from '@/lib/consignment/commission';
import type { ConsignedProductRow, ConsignedStockGroup } from '@/modules/inventory/services/consignment.service';
import ConsignmentMoveDialog, { type MoveMode } from './ConsignmentMoveDialog';

interface Props {
  groups: ConsignedStockGroup[] | null;
  canMoveStock: boolean;
  onChanged: () => void | Promise<void>;
}

export default function ConsignedStockPanel({ groups, canMoveStock, onChanged }: Props) {
  const [move, setMove] = useState<{ mode: MoveMode; product: ConsignedProductRow; sellerName: string } | null>(null);

  if (groups === null) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-border">
        <EmptyState
          title="Todavía no tienes sellers"
          description="Un seller pone productos a la venta sin dejar de ser dueño de la mercadería. Crea un contacto y márcalo como «Seller (consignación)» con su comisión."
          action={
            <Link href="/dashboard/contacts?new=1" className={buttonVariants({ size: 'sm' })}>
              Crear un seller
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.consignorId} className="rounded-xl border border-border">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-foreground">{group.name}</h2>
              <p className="text-xs text-muted-foreground">
                {group.rut} · Comisión {group.commissionBps === null ? 'sin definir' : formatCommission(group.commissionBps)} ·{' '}
                {group.totalUnits.toLocaleString('es-CL')} unidades en bodega
              </p>
            </div>
            <Link href={`/dashboard/contacts/${group.consignorId}`} className={buttonVariants({ size: 'sm', variant: 'outline' })} aria-label={`Ver la ficha de ${group.name}`}>
              Ver ficha
            </Link>
          </header>

          {group.products.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Este seller todavía no tiene productos. En el{' '}
              <Link href="/dashboard/products" className="font-medium text-primary hover:underline">Catálogo de Productos</Link>, edita un producto y elige a este seller en «Dueño del producto».
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] table-auto text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="p-2 font-medium">SKU</th>
                    <th className="p-2 font-medium">Producto</th>
                    <th className="p-2 font-medium">En bodega</th>
                    <th className="p-2 font-medium">Comisión</th>
                    {canMoveStock && <th className="p-2 font-medium">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {group.products.map((product) => (
                    <tr key={product.id} className="border-t border-border align-top">
                      <td className="p-2 font-mono text-xs">{product.sku}</td>
                      <td className="p-2">{product.name}</td>
                      <td className="p-2">
                        <StatusBadge tone={product.totalStock <= 0 ? 'danger' : product.minStock > 0 && product.totalStock <= product.minStock ? 'warning' : 'success'}>
                          {product.totalStock.toLocaleString('es-CL')} {product.unit}
                        </StatusBadge>
                        {product.byWarehouse.length > 1 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {product.byWarehouse.map((row) => `${row.warehouse}: ${row.quantity.toLocaleString('es-CL')}`).join(' · ')}
                          </p>
                        )}
                      </td>
                      <td className="p-2">{product.commissionBps === null ? '—' : formatCommission(product.commissionBps)}</td>
                      {canMoveStock && (
                        <td className="p-2">
                          <div className="flex gap-2">
                            <Button type="button" size="sm" variant="outline" aria-label={`Recibir mercadería de ${product.name}`} onClick={() => setMove({ mode: 'receive', product, sellerName: group.name })}>
                              Recibir
                            </Button>
                            <Button type="button" size="sm" variant="outline" disabled={product.totalStock <= 0} aria-label={`Devolver ${product.name} al seller`} onClick={() => setMove({ mode: 'return', product, sellerName: group.name })}>
                              Devolver
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {move && (
        <ConsignmentMoveDialog
          mode={move.mode}
          product={move.product}
          sellerName={move.sellerName}
          onClose={() => setMove(null)}
          onDone={async () => {
            setMove(null);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}
