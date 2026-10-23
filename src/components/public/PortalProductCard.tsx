'use client';

import { formatCommission } from '@/lib/consignment/commission';
import type { SupplierPortalRow } from '@/modules/inventory/services/supplier-portal.service';

export const STATUS: Record<SupplierPortalRow['status'], { label: string }> = {
  OUT: { label: 'Sin stock' },
  LOW: { label: 'Stock bajo' },
  OK: { label: 'Normal' },
};

/** Lo urgente primero: sin stock, luego bajo mínimo, luego el resto por nombre. */
export const URGENCY: Record<SupplierPortalRow['status'], number> = { OUT: 0, LOW: 1, OK: 2 };

export const qty = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 3 });

export function day(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}

/**
 * Una tarjeta de producto del portal: cuánto queda en bodega, por bodega, la última llegada y, si la
 * empresa lo permite, lo que sale. La usan el proveedor y el seller. Solo cantidades.
 */
export default function PortalProductCard({
  row,
  showMovement,
  windowDays,
  commissionBps,
}: {
  row: SupplierPortalRow;
  showMovement: boolean;
  windowDays: number;
  /** Solo en la mercadería de un seller: la comisión que rige sobre este producto. */
  commissionBps?: number | null;
}) {
  return (
    <li className="sp-item" data-status={row.status}>
      <div className="sp-item-head">
        <div className="sp-item-name">
          <strong>{row.name}</strong>
          <span>
            SKU {row.sku}
            {row.brand ? ` · ${row.brand}` : ''}
          </span>
        </div>
        <span className="sp-tag" data-status={row.status}>
          {STATUS[row.status].label}
        </span>
      </div>

      <p className="sp-stock">
        <span className="sp-stock-value">{qty(row.total)}</span> <span className="sp-stock-unit">{row.unit} en bodega</span>
      </p>
      {row.minStock > 0 && (
        <p className="sp-note">
          Mínimo definido por la empresa: {qty(row.minStock)} {row.unit}
        </p>
      )}

      {row.byWarehouse.length > 1 && (
        <ul className="sp-wh" aria-label="Existencias por bodega">
          {row.byWarehouse.map((entry) => (
            <li key={entry.warehouse}>
              <span>{entry.warehouse}</span>
              <strong>{qty(entry.quantity)}</strong>
            </li>
          ))}
        </ul>
      )}

      <dl className="sp-facts">
        <div>
          <dt>Última llegada</dt>
          <dd>{row.lastReceivedAt ? `${day(row.lastReceivedAt)}${row.lastReceivedQty ? ` · ${qty(row.lastReceivedQty)} ${row.unit}` : ''}` : '—'}</dd>
        </div>
        {commissionBps !== undefined && commissionBps !== null && (
          <div>
            <dt>Comisión</dt>
            <dd>{formatCommission(commissionBps)}</dd>
          </div>
        )}
        {showMovement && row.sold30 !== null && (
          <>
            <div>
              <dt>Vendido ({windowDays} días)</dt>
              <dd>
                {qty(row.sold30)} {row.unit}
              </dd>
            </div>
            {row.written30 !== null && row.written30 > 0 && (
              <div>
                <dt>Bajas ({windowDays} días)</dt>
                <dd>
                  {qty(row.written30)} {row.unit}
                </dd>
              </div>
            )}
            {row.coverageDays !== null && (
              <div>
                <dt>Alcanza para</dt>
                <dd>{row.coverageDays === 0 ? 'Sin stock' : `~${row.coverageDays} día${row.coverageDays === 1 ? '' : 's'}`}</dd>
              </div>
            )}
          </>
        )}
      </dl>
    </li>
  );
}
