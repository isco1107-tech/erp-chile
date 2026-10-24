'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock, RefreshCw, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createCashRegisterAction,
  listCashRegisterStatusesAction,
  openShiftAction,
} from '@/modules/pos/actions/pos.actions';
import type { CashRegisterStatus } from '@/modules/pos/services/cash.service';
import { formatCurrency } from '@/lib/chile/tax';
import { PosDesktopDownload } from './PosDesktopDownload';

const selectClass =
  'h-10 w-full min-w-0 rounded-xl border border-input bg-muted px-3 py-1 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 md:text-sm';

interface Props {
  cashierName: string;
  cashierEmail: string;
  canManageRegisters: boolean;
  warehouses: Array<{ id: string; name: string }>;
}

/**
 * Puerta de entrada del POS: sin turno abierto no se puede vender.
 *
 * El monto inicial es obligatorio porque es la base del arqueo: si el fondo de
 * cambio no queda registrado al abrir, al cerrar es imposible distinguir un
 * descuadre real de la plata con la que se partió.
 */
export default function OpenShiftPanel({ cashierName, cashierEmail, canManageRegisters, warehouses }: Props) {
  const router = useRouter();

  const [registers, setRegisters] = useState<CashRegisterStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashRegisterId, setCashRegisterId] = useState('');
  const [initialAmount, setInitialAmount] = useState('');
  const [openingNotes, setOpeningNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const operationInFlight = useRef(false);
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newWarehouseId, setNewWarehouseId] = useState(warehouses[0]?.id ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await listCashRegisterStatusesAction();
      if (result.success) {
        setRegisters(result.data);
        setCashRegisterId((previous) => result.data.some((register) => register.id === previous && !register.occupied)
          ? previous : result.data.find((register) => !register.occupied)?.id ?? '');
      } else {
        setLoadError(true);
        toast.error(result.error);
      }
    } catch {
      setLoadError(true);
      toast.error('No se pudieron consultar las cajas. Revisa tu conexión y actualiza.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleOpen() {
    if (operationInFlight.current) return;
    const amount = Number(initialAmount);
    if (initialAmount.trim() === '' || !Number.isSafeInteger(amount) || amount < 0) {
      toast.error('El monto inicial debe ser un número entero mayor o igual a cero');
      return;
    }
    if (!cashRegisterId) {
      toast.error('Seleccione una caja');
      return;
    }

    operationInFlight.current = true;
    setSaving(true);
    try {
      const result = await openShiftAction({ cashRegisterId, initialAmount: amount, openingNotes });
      if (!result.success) {
        toast.error(result.error);
        // Una apertura previa puede haberse confirmado aunque se perdiera la
        // respuesta. La pantalla servidor reanuda ese turno sin abrir otro.
        router.refresh();
        await load();
        return;
      }
      toast.success(result.message ?? 'Caja abierta');
      router.refresh();
    } catch {
      toast.error('No se pudo confirmar la apertura. Actualiza las cajas antes de volver a intentarlo.');
      router.refresh();
      void load();
    } finally {
      operationInFlight.current = false;
      setSaving(false);
    }
  }

  async function handleCreateRegister() {
    if (operationInFlight.current) return;
    if (!newName.trim() || !newWarehouseId) {
      toast.error('Indique nombre y bodega de la caja');
      return;
    }
    operationInFlight.current = true;
    setCreating(true);
    try {
      const result = await createCashRegisterAction({ name: newName.trim(), warehouseId: newWarehouseId });
      if (!result.success) { toast.error(result.error); return; }
      toast.success(result.message ?? 'Caja creada');
      setNewName('');
      setShowCreate(false);
      await load();
    } catch {
      toast.error('No se pudo confirmar la creación. Actualiza las cajas antes de volver a intentarlo.');
    } finally {
      operationInFlight.current = false;
      setCreating(false);
    }
  }

  const selectedRegister = registers.find((register) => register.id === cashRegisterId);
  const availableCount = registers.filter((register) => !register.occupied).length;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex justify-end"><PosDesktopDownload /></div>
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-primary/10 bg-accent">
          <Lock className="size-6 text-accent-foreground" />
        </div>
        <h1 className="text-2xl font-bold" data-tutorial="module-header">Abrir caja</h1>
        <p className="text-sm text-muted-foreground">
          No tienes un turno abierto. Declara el fondo de cambio con el que partes para poder vender.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-3">
          <UserRound className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Cajero identificado</p>
            <p className="break-words font-semibold">{cashierName}</p>
            <p className="break-all text-xs text-muted-foreground">{cashierEmail}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">La apertura, las ventas y los movimientos quedarán a nombre de esta cuenta. Cada operario debe usar su propio usuario y contraseña.</p>
      </div>

      <fieldset disabled={saving || creating} className="border border-border bg-card shadow-card space-y-4 rounded-2xl p-5">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <Label htmlFor="register">Caja</Label>
            <Button type="button" variant="ghost" size="xs" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-1 size-3 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Actualizar cajas
            </Button>
          </div>
          <select
            id="register"
            className={selectClass}
            value={cashRegisterId}
            onChange={(e) => setCashRegisterId(e.target.value)}
            disabled={loading || registers.length === 0}
          >
            <option value="">{loading ? 'Consultando cajas…' : 'Selecciona una caja disponible'}</option>
            {registers.map((register) => (
              <option key={register.id} value={register.id} disabled={register.occupied}>
                {register.name} — {register.warehouse.name}{register.occupied ? ` · Ocupada${register.cashierName ? ` por ${register.cashierName}` : ''}` : ' · Disponible'}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground" role="status">
            {loadError ? 'No se pudo obtener el estado de las cajas. Presiona "Actualizar cajas".'
              : !loading && registers.length === 0 ? 'No hay cajas ni bodega disponibles. Solicita al administrador configurar una bodega y una caja.'
                : !loading && availableCount === 0 ? 'Todas las cajas están ocupadas. Espera su cierre o solicita otra caja al administrador.'
                : selectedRegister ? `Las ventas descontarán stock de ${selectedRegister.warehouse.name}.`
                  : 'Cada caja tiene un solo turno activo. Las demás pueden vender al mismo tiempo.'}
          </p>
        </div>

        <div>
          <Label htmlFor="initial">Monto inicial en caja</Label>
          <Input
            id="initial"
            type="number"
            min={0}
            step={1}
            value={initialAmount}
            onChange={(e) => setInitialAmount(e.target.value)}
            className="h-12 text-lg"
            inputMode="numeric"
            placeholder="Cuenta y escribe el efectivo inicial"
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {formatCurrency(Number(initialAmount) || 0)} en efectivo al iniciar el turno.
          </p>
        </div>

        <div>
          <Label htmlFor="notes">Observaciones (opcional)</Label>
          <Input id="notes" maxLength={300} value={openingNotes} onChange={(e) => setOpeningNotes(e.target.value)} />
        </div>

        <Button
          type="button"
          className="h-11 w-full"
          disabled={saving || loading || loadError || !selectedRegister || selectedRegister.occupied || initialAmount.trim() === ''}
          onClick={handleOpen}
        >
          {saving ? 'Abriendo...' : 'Abrir caja y comenzar a vender'}
        </Button>
      </fieldset>

      {canManageRegisters && (
        <div className="border border-border bg-card shadow-card rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Cajas del local</p>
            <Button type="button" size="xs" variant="outline" onClick={() => setShowCreate((s) => !s)}>
              {showCreate ? 'Cerrar' : '+ Nueva caja'}
            </Button>
          </div>
          {showCreate && (
            <fieldset disabled={creating || saving} className="mt-3 space-y-2">
              <div>
                <Label htmlFor="new-name">Nombre</Label>
                <Input
                  id="new-name"
                  placeholder="Ej: Caja 2 Mesón"
                  maxLength={60}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="new-warehouse">Bodega</Label>
                <select
                  id="new-warehouse"
                  className={selectClass}
                  value={newWarehouseId}
                  onChange={(e) => setNewWarehouseId(e.target.value)}
                >
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="button" size="sm" onClick={handleCreateRegister}>
                {creating ? 'Creando…' : 'Crear caja'}
              </Button>
            </fieldset>
          )}
        </div>
      )}
    </div>
  );
}
