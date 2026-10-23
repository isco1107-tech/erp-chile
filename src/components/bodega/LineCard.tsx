'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, PackagePlus, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react';
import { canCreateInMode, lineUnit, type Draft, type DraftLine } from '@/lib/warehouse-mobile/draft';
import { isInboundMode } from '@/lib/warehouse-mobile/modes';
import type { MobileCandidate } from '@/modules/warehouse-mobile/types';
import { useBodega } from './BodegaProvider';
import { BigButton, Field, PhotoThumb, Pill, ProductImage, QuantityStepper, Spinner, formatQty, inputClass } from './ui';

/**
 * Una línea de la lista de trabajo. Según en qué punto esté, muestra:
 *   - el producto ya reconocido, con su cantidad;
 *   - "identificando…" (su foto o código está en cola);
 *   - qué hacer cuando el sistema no pudo decidir solo (elegir, buscar o crear);
 *   - un producto nuevo listo para enviar.
 */

interface Props {
  line: DraftLine;
  draft: Draft;
  /** Hay un problema que impide enviar esta línea (se muestra resaltado). */
  problem: string | null;
  onSearch: (lineId: string) => void;
  onCreate: (lineId: string) => void;
  onRetake: (lineId: string) => void;
}

export default function LineCard({ line, draft, problem, onSearch, onCreate, onRetake }: Props) {
  const { boot, setLineQuantity, removeDraftLine, patchDraftLine, confirmDraftLine, resolveLine, retryIdentification } = useBodega();
  const [more, setMore] = useState(false);
  const data = boot.status === 'ready' ? boot.data : null;
  const { source } = line;
  const inbound = isInboundMode(draft.mode);
  const unit = lineUnit(line);
  const canCreate = canCreateInMode(draft.mode) && Boolean(data?.can.createProduct);

  const frame = (children: React.ReactNode) => (
    <li className={`rounded-2xl border bg-card p-3 shadow-card ${problem ? 'border-danger' : 'border-border'}`}>
      {children}
      {problem ? (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {problem}
        </p>
      ) : null}
    </li>
  );

  const removeButton = (
    <button type="button" onClick={() => removeDraftLine(line.id)} aria-label="Quitar de la lista" className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground active:bg-muted">
      <Trash2 className="size-5" />
    </button>
  );

  // ── Esperando que el sistema lo reconozca ───────────────────────────────
  if (source.kind === 'code' || source.kind === 'identify') {
    const waitingForAi = source.kind === 'identify' && source.pending.attempts === 0 && source.pending.message !== null;
    return frame(
      <>
        <div className="flex items-start gap-3">
          {source.kind === 'identify' ? <PhotoThumb photoId={source.photoId} className="size-16" /> : <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-muted font-mono text-xs text-muted-foreground">|||</div>}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-base font-medium">
              <Spinner className="text-info" /> {source.kind === 'code' ? 'Buscando el código…' : waitingForAi ? 'Esperando turno de la IA…' : 'Identificando el producto…'}
            </p>
            {source.kind === 'code' ? <p className="truncate font-mono text-sm text-muted-foreground">{source.code}</p> : null}
            <p className="text-sm text-muted-foreground">{source.pending.message ?? 'Puedes seguir agregando mientras tanto.'}</p>
          </div>
          {removeButton}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <QuantityStepper value={line.quantity} unit="UN" onChange={(next) => setLineQuantity(line.id, next)} label="este producto" />
          <button type="button" onClick={() => onSearch(line.id)} className="inline-flex h-12 items-center gap-1.5 rounded-xl bg-muted px-4 text-sm font-medium active:bg-secondary">
            <Search className="size-4" /> Buscar a mano
          </button>
        </div>
      </>
    );
  }

  // ── El sistema no pudo decidir solo ─────────────────────────────────────
  if (source.kind === 'resolve') {
    const title =
      source.reason === 'candidates'
        ? '¿Cuál de estos es?'
        : source.reason === 'new'
          ? 'No está en tu catálogo'
          : source.reason === 'unknown-code'
            ? 'Ese código no está en tu catálogo'
            : source.reason === 'unreadable'
              ? 'No se alcanzó a leer la foto'
              : source.reason === 'unavailable'
                ? 'La identificación por foto no está disponible'
                : 'No se pudo reconocer';
    return frame(
      <>
        <div className="flex items-start gap-3">
          <PhotoThumb photoId={source.photoId} className="size-16" fallback={<span className="font-mono text-xs">|||</span>} />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold">{title}</p>
            {source.code ? <p className="truncate font-mono text-sm text-muted-foreground">{source.code}</p> : null}
            {source.read?.name ? (
              <p className="text-sm text-muted-foreground">
                Parece ser: <strong className="text-foreground">{[source.read.name, source.read.brand, source.read.netContent].filter(Boolean).join(' · ')}</strong>
              </p>
            ) : null}
            {source.message && source.reason !== 'candidates' ? <p className="text-sm text-muted-foreground">{source.message}</p> : null}
          </div>
          {removeButton}
        </div>

        {source.candidates.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {source.candidates.map((candidate: MobileCandidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => resolveLine(line.id, candidate, { confirmed: true, origin: 'manual', factor: candidate.factor })}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-muted/50 p-2 text-left active:bg-muted"
                >
                  <ProductImage url={candidate.imageUrl} name={candidate.name} className="size-12" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{candidate.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {candidate.sku} · hay {formatQty(candidate.stock)} {candidate.unit}
                    </span>
                  </span>
                  <Pill tone="info">{Math.round(candidate.score * 100)} %</Pill>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {canCreate ? (
            <BigButton onClick={() => onCreate(line.id)} className="w-full">
              <PackagePlus className="size-5" /> Crear producto nuevo
            </BigButton>
          ) : null}
          <BigButton variant="secondary" onClick={() => onSearch(line.id)} className="w-full">
            <Search className="size-5" /> Buscar a mano
          </BigButton>
          {source.reason === 'failed' || source.reason === 'unavailable' ? (
            <BigButton variant="secondary" onClick={() => retryIdentification(line.id)} className="w-full">
              <RefreshCw className="size-5" /> Reintentar
            </BigButton>
          ) : null}
          {source.reason === 'unreadable' && source.photoId ? (
            <BigButton variant="secondary" onClick={() => onRetake(line.id)} className="w-full">
              Sacar otra foto
            </BigButton>
          ) : null}
        </div>
        {!canCreate && (source.reason === 'new' || source.reason === 'unknown-code') ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {canCreateInMode(draft.mode) ? 'Tu rol no puede crear productos: búscalo a mano o pídele a un administrador que lo cree.' : 'Para crear un producto nuevo usa «Llegada de mercadería» o «Sobrante».'}
          </p>
        ) : null}
      </>
    );
  }

  // ── Producto nuevo listo ────────────────────────────────────────────────
  if (source.kind === 'new') {
    return frame(
      <>
        <div className="flex items-start gap-3">
          <PhotoThumb photoId={source.photoId} className="size-16" fallback={<PackagePlus className="size-6" />} />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold break-words">{source.form.name || 'Producto sin nombre'}</p>
            <p className="truncate text-sm text-muted-foreground">
              {[source.form.brand, source.form.barcode ? `Código ${source.form.barcode}` : '', source.form.sku ? `SKU ${source.form.sku}` : 'SKU automático'].filter(Boolean).join(' · ')}
            </p>
            <Pill tone="success" className="mt-1">
              <PackagePlus className="size-3.5" /> Producto nuevo
            </Pill>
          </div>
          {removeButton}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <QuantityStepper value={line.quantity} unit={unit} onChange={(next) => setLineQuantity(line.id, next)} label={source.form.name || 'el producto nuevo'} />
          <button type="button" onClick={() => onCreate(line.id)} className="inline-flex h-12 items-center rounded-xl bg-muted px-4 text-sm font-medium active:bg-secondary">
            Editar datos
          </button>
        </div>
      </>
    );
  }

  // ── Producto reconocido ─────────────────────────────────────────────────
  const { product } = source;
  const outgoing = !inbound;
  const lowStock = outgoing && line.quantity > product.stock;
  const showLots = inbound && product.tracksLots;
  const showCost = inbound && Boolean(data?.can.seeCosts);
  const needsConfirm = !source.confirmed;

  return frame(
    <>
      <div className="flex items-start gap-3">
        <div className="relative">
          <ProductImage url={product.imageUrl} name={product.name} className="size-16" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold break-words">{product.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {product.sku}
            {product.brand ? ` · ${product.brand}` : ''}
          </p>
          <p className="text-sm text-muted-foreground">
            Hay <strong className="text-foreground">{formatQty(product.stock)}</strong> {product.unit}
            {data && data.warehouses.length > 1 ? ' en esta bodega' : ''}
          </p>
        </div>
        {removeButton}
      </div>

      {needsConfirm ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-accent p-2.5 text-sm text-accent-foreground">
          <Sparkles className="size-4 shrink-0" />
          <span className="flex-1">La IA cree que es este producto. ¿Es correcto?</span>
          <button type="button" onClick={() => confirmDraftLine(line.id)} className="h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground active:opacity-85">
            Sí, es este
          </button>
          <button type="button" onClick={() => onSearch(line.id)} className="h-11 rounded-lg bg-card px-4 font-medium active:bg-muted">
            Cambiar
          </button>
        </div>
      ) : null}

      {!product.isActive && inbound ? <p className="mt-2 text-sm text-danger">Este producto está archivado: no se puede recibir hasta restaurarlo en el Catálogo.</p> : null}
      {lowStock ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0" /> Solo hay {formatQty(product.stock)} {product.unit}. Si no alcanza, el servidor lo rechazará.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <QuantityStepper value={line.quantity} unit={product.unit} onChange={(next) => setLineQuantity(line.id, next)} label={product.name} />
        <button type="button" onClick={() => setMore((open) => !open)} aria-expanded={more} className="inline-flex h-12 items-center gap-1 rounded-xl px-3 text-sm font-medium text-muted-foreground active:bg-muted">
          Más datos <ChevronDown className={`size-4 transition-transform ${more ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {more ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {showCost ? (
            <Field label="Costo unitario neto" hint="Opcional. Si lo dejas vacío, entra al costo promedio actual y no lo mueve.">
              <input value={line.unitCost} onChange={(event) => patchDraftLine(line.id, { unitCost: event.target.value })} className={inputClass} inputMode="decimal" placeholder="$" autoComplete="off" />
            </Field>
          ) : null}
          {showLots ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Lote">
                <input value={line.lotNumber} onChange={(event) => patchDraftLine(line.id, { lotNumber: event.target.value })} className={inputClass} maxLength={40} autoComplete="off" />
              </Field>
              <Field label="Vence">
                <input type="date" value={line.expiryDate} onChange={(event) => patchDraftLine(line.id, { expiryDate: event.target.value })} className={inputClass} />
              </Field>
            </div>
          ) : null}
          <Field label="Nota de esta línea">
            <input value={line.note} onChange={(event) => patchDraftLine(line.id, { note: event.target.value })} className={inputClass} maxLength={120} autoComplete="off" />
          </Field>
        </div>
      ) : null}
    </>
  );
}
