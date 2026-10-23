'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, Camera, Check, ScanBarcode, Search } from 'lucide-react';
import { toast } from 'sonner';
import { looksLikeCode } from '@/lib/warehouse-mobile/codes';
import { newProductFormFrom, summarizeDraft, validateDraft, type DraftLine, type NewProductForm } from '@/lib/warehouse-mobile/draft';
import { MODE_DEFINITIONS, WASTE_REASONS, WASTE_REASON_HINTS, WASTE_REASON_LABELS, isTransferMode, reasonRequiresNote } from '@/lib/warehouse-mobile/modes';
import type { MobileProduct, VisionRead } from '@/modules/warehouse-mobile/types';
import { useConfirm } from '@/components/ui/confirm-provider';
import { useBodega } from './BodegaProvider';
import CaptureScreen from './CaptureScreen';
import LineCard from './LineCard';
import NewProductSheet from './NewProductSheet';
import SearchSheet from './SearchSheet';
import { BigButton, Field, Pill, inputClass } from './ui';

/**
 * La lista de trabajo de un movimiento (llegada, merma, traslado…): se van
 * sumando productos con la cámara, el escáner o el buscador, y al final se
 * envía todo junto. Lo que falta por reconocer no bloquea seguir agregando;
 * solo bloquea el envío.
 */

interface Props {
  onBack: () => void;
  onDone: () => void;
}

type SearchTarget = { kind: 'add' } | { kind: 'line'; lineId: string };

interface NewProductTarget {
  lineId: string;
  form: NewProductForm;
  read: VisionRead | null;
  photoId: string | null;
}

export default function SessionScreen({ onBack, onDone }: Props) {
  const confirm = useConfirm();
  const {
    boot,
    draft,
    updateDraft,
    discardDraft,
    addProductLine,
    addCodeLine,
    addPhotoLine,
    attachEvidence,
    removeDraftLine,
    resolveLine,
    setLineSource,
    submitDraft,
    setWarehouseId,
    identifying,
  } = useBodega();

  const [capturing, setCapturing] = useState(false);
  /** Línea cuya foto de respaldo se está sacando. */
  const [evidenceLineId, setEvidenceLineId] = useState<string | null>(null);
  const [search, setSearch] = useState<{ target: SearchTarget; query: string } | null>(null);
  const [creating, setCreating] = useState<NewProductTarget | null>(null);
  const [typed, setTyped] = useState('');
  const [showProblems, setShowProblems] = useState(false);

  const data = boot.status === 'ready' ? boot.data : null;
  const problems = useMemo(() => (draft && data ? validateDraft(draft, { canCreateProduct: data.can.createProduct, supplierCount: data.suppliers.length }) : []), [draft, data]);

  if (!draft || !data) return null;
  const def = MODE_DEFINITIONS[draft.mode];
  const summary = summarizeDraft(draft);
  const lineProblems = new Map(problems.filter((problem) => problem.lineId).map((problem) => [problem.lineId as string, problem.message]));
  const generalProblems = problems.filter((problem) => !problem.lineId);
  const otherWarehouses = data.warehouses.filter((warehouse) => warehouse.id !== draft.warehouseId);

  const leave = async () => {
    if (draft.lines.length === 0) {
      discardDraft();
      onBack();
      return;
    }
    onBack(); // La lista queda guardada: se puede retomar desde el inicio.
  };

  const cancelAll = async () => {
    const ok = await confirm({ title: '¿Descartar esta lista?', description: `Se borrarán los ${draft.lines.length} productos que agregaste. No se envió nada.`, confirmLabel: 'Descartar', destructive: true });
    if (!ok) return;
    discardDraft();
    onBack();
  };

  const submit = () => {
    setShowProblems(true);
    const result = submitDraft();
    if (!result.ok) {
      toast.error(result.problems[0]?.message ?? 'Revisa la lista antes de enviar.');
      return;
    }
    toast.success(result.count === 1 ? 'Guardado. Se está enviando…' : `Guardados ${result.count} productos. Se están enviando…`);
    onDone();
  };

  const typedSubmit = () => {
    const text = typed.trim();
    if (!text) return;
    if (looksLikeCode(text)) {
      addCodeLine(text);
      setTyped('');
    } else {
      setSearch({ target: { kind: 'add' }, query: text });
      setTyped('');
    }
  };

  const openCreate = (lineId: string) => {
    const line = draft.lines.find((candidate) => candidate.id === lineId);
    if (!line) return;
    const { source } = line;
    if (source.kind === 'new') setCreating({ lineId, form: source.form, read: null, photoId: source.photoId });
    else if (source.kind === 'resolve') setCreating({ lineId, form: newProductFormFrom({ read: source.read, code: source.code }), read: source.read, photoId: source.photoId });
  };

  const pickProduct = (product: MobileProduct, factor: number) => {
    if (!search) return;
    if (search.target.kind === 'add') addProductLine(product, { quantity: factor > 1 ? factor : 1, confirmed: true, origin: 'manual' });
    else resolveLine(search.target.lineId, product, { confirmed: true, origin: 'manual', factor });
    setSearch(null);
  };

  const retake = (lineId: string) => {
    removeDraftLine(lineId);
    setCapturing(true);
  };

  const renderLine = (line: DraftLine) => (
    <LineCard
      key={line.id}
      line={line}
      draft={draft}
      problem={showProblems ? (lineProblems.get(line.id) ?? null) : null}
      onSearch={(lineId) => setSearch({ target: { kind: 'line', lineId }, query: '' })}
      onCreate={openCreate}
      onRetake={retake}
      onEvidence={setEvidenceLineId}
    />
  );

  return (
    <div className="flex h-full flex-col">
      {/* Encabezado */}
      <header className="flex items-center gap-2 border-b border-border bg-card px-2 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <button type="button" onClick={() => void leave()} aria-label="Volver al inicio" className="flex size-12 items-center justify-center rounded-xl active:bg-muted">
          <ArrowLeft className="size-6" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{def.label}</h1>
          <p className="truncate text-xs text-muted-foreground">{def.hint}</p>
        </div>
        {draft.lines.length > 0 ? (
          <button type="button" onClick={() => void cancelAll()} className="h-11 rounded-xl px-3 text-sm font-medium text-danger active:bg-danger-soft">
            Descartar
          </button>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {/* Datos del movimiento */}
        <div className="space-y-3 rounded-2xl border border-border bg-card p-3 shadow-card">
          {data.warehouses.length > 1 ? (
            <Field label={isTransferMode(draft.mode) ? 'Sale de' : 'Bodega'}>
              <select value={draft.warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className={inputClass}>
                {data.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="text-sm text-muted-foreground">
              Bodega: <strong className="text-foreground">{data.warehouses[0]?.name}</strong>
            </p>
          )}

          {isTransferMode(draft.mode) ? (
            <Field label="Va a">
              <select value={draft.targetWarehouseId} onChange={(event) => updateDraft((current) => ({ ...current, targetWarehouseId: event.target.value }))} className={inputClass}>
                <option value="">Elige la bodega de destino</option>
                {otherWarehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {def.supplier !== 'none' ? (
            data.suppliers.length > 0 ? (
              <Field label={def.supplier === 'required' ? 'Proveedor *' : 'Proveedor (opcional)'} hint="De quién llega esta mercadería. Queda anotado en cada ingreso.">
                <select value={draft.supplierId} onChange={(event) => updateDraft((current) => ({ ...current, supplierId: event.target.value }))} className={inputClass}>
                  <option value="">Elige el proveedor</option>
                  {data.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name} · {supplier.rut}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Aún no hay proveedores. Pide que los creen en Contactos (marcados como proveedor) para anotar de quién llega la mercadería.</p>
            )
          ) : null}

          {def.asksReference ? (
            <Field label="N° de guía o factura (opcional)">
              <input value={draft.reference} onChange={(event) => updateDraft((current) => ({ ...current, reference: event.target.value }))} className={inputClass} maxLength={60} autoComplete="off" placeholder="Ej. Guía 4521" />
            </Field>
          ) : null}

          {def.asksReason ? (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Motivo</legend>
              <div className="flex flex-wrap gap-2">
                {WASTE_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    aria-pressed={draft.reason === reason}
                    onClick={() => updateDraft((current) => ({ ...current, reason }))}
                    className={`h-11 rounded-full px-4 text-sm font-medium ${draft.reason === reason ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground active:bg-secondary'}`}
                  >
                    {WASTE_REASON_LABELS[reason]}
                  </button>
                ))}
              </div>
              {draft.reason ? <p className="mt-1.5 text-xs text-muted-foreground">{WASTE_REASON_HINTS[draft.reason]}</p> : null}
            </fieldset>
          ) : null}

          <Field label={def.asksReason && reasonRequiresNote(draft.reason || null) ? 'Cuenta qué pasó *' : 'Nota general (opcional)'}>
            <input value={draft.note} onChange={(event) => updateDraft((current) => ({ ...current, note: event.target.value }))} className={inputClass} maxLength={120} autoComplete="off" />
          </Field>
        </div>

        {/* Agregar por escritura o lector de mano */}
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            typedSubmit();
          }}
        >
          <div className="relative flex-1">
            <ScanBarcode className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Escanea o escribe código o nombre"
              aria-label="Código o nombre del producto"
              enterKeyHint="go"
              autoComplete="off"
              className={`${inputClass} pl-10`}
            />
          </div>
          <BigButton type="submit" variant="secondary" aria-label="Buscar" className="w-12 px-0">
            <Search className="size-5" />
          </BigButton>
        </form>

        {/* Líneas */}
        {draft.lines.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border p-6 text-center">
            <Camera className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-3 text-base font-medium">Todavía no hay productos</p>
            <p className="mt-1 text-sm text-muted-foreground">Toca «Cámara» y apunta al código de barras. Si el producto no tiene, sácale una foto: la reconocemos por ti.</p>
          </div>
        ) : (
          <ul className="mt-3 space-y-3 pb-4">{draft.lines.map(renderLine)}</ul>
        )}

        {identifying && summary.identifying > 0 ? <p className="pb-2 text-center text-xs text-muted-foreground">Reconociendo productos en segundo plano…</p> : null}
      </div>

      {/* Barra de acciones */}
      <footer className="border-t border-border bg-card px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {draft.lines.length > 0 ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
            <Pill tone="success">
              <Check className="size-3.5" /> {summary.ready} listo{summary.ready === 1 ? '' : 's'}
            </Pill>
            {summary.identifying > 0 ? <Pill tone="info">{summary.identifying} identificándose</Pill> : null}
            {summary.needsYou > 0 ? <Pill tone="warning">{summary.needsYou} por revisar</Pill> : null}
          </div>
        ) : null}
        {showProblems && generalProblems.length > 0 ? (
          <p role="alert" className="mb-2 text-sm text-danger">
            {generalProblems[0]?.message}
          </p>
        ) : null}
        <div className="flex gap-2">
          <BigButton variant="secondary" onClick={() => setCapturing(true)} className="flex-1">
            <Camera className="size-5" /> Cámara
          </BigButton>
          <BigButton onClick={submit} disabled={draft.lines.length === 0} className="flex-[1.4]">
            Enviar {draft.lines.length > 0 ? `(${draft.lines.length})` : ''}
          </BigButton>
        </div>
      </footer>

      {capturing ? (
        <CaptureScreen
          onClose={() => setCapturing(false)}
          onCode={(code) => addCodeLine(code)}
          onPhoto={async (photo) => {
            await addPhotoLine(photo);
          }}
        />
      ) : null}

      {evidenceLineId ? (
        <CaptureScreen
          photoOnly
          onCode={() => undefined}
          onPhoto={(photo) => attachEvidence(evidenceLineId, photo)}
          onClose={() => setEvidenceLineId(null)}
        />
      ) : null}

      <SearchSheet
        open={search !== null}
        title={search?.target.kind === 'line' ? '¿Qué producto es?' : 'Buscar producto'}
        initialQuery={search?.query ?? ''}
        onClose={() => setSearch(null)}
        onPick={pickProduct}
      />

      {creating ? (
        <NewProductSheet
          open
          initial={creating.form}
          read={creating.read}
          photoId={creating.photoId}
          boot={data}
          onClose={() => setCreating(null)}
          onSave={(form) => {
            setLineSource(creating.lineId, { kind: 'new', form, photoId: creating.photoId });
            // Una lectura de IA ya no hace falta una vez que la persona revisó y guardó el formulario.
            setCreating(null);
          }}
        />
      ) : null}
    </div>
  );
}

