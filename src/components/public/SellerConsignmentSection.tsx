'use client';

import { useMemo, useState } from 'react';
import { PackageOpen, Search } from 'lucide-react';
import { PublicCard, PublicCardHeader } from '@/components/public/PublicShell';
import PortalProductCard from '@/components/public/PortalProductCard';
import { URGENCY, day, qty } from '@/components/public/portal-format';
import { formatCurrency } from '@/lib/chile/tax';
import { formatCommission } from '@/lib/consignment/commission';
import type { ConsignmentPortalView } from '@/modules/inventory/services/supplier-portal.service';

/**
 * La parte de seller del portal: su mercadería (que sigue siendo suya hasta que se vende), lo vendido
 * sin liquidar y sus liquidaciones. Solo sus montos: nunca clientes, documentos ni costos.
 */
export default function SellerConsignmentSection({
  consignment,
  companyName,
  showMovement,
  windowDays,
  searchable = false,
}: {
  consignment: ConsignmentPortalView;
  companyName: string;
  showMovement: boolean;
  windowDays: number;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () =>
      [...consignment.rows].sort(
        (a, b) =>
          URGENCY[a.status] - URGENCY[b.status] ||
          a.name.localeCompare(b.name, 'es'),
      ),
    [consignment.rows],
  );
  const visibleRows = rows.filter((row) =>
    `${row.name} ${row.sku}`
      .toLocaleLowerCase('es')
      .includes(query.trim().toLocaleLowerCase('es')),
  );
  const { pending, settlements, summary } = consignment;

  return (
    <>
      <PublicCard>
        <PublicCardHeader
          icon={<PackageOpen className="size-5" />}
          eyebrow={
            consignment.commissionBps === null
              ? 'Consignación'
              : `Consignación · comisión de ${companyName}: ${formatCommission(consignment.commissionBps)}`
          }
          title="Tu mercadería en consignación"
          subtitle="Sigue siendo tuya hasta que se vende. Te liquidamos lo vendido menos la comisión; los montos son netos, sin IVA."
        />
        <dl className="sp-kpis" aria-label="Vendido sin liquidar">
          <div>
            <dt>Unidades vendidas sin liquidar</dt>
            <dd>{qty(pending.units)}</dd>
          </div>
          <div>
            <dt>Neto vendido</dt>
            <dd>{formatCurrency(pending.netSales)}</dd>
          </div>
          <div>
            <dt>Comisión</dt>
            <dd>{formatCurrency(pending.commissionAmount)}</dd>
          </div>
          <div data-strong="true">
            <dt>Te corresponde</dt>
            <dd>{formatCurrency(pending.payoutAmount)}</dd>
          </div>
        </dl>
        {summary.out + summary.low > 0 && (
          <p className="sp-note">
            {summary.out > 0
              ? `${summary.out} producto${summary.out === 1 ? '' : 's'} sin stock`
              : ''}
            {summary.out > 0 && summary.low > 0 ? ' y ' : ''}
            {summary.low > 0 ? `${summary.low} con stock bajo` : ''}: conviene
            reponer.
          </p>
        )}
      </PublicCard>

      {searchable && (
        <label className="sc-search">
          <Search className="size-4" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar en mi mercadería"
            placeholder="Buscar mercadería por nombre o SKU"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      )}
      {visibleRows.length === 0 ? (
        <PublicCard>
          <p className="sp-empty">
            {rows.length
              ? 'No hay mercadería que coincida con tu búsqueda.'
              : 'Todavía no hay mercadería tuya registrada en la bodega.'}
          </p>
        </PublicCard>
      ) : (
        <ul className="sp-grid">
          {visibleRows.map((row) => (
            <PortalProductCard
              key={row.sku}
              row={row}
              showMovement={showMovement}
              windowDays={windowDays}
              commissionBps={row.commissionBps}
            />
          ))}
        </ul>
      )}

      <PublicCard>
        <PublicCardHeader
          eyebrow="Historial"
          title="Tus liquidaciones"
          subtitle={
            settlements.length === 0
              ? 'Todavía no se ha generado ninguna liquidación.'
              : 'Lo que se te ha liquidado y su estado de pago.'
          }
        />
        {settlements.length > 0 && (
          <>
            {searchable && (
              <ul
                className="sc-settlements"
                aria-label="Liquidaciones en el teléfono"
              >
                {settlements.map((settlement) => (
                  <li key={settlement.number}>
                    <div className="sc-settlement-head">
                      <strong>Liquidación #{settlement.number}</strong>
                      <span
                        className="sp-tag"
                        data-status={
                          settlement.status === 'PAID' ? 'OK' : 'LOW'
                        }
                      >
                        {settlement.status === 'PAID' ? 'Pagada' : 'Por pagar'}
                      </span>
                    </div>
                    <p className="sc-lead">
                      {day(settlement.createdAt)} · {qty(settlement.units)}{' '}
                      unidades
                    </p>
                    <dl className="sc-row-facts">
                      <div>
                        <dt>Neto vendido</dt>
                        <dd>{formatCurrency(settlement.netSales)}</dd>
                      </div>
                      <div>
                        <dt>Comisión</dt>
                        <dd>{formatCurrency(settlement.commissionAmount)}</dd>
                      </div>
                      <div>
                        <dt>Ajuste</dt>
                        <dd>{formatCurrency(settlement.adjustmentAmount)}</dd>
                      </div>
                      <div>
                        <dt>Te corresponde</dt>
                        <dd>
                          <strong>
                            {formatCurrency(settlement.payoutAmount)}
                          </strong>
                        </dd>
                      </div>
                    </dl>
                    {settlement.paidAt && (
                      <p className="sc-lead">
                        Pagada el {day(settlement.paidAt)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div
              className={`sp-table-wrap ${searchable ? 'sc-desktop-settlements' : ''}`}
            >
              <table className="sp-table">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Fecha</th>
                    <th className="num">Unidades</th>
                    <th className="num">Neto vendido</th>
                    <th className="num">Comisión</th>
                    <th className="num">Ajuste</th>
                    <th className="num">Te corresponde</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((settlement) => (
                    <tr key={settlement.number}>
                      <td>{settlement.number}</td>
                      <td>{day(settlement.createdAt)}</td>
                      <td className="num">{qty(settlement.units)}</td>
                      <td className="num">
                        {formatCurrency(settlement.netSales)}
                      </td>
                      <td className="num">
                        {formatCurrency(settlement.commissionAmount)}
                      </td>
                      <td className="num">
                        {settlement.adjustmentAmount === 0
                          ? '—'
                          : formatCurrency(settlement.adjustmentAmount)}
                      </td>
                      <td className="num">
                        <strong>
                          {formatCurrency(settlement.payoutAmount)}
                        </strong>
                      </td>
                      <td>
                        <span
                          className="sp-tag"
                          data-status={
                            settlement.status === 'PAID' ? 'OK' : 'LOW'
                          }
                        >
                          {settlement.status === 'PAID'
                            ? `Pagada${settlement.paidAt ? ` el ${day(settlement.paidAt)}` : ''}`
                            : 'Por pagar'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </PublicCard>
    </>
  );
}
