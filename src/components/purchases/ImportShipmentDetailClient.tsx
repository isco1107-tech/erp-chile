'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Calculator, Coins, PackageCheck, Pencil, Percent, Plus, Ship, Trash2, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { KpiCard } from '@/components/ui/KpiCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import { computeLandedCost, IMPORT_COST_KINDS, IMPORT_COST_LABELS, type ImportCostKind } from '@/lib/purchases/landed-cost';
import { cn } from '@/lib/utils';
import {
  cancelImportShipmentAction,
  closeImportShipmentAction,
  saveImportCostsAction,
  saveImportItemsAction,
  updateImportShipmentAction,
} from '@/modules/purchases/actions/import-shipment.actions';
import { IMPORT_STATUS_LABELS } from '@/modules/purchases/schema';
import type { ImportShipmentDetail } from '@/modules/purchases/services/import-shipment.service';
import { ImportHeaderDialog, type ImportHeaderValues } from './ImportHeaderDialog';
import { IMPORT_STATUS_TONE } from './ImportShipmentsClient';
import { ProductSearch } from './ProductSearch';

interface ItemDraft {
  key: string;
  productId: string;
  sku: string;
  description: string;
  quantity: string;
  unitPriceForeign: string;
  currentPmp: number | null;
  landedUnitCost: number | null;
}

interface CostDraft {
  key: string;
  kind: ImportCostKind;
  description: string;
  amount: number;
  purchaseDocumentId: string;
}

let counter = 0;
const nextKey = () => `imp-${(counter += 1)}`;

function parseDecimal(value: string): number {
  const normalized = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function decimalText(value: number): string {
  return String(value).replace('.', ',');
}

function money2(value: number): string {
  return `$${value.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

interface Props {
  shipment: ImportShipmentDetail;
  canWrite: boolean;
  suppliers: { id: string; label: string }[];
  warehouses: { id: string; name: string }[];
  purchaseDocuments: { id: string; label: string; netAmount: number }[];
}

export default function ImportShipmentDetailClient({ shipment, canWrite, suppliers, warehouses, purchaseDocuments }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const editable = canWrite && shipment.status === 'OPEN';
  const [editingHeader, setEditingHeader] = useState(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ItemDraft[]>(() =>
    shipment.items.map((item) => ({
      key: nextKey(),
      productId: item.productId,
      sku: item.sku,
      description: item.description,
      quantity: decimalText(item.quantity),
      unitPriceForeign: decimalText(item.unitPriceForeign),
      currentPmp: item.currentPmp,
      landedUnitCost: item.landedUnitCost,
    }))
  );
  const [costs, setCosts] = useState<CostDraft[]>(() =>
    shipment.costs.map((cost) => ({
      key: nextKey(),
      kind: (IMPORT_COST_KINDS as readonly string[]).includes(cost.kind) ? (cost.kind as ImportCostKind) : 'OTHER',
      description: cost.description,
      amount: cost.amount,
      purchaseDocumentId: cost.purchaseDocumentId ?? '',
    }))
  );
  const [itemsDirty, setItemsDirty] = useState(false);
  const [costsDirty, setCostsDirty] = useState(false);

  const landed = useMemo(
    () =>
      computeLandedCost({
        exchangeRate: shipment.exchangeRate,
        method: shipment.allocationMethod,
        items: items.map((item) => ({ id: item.key, quantity: parseDecimal(item.quantity), unitPriceForeign: parseDecimal(item.unitPriceForeign) })),
        costs: costs.map((cost) => ({ kind: cost.kind, amount: cost.amount })),
      }),
    [costs, items, shipment.allocationMethod, shipment.exchangeRate]
  );
  const landedByKey = new Map(landed.items.map((item) => [item.id, item]));
  const fobForeign = items.reduce((sum, item) => sum + parseDecimal(item.quantity) * parseDecimal(item.unitPriceForeign), 0);
  const hasDuty = costs.some((cost) => cost.kind === 'DUTY');
  const unlinkedCosts = costs.filter((cost) => !cost.purchaseDocumentId && cost.amount > 0).length;

  async function run(action: () => Promise<{ success: true; message?: string } | { success: false; error: string }>, after?: () => void) {
    setBusy(true);
    try {
      const result = await action();
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      if (result.message) toast.success(result.message);
      after?.();
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    setItemsDirty(true);
  }

  function updateCost(key: string, patch: Partial<CostDraft>) {
    setCosts((current) => current.map((cost) => (cost.key === key ? { ...cost, ...patch } : cost)));
    setCostsDirty(true);
  }

  async function saveHeader(values: ImportHeaderValues): Promise<boolean> {
    return run(() => updateImportShipmentAction(shipment.id, values));
  }

  async function close() {
    const ok = await confirm({
      title: '¿Cerrar la carpeta e ingresar la mercadería?',
      description: `Entran ${items.length} producto${items.length === 1 ? '' : 's'} a ${shipment.warehouseName ?? 'la bodega'} por ${formatCurrency(landed.landedTotal)}, al costo puesto en bodega de cada uno. Después ya no se puede modificar.${unlinkedCosts > 0 ? ` Ojo: ${unlinkedCosts} costo${unlinkedCosts === 1 ? '' : 's'} no tiene${unlinkedCosts === 1 ? '' : 'n'} factura de Compras asociada.` : ''}`,
      confirmLabel: 'Cerrar e ingresar',
      destructive: false,
    });
    if (!ok) return;
    await run(() => closeImportShipmentAction(shipment.id));
  }

  const headerInitial: ImportHeaderValues = {
    reference: shipment.reference,
    contactId: shipment.contactId,
    currency: shipment.currency as ImportHeaderValues['currency'],
    exchangeRate: shipment.exchangeRate,
    incoterm: shipment.incoterm as ImportHeaderValues['incoterm'],
    dinNumber: shipment.dinNumber ?? undefined,
    arrivalDate: shipment.arrivalDate ? new Date(shipment.arrivalDate).toISOString().slice(0, 10) : '',
    warehouseId: shipment.warehouseId,
    allocationMethod: shipment.allocationMethod,
    notes: shipment.notes ?? undefined,
  };

  return (
    <div className="space-y-6">
      <Link href="/dashboard/purchases/imports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Importaciones
      </Link>
      <PageHeader
        eyebrow={`Importación N° ${shipment.folio}${shipment.supplierName ? ` · ${shipment.supplierName}` : ''}`}
        title={shipment.reference}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge tone={IMPORT_STATUS_TONE[shipment.status]}>{IMPORT_STATUS_LABELS[shipment.status]}</StatusBadge>
            <span>
              {shipment.currency} a {shipment.exchangeRate.toLocaleString('es-CL', { maximumFractionDigits: 4 })}
              {shipment.incoterm ? ` · ${shipment.incoterm}` : ''}
              {shipment.dinNumber ? ` · DIN ${shipment.dinNumber}` : ''}
              {` · reparto ${shipment.allocationMethod === 'VALUE' ? 'por valor' : 'por unidades'}`}
              {shipment.warehouseName ? ` · entra a ${shipment.warehouseName}` : ''}
            </span>
          </span>
        }
        actions={
          editable ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setEditingHeader(true)}>
                <Pencil className="size-4" aria-hidden="true" /> Datos
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  if (await confirm({ title: '¿Anular la carpeta?', description: 'No mueve inventario; queda como registro anulado.', confirmLabel: 'Anular' })) {
                    await run(() => cancelImportShipmentAction(shipment.id));
                  }
                }}
              >
                Anular
              </Button>
              <Button type="button" disabled={busy || itemsDirty || costsDirty || items.length === 0} onClick={close} title={itemsDirty || costsDirty ? 'Guarda los cambios antes de cerrar' : undefined}>
                <PackageCheck className="size-4" aria-hidden="true" /> Cerrar e ingresar a bodega
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Valor FOB" value={formatCurrency(landed.fobTotal)} icon={Ship} tone="info" hint={`${shipment.currency} ${fobForeign.toLocaleString('es-CL', { maximumFractionDigits: 2 })}`} />
        <KpiCard label="Costos de importación" value={formatCurrency(landed.costsTotal)} icon={Coins} tone="accent" hint={`${costs.length} concepto${costs.length === 1 ? '' : 's'}`} />
        <KpiCard label="Costo puesto en bodega" value={formatCurrency(landed.landedTotal)} icon={Warehouse} tone="success" hint="FOB + costos" />
        <KpiCard label="Sobre el FOB" value={`${landed.upliftPercent.toLocaleString('es-CL')}%`} icon={Percent} tone={landed.upliftPercent > 40 ? 'warning' : 'neutral'} hint="Lo que suma internar" />
      </div>

      <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Productos">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Productos</h2>
            <p className="text-xs text-muted-foreground">Precio unitario FOB en {shipment.currency}. El costo en bodega se recalcula mientras escribes.</p>
          </div>
          {editable && (
            <div className="flex flex-col gap-2 sm:w-[420px] sm:flex-row">
              <div className="flex-1">
                <ProductSearch
                  onlyTrackable
                  onPick={(product) => {
                    setItems((current) => [...current, { key: nextKey(), productId: product.id, sku: product.sku, description: product.name, quantity: '1', unitPriceForeign: '', currentPmp: null, landedUnitCost: null }]);
                    setItemsDirty(true);
                  }}
                />
              </div>
              <Button
                type="button"
                disabled={busy || !itemsDirty}
                onClick={() =>
                  run(
                    () =>
                      saveImportItemsAction(
                        shipment.id,
                        items.map((item) => ({ productId: item.productId, quantity: parseDecimal(item.quantity), unitPriceForeign: parseDecimal(item.unitPriceForeign) }))
                      ),
                    () => setItemsDirty(false)
                  )
                }
              >
                Guardar productos
              </Button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Producto</th>
                <th className="w-28 px-4 py-2 font-medium">Cantidad</th>
                <th className="w-32 px-4 py-2 font-medium">FOB unit. ({shipment.currency})</th>
                <th className="px-4 py-2 text-right font-medium">FOB en pesos</th>
                <th className="px-4 py-2 text-right font-medium">Costos asignados</th>
                <th className="px-4 py-2 text-right font-medium">Costo unitario en bodega</th>
                <th className="px-4 py-2 text-right font-medium">PMP actual</th>
                {editable && <th className="w-10 px-2 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.length === 0 && (
                <tr>
                  <td colSpan={editable ? 8 : 7} className="px-4 py-8 text-center text-muted-foreground">Agrega los productos del embarque con el buscador.</td>
                </tr>
              )}
              {items.map((item) => {
                const result = landedByKey.get(item.key);
                const unit = shipment.status === 'CLOSED' && item.landedUnitCost !== null ? item.landedUnitCost : (result?.landedUnitCost ?? 0);
                return (
                  <tr key={item.key}>
                    <td className="px-4 py-2">
                      <p className="font-medium">{item.description}</p>
                      <p className="font-mono text-xs text-muted-foreground">{item.sku}</p>
                    </td>
                    <td className="px-4 py-2">
                      {editable ? <Input inputMode="decimal" aria-label="Cantidad" value={item.quantity} onChange={(e) => updateItem(item.key, { quantity: e.target.value })} /> : <span className="tabular-nums">{item.quantity}</span>}
                    </td>
                    <td className="px-4 py-2">
                      {editable ? (
                        <Input inputMode="decimal" aria-label="Precio FOB unitario" value={item.unitPriceForeign} onChange={(e) => updateItem(item.key, { unitPriceForeign: e.target.value })} placeholder="0,00" />
                      ) : (
                        <span className="tabular-nums">{item.unitPriceForeign}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(result?.fobClp ?? 0)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">{formatCurrency(result?.allocated ?? 0)}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{money2(unit)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">{item.currentPmp !== null && item.currentPmp > 0 ? money2(item.currentPmp) : '—'}</td>
                    {editable && (
                      <td className="px-2 py-2">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Quitar ${item.description}`}
                          onClick={() => {
                            setItems((current) => current.filter((line) => line.key !== item.key));
                            setItemsDirty(true);
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="min-w-0 rounded-lg border border-border bg-card shadow-card" aria-label="Costos de importación">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Costos hasta la bodega</h2>
              <p className="text-xs text-muted-foreground">Montos netos en pesos (sin IVA recuperable). Asocia la factura de Compras cuando ya la registraste.</p>
            </div>
            {editable && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCosts((current) => [...current, { key: nextKey(), kind: 'FREIGHT', description: IMPORT_COST_LABELS.FREIGHT, amount: 0, purchaseDocumentId: '' }]);
                    setCostsDirty(true);
                  }}
                >
                  <Plus className="size-4" aria-hidden="true" /> Costo
                </Button>
                <Button type="button" disabled={busy || !costsDirty} onClick={() => run(() => saveImportCostsAction(shipment.id, costs.map((cost) => ({ kind: cost.kind, description: cost.description.trim() || IMPORT_COST_LABELS[cost.kind], amount: cost.amount, purchaseDocumentId: cost.purchaseDocumentId || null }))), () => setCostsDirty(false))}>
                  Guardar costos
                </Button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="w-48 px-4 py-2 font-medium">Concepto</th>
                  <th className="px-4 py-2 font-medium">Detalle</th>
                  <th className="w-40 px-4 py-2 font-medium">Monto</th>
                  <th className="w-56 px-4 py-2 font-medium">Factura en Compras</th>
                  {editable && <th className="w-10 px-2 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {costs.length === 0 && (
                  <tr>
                    <td colSpan={editable ? 5 : 4} className="px-4 py-8 text-center text-muted-foreground">Sin costos: el costo en bodega sería solo el FOB.</td>
                  </tr>
                )}
                {costs.map((cost) => (
                  <tr key={cost.key}>
                    <td className="px-4 py-2">
                      {editable ? (
                        <select
                          aria-label="Concepto"
                          className={nativeSelectClass}
                          value={cost.kind}
                          onChange={(e) => {
                            const kind = e.target.value as ImportCostKind;
                            updateCost(cost.key, { kind, description: Object.values(IMPORT_COST_LABELS).includes(cost.description) || !cost.description ? IMPORT_COST_LABELS[kind] : cost.description });
                          }}
                        >
                          {IMPORT_COST_KINDS.map((kind) => (
                            <option key={kind} value={kind}>{IMPORT_COST_LABELS[kind]}</option>
                          ))}
                        </select>
                      ) : (
                        IMPORT_COST_LABELS[cost.kind]
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {editable ? <Input aria-label="Detalle" maxLength={120} value={cost.description} onChange={(e) => updateCost(cost.key, { description: e.target.value })} /> : cost.description}
                    </td>
                    <td className="px-4 py-2">
                      {editable ? <CurrencyInput aria-label="Monto" value={cost.amount} onChange={(value) => updateCost(cost.key, { amount: value })} /> : <span className="tabular-nums">{formatCurrency(cost.amount)}</span>}
                    </td>
                    <td className="px-4 py-2">
                      {editable ? (
                        <select aria-label="Factura asociada" className={nativeSelectClass} value={cost.purchaseDocumentId} onChange={(e) => updateCost(cost.key, { purchaseDocumentId: e.target.value })}>
                          <option value="">Sin factura</option>
                          {purchaseDocuments.map((document) => (
                            <option key={document.id} value={document.id}>{document.label} · {formatCurrency(document.netAmount)}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{shipment.costs.find((original) => original.purchaseDocumentId === cost.purchaseDocumentId)?.purchaseLabel ?? 'Sin factura'}</span>
                      )}
                    </td>
                    {editable && (
                      <td className="px-2 py-2">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Quitar costo"
                          onClick={() => {
                            setCosts((current) => current.filter((line) => line.key !== cost.key));
                            setCostsDirty(true);
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4 text-sm shadow-card" aria-label="Base aduanera">
            <div className="flex items-center gap-2">
              <Calculator className="size-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold">Base aduanera (referencia)</h2>
            </div>
            <dl className="mt-3 space-y-1.5">
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">CIF (FOB + flete + seguro)</dt><dd className="tabular-nums">{formatCurrency(landed.cif)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Arancel general 6%</dt><dd className="tabular-nums">{formatCurrency(landed.suggestedDuty)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">IVA de importación</dt><dd className="tabular-nums">{formatCurrency(landed.importVat)}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              El IVA de importación es crédito fiscal (va al F29), no costo. Con tratado de libre comercio el arancel puede ser 0%: usa el que indica la DIN.
            </p>
            {editable && !hasDuty && landed.suggestedDuty > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                onClick={() => {
                  setCosts((current) => [...current, { key: nextKey(), kind: 'DUTY', description: 'Derecho ad valorem 6% sobre CIF', amount: landed.suggestedDuty, purchaseDocumentId: '' }]);
                  setCostsDirty(true);
                }}
              >
                Agregar arancel de 6% ({formatCurrency(landed.suggestedDuty)})
              </Button>
            )}
          </section>
          {shipment.status === 'OPEN' && (
            <p className={cn('rounded-md px-3 py-2 text-xs', unlinkedCosts > 0 ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-foreground')}>
              Registra en Compras (sin enlazar productos) las facturas del proveedor, flete, agente y puerto. Al cerrar la carpeta la mercadería entra al inventario una sola vez, al costo puesto en bodega{unlinkedCosts > 0 ? `; hay ${unlinkedCosts} costo${unlinkedCosts === 1 ? '' : 's'} sin factura asociada` : ''}.
            </p>
          )}
        </aside>
      </div>

      {editingHeader && <ImportHeaderDialog title="Datos de la carpeta" initial={headerInitial} suppliers={suppliers} warehouses={warehouses} onClose={() => setEditingHeader(false)} onSubmit={saveHeader} />}
    </div>
  );
}
