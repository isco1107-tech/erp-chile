'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createCashRegisterAction,
  listCashRegistersAction,
  openShiftAction,
} from '@/modules/pos/actions/pos.actions';
import type { CashRegisterWithWarehouse } from '@/modules/pos/services/cash.service';
import { formatCurrency } from '@/lib/chile/tax';

const selectClass =
  'h-10 w-full min-w-0 rounded-xl border border-input bg-muted px-3 py-1 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 md:text-sm';

interface Props {
  canManageRegisters: boolean;
  warehouses: Array<{ id: string; name: string }>;
  standalone?: boolean;
}

const INITIAL_CASH_PRESETS = [0, 20000, 50000, 100000];

/**
 * Puerta de entrada del POS: sin turno abierto no se puede vender.
 *
 * El monto inicial es obligatorio porque es la base del arqueo: si el fondo de
 * cambio no queda registrado al abrir, al cerrar es imposible distinguir un
 * descuadre real de la plata con la que se partió.
 */
export default function OpenShiftPanel({ canManageRegisters, warehouses, standalone }: Props) {
  const router = useRouter();

  const [registers, setRegisters] = useState<CashRegisterWithWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashRegisterId, setCashRegisterId] = useState('');
  const [initialAmount, setInitialAmount] = useState('0');
  const [openingNotes, setOpeningNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newWarehouseId, setNewWarehouseId] = useState(warehouses[0]?.id ?? '');

  async function load() {
    setLoading(true);
    const result = await listCashRegistersAction();
    if (result.success) {
      setRegisters(result.data);
      if (result.data[0]) setCashRegisterId((prev) => prev || result.data[0]!.id);
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleOpen() {
    const amount = Number(initialAmount);
    if (!Number.isInteger(amount) || amount < 0) {
      toast.error('El monto inicial debe ser un número entero mayor o igual a cero');
      return;
    }
    if (!cashRegisterId) {
      toast.error('Seleccione una caja');
      return;
    }

    setSaving(true);
    try {
      const result = await openShiftAction({ cashRegisterId, initialAmount: amount, openingNotes });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Caja abierta');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateRegister() {
    if (!newName.trim() || !newWarehouseId) {
      toast.error('Indique nombre y bodega de la caja');
      return;
    }
    const result = await createCashRegisterAction({ name: newName.trim(), warehouseId: newWarehouseId });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Caja creada');
    setNewName('');
    setShowCreate(false);
    load();
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 py-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-primary/10 bg-accent">
          <Lock className="size-6 text-accent-foreground" />
        </div>
        <h1 className="text-2xl font-bold" data-tutorial="module-header">
          Abrir turno de caja
        </h1>
        <p className="text-sm text-muted-foreground">
          Selecciona el terminal de caja y declara el fondo de sencillo con el que inicias el turno.
        </p>
        <div className="pt-1">
          {!standalone ? (
            <Link
              href="/pos"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-card transition-colors hover:bg-accent"
            >
              <ExternalLink className="size-3.5" /> Abrir en App Exclusiva de Caja (/pos)
            </Link>
          ) : (
            <Link
              href="/dashboard/pos"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" /> Volver al panel ERP
            </Link>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
        <div>
          <Label htmlFor="register">Terminal / Caja</Label>
          <select
            id="register"
            className={selectClass}
            value={cashRegisterId}
            onChange={(e) => setCashRegisterId(e.target.value)}
            disabled={loading || registers.length === 0}
          >
            {registers.length === 0 && <option value="">Sin cajas disponibles</option>}
            {registers.map((register) => (
              <option key={register.id} value={register.id}>
                {register.name} — Bodega: {register.warehouse.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Cada venta descontará stock al PMP vigente (y lotes FEFO) desde la bodega asociada a esta caja.
          </p>
        </div>

        <div>
          <Label htmlFor="initial">Fondo inicial de sencillo en gaveta</Label>
          <Input
            id="initial"
            type="number"
            min={0}
            step={1}
            value={initialAmount}
            onChange={(e) => setInitialAmount(e.target.value)}
            className="h-12 text-lg tabular-nums"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {INITIAL_CASH_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="xs"
                variant="outline"
                onClick={() => setInitialAmount(String(preset))}
              >
                {formatCurrency(preset)}
              </Button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatCurrency(Number(initialAmount) || 0)} en efectivo al iniciar el turno.
          </p>
        </div>

        <div>
          <Label htmlFor="notes">Observaciones de apertura (opcional)</Label>
          <Input
            id="notes"
            placeholder="Ej: Turno mañana, Caja 1"
            value={openingNotes}
            onChange={(e) => setOpeningNotes(e.target.value)}
          />
        </div>

        <Button
          type="button"
          className="h-11 w-full"
          disabled={saving || loading || registers.length === 0}
          onClick={handleOpen}
        >
          {saving ? 'Abriendo…' : 'Abrir caja y comenzar a vender'}
        </Button>
      </div>

      {canManageRegisters && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Terminales de caja del supermercado / local</p>
            <Button type="button" size="xs" variant="outline" onClick={() => setShowCreate((s) => !s)}>
              {showCreate ? 'Cerrar' : '+ Nueva caja'}
            </Button>
          </div>
          {showCreate && (
            <div className="mt-3 space-y-2">
              <div>
                <Label htmlFor="new-name">Nombre de la caja</Label>
                <Input
                  id="new-name"
                  placeholder="Ej: Caja 2 Rápida / Caja 3 Fiambrería"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="new-warehouse">Bodega / Sala de ventas</Label>
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
                Crear caja
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
