'use client';

import { useState } from 'react';
import { ArrowLeftRight, CloudUpload, Download, LogOut, PackageMinus, PackagePlus, Plus, Search, Trash2, Undo2, TriangleAlert, WifiOff, X } from 'lucide-react';
import { MODE_DEFINITIONS, MOBILE_MODES, type MobileMode } from '@/lib/warehouse-mobile/modes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { useBodega } from './BodegaProvider';
import SearchSheet from './SearchSheet';
import { Pill, Sheet, Spinner, formatQty, inputClass } from './ui';

const MODE_ICONS: Record<MobileMode, typeof PackagePlus> = {
  RECEIVE: PackagePlus,
  RETURN: Undo2,
  SURPLUS: Plus,
  WASTE: Trash2,
  SHORTAGE: PackageMinus,
  TRANSFER: ArrowLeftRight,
};

/** Tono de cada botón: lo que suma, lo que resta y lo que mueve. */
const MODE_TONE: Record<MobileMode, string> = {
  RECEIVE: 'bg-success-soft text-success',
  RETURN: 'bg-success-soft text-success',
  SURPLUS: 'bg-success-soft text-success',
  WASTE: 'bg-danger-soft text-danger',
  SHORTAGE: 'bg-danger-soft text-danger',
  TRANSFER: 'bg-info-soft text-info',
};

interface Props {
  onStart: (mode: MobileMode) => void;
  onContinue: () => void;
  onOutbox: () => void;
}

export default function HomeScreen({ onStart, onContinue, onOutbox }: Props) {
  const confirm = useConfirm();
  const { boot, draft, summary, online, syncing, persistent, auth, warehouseId, setWarehouseId, canInstall, install, logout, discardDraft } = useBodega();
  const [looking, setLooking] = useState(false);
  const [menu, setMenu] = useState(false);
  const [info, setInfo] = useState<{ name: string; text: string } | null>(null);

  if (boot.status !== 'ready') return null;
  const { data } = boot;
  const warehouse = data.warehouses.find((candidate) => candidate.id === warehouseId);

  const start = async (mode: MobileMode) => {
    if (draft && draft.mode !== mode && draft.lines.length > 0) {
      const ok = await confirm({
        title: 'Tienes una lista sin enviar',
        description: `Hay ${draft.lines.length} producto${draft.lines.length === 1 ? '' : 's'} en «${MODE_DEFINITIONS[draft.mode].label}». Si empiezas otra, esa lista se descarta. ¿Descartarla?`,
        confirmLabel: 'Descartar y empezar otra',
        destructive: true,
      });
      if (!ok) return;
      discardDraft();
    }
    onStart(mode);
  };

  const askLogout = async () => {
    if (summary.pending > 0) {
      const ok = await confirm({
        title: 'Tienes movimientos sin enviar',
        description: `Hay ${summary.pending} guardados en este teléfono. Si cierras sesión, se enviarán la próxima vez que entres con esta misma cuenta. ¿Cerrar sesión igual?`,
        confirmLabel: 'Cerrar sesión',
        destructive: true,
      });
      if (!ok) return;
    }
    await logout();
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">{data.company.name}</p>
          <h1 className="truncate text-lg font-semibold">Hola, {data.user.name.split(' ')[0]}</h1>
        </div>
        {!online ? (
          <Pill tone="warning">
            <WifiOff className="size-3.5" /> Sin conexión
          </Pill>
        ) : syncing || summary.pending > 0 ? (
          <Pill tone="info">
            <Spinner className="size-3.5" /> Enviando
          </Pill>
        ) : (
          <Pill tone="success">En línea</Pill>
        )}
        <button type="button" onClick={() => setMenu(true)} aria-label="Menú" className="flex size-11 items-center justify-center rounded-xl bg-muted active:bg-secondary">
          <span aria-hidden="true" className="text-xl leading-none">
            ⋯
          </span>
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {auth ? (
          <div role="alert" className="rounded-2xl bg-warning-soft p-3 text-sm text-warning">
            <p className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {auth.message}
            </p>
            {auth.status === 401 ? (
              <a href="/login?callbackUrl=/bodega" className="mt-2 inline-flex h-11 items-center rounded-xl bg-primary px-4 font-semibold text-primary-foreground">
                Iniciar sesión
              </a>
            ) : null}
          </div>
        ) : null}

        {!persistent ? (
          <p className="rounded-2xl bg-warning-soft p-3 text-sm text-warning">Tu navegador no permite guardar datos en el teléfono: si cierras la app antes de enviar, se perdería lo pendiente. Evita el modo privado.</p>
        ) : null}

        {data.warehouses.length > 1 ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Bodega</span>
            <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className={inputClass}>
              {data.warehouses.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-muted-foreground">
            Bodega: <strong className="text-foreground">{warehouse?.name}</strong>
          </p>
        )}

        {draft && draft.lines.length > 0 ? (
          <button type="button" onClick={onContinue} className="flex w-full items-center gap-3 rounded-2xl border border-brand-gold bg-accent p-4 text-left active:opacity-85">
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-accent-foreground">Continuar: {MODE_DEFINITIONS[draft.mode].label}</span>
              <span className="block text-sm text-accent-foreground/80">
                {draft.lines.length} producto{draft.lines.length === 1 ? '' : 's'} sin enviar
              </span>
            </span>
            <span className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Seguir</span>
          </button>
        ) : null}

        {data.can.move ? (
          <section aria-label="¿Qué vas a hacer?">
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">¿Qué vas a hacer?</h2>
            <div className="grid grid-cols-2 gap-3">
              {MOBILE_MODES.filter((mode) => mode !== 'TRANSFER' || data.warehouses.length > 1).map((mode) => {
                const Icon = MODE_ICONS[mode];
                const def = MODE_DEFINITIONS[mode];
                return (
                  <button key={mode} type="button" onClick={() => void start(mode)} className="flex min-h-32 flex-col items-start justify-between gap-2 rounded-2xl border border-border bg-card p-3 text-left shadow-card active:bg-muted">
                    <span className={`flex size-11 items-center justify-center rounded-xl ${MODE_TONE[mode]}`}>
                      <Icon className="size-6" />
                    </span>
                    <span>
                      <span className="block text-base leading-tight font-semibold">{def.label}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{def.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">Tu rol solo permite consultar productos. Pide a un administrador que te habilite para registrar movimientos.</p>
        )}

        <button type="button" onClick={() => setLooking(true)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 text-left active:bg-muted">
          <Search className="size-5 text-muted-foreground" />
          <span className="flex-1 text-base font-medium">Consultar cuánto hay de un producto</span>
        </button>

        <button type="button" onClick={onOutbox} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 text-left active:bg-muted">
          <CloudUpload className="size-5 text-muted-foreground" />
          <span className="flex-1 text-base font-medium">Pendientes y enviados</span>
          {summary.rejected > 0 ? <Pill tone="danger">{summary.rejected} con problema</Pill> : null}
          {summary.pending > 0 ? <Pill tone={summary.stalled > 0 ? 'warning' : 'info'}>{summary.pending} por enviar</Pill> : null}
        </button>
      </div>

      <SearchSheet
        open={looking}
        title="Consultar producto"
        onClose={() => setLooking(false)}
        onPick={(product) => {
          setLooking(false);
          setInfo({
            name: product.name,
            text: `${product.sku}${product.brand ? ` · ${product.brand}` : ''}\nEn ${warehouse?.name ?? 'esta bodega'}: ${formatQty(product.stock)} ${product.unit}\nEn todas las bodegas: ${formatQty(product.totalStock)} ${product.unit}`,
          });
        }}
      />

      <Sheet open={info !== null} title={info?.name ?? ''} onClose={() => setInfo(null)}>
        <p className="text-base whitespace-pre-line">{info?.text}</p>
      </Sheet>

      <Sheet open={menu} title="Menú" onClose={() => setMenu(false)}>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {data.user.name} · {data.user.roleLabel}
          </p>
          {canInstall ? (
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                void install();
              }}
              className="flex h-14 w-full items-center gap-3 rounded-xl bg-muted px-4 text-base font-medium active:bg-secondary"
            >
              <Download className="size-5" /> Instalar la app en el teléfono
            </button>
          ) : (
            <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Para tenerla como app: en Android abre el menú del navegador y elige «Instalar app»; en iPhone toca Compartir y «Agregar a inicio».</p>
          )}
          <button type="button" onClick={() => void askLogout()} className="flex h-14 w-full items-center gap-3 rounded-xl bg-danger-soft px-4 text-base font-medium text-danger active:opacity-85">
            <LogOut className="size-5" /> Cerrar sesión
          </button>
          <button type="button" onClick={() => setMenu(false)} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-medium active:bg-muted">
            <X className="size-5" /> Cerrar menú
          </button>
        </div>
      </Sheet>
    </div>
  );
}
