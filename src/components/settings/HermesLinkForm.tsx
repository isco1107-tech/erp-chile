'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { publicUrl } from '@/lib/public-url';
import {
  changeHermesWarehouseAction,
  issueHermesKeyAction,
  revokeHermesKeyAction,
  type HermesLinkView,
} from '@/modules/hermes/actions/hermes-link.actions';

/**
 * Conexión con Hermes (la agenda del ecosistema Aether): con esta llave, la caja de Hermes
 * consulta el catálogo con stock de una bodega y registra ventas de productos como boletas,
 * por el mismo camino de la tienda en línea. La llave se muestra una sola vez.
 */
export default function HermesLinkForm({ initial }: { initial: HermesLinkView }) {
  const confirm = useConfirm();
  const [view, setView] = useState(initial);
  const [warehouseId, setWarehouseId] = useState(initial.warehouseId ?? initial.warehouses[0]?.id ?? '');
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const apiUrl = publicUrl('/api/hermes/v1');

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    } catch {
      toast.error('No se pudo copiar. Selecciona el texto manualmente.');
    }
  }

  async function issue() {
    if (view.connected && !(await confirm('La llave anterior dejará de funcionar de inmediato y Hermes no podrá vender hasta que pegues la nueva. ¿Continuar?'))) return;
    setBusy(true);
    try {
      const r = await issueHermesKeyAction(warehouseId);
      if (!r.success) return void toast.error(r.error);
      setKey(r.data);
      const name = view.warehouses.find((w) => w.id === warehouseId)?.name ?? null;
      setView({ ...view, connected: true, warehouseId, warehouseName: name, keyPrefix: r.data.slice(0, 9), lastUsedAt: null });
      toast.success(r.message ?? 'Llave generada');
    } finally {
      setBusy(false);
    }
  }

  async function changeWarehouse(next: string) {
    setWarehouseId(next);
    if (!view.connected) return;
    setBusy(true);
    try {
      const r = await changeHermesWarehouseAction(next);
      if (!r.success) return void toast.error(r.error);
      setView({ ...view, warehouseId: next, warehouseName: view.warehouses.find((w) => w.id === next)?.name ?? null });
      toast.success(r.message ?? 'Bodega actualizada');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!(await confirm('Hermes dejará de ver tus productos y de vender desde su caja. Las ventas ya hechas no cambian. ¿Desactivar?'))) return;
    setBusy(true);
    try {
      const r = await revokeHermesKeyAction();
      if (!r.success) return void toast.error(r.error);
      setKey(null);
      setView({ ...view, connected: false, keyPrefix: null, lastUsedAt: null });
      toast.success(r.message ?? 'Desactivada');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-xl border border-border p-4">
      <div>
        <h2 className="font-semibold">Conexión con Hermes</h2>
        <p className="text-sm text-muted-foreground">
          La caja de Hermes ve tus productos con su precio y stock, y cada venta llega aquí como boleta: descuenta el
          kardex al costo promedio, deja el asiento y el cobro en Tesorería. El precio siempre es el de tu catálogo.
        </p>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Bodega desde la que vende Hermes</span>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2"
          value={warehouseId}
          disabled={busy || view.warehouses.length === 0}
          onChange={(e) => void changeWarehouse(e.target.value)}
        >
          {view.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>

      {view.connected ? (
        <p className="text-sm">
          Conectada con la llave <code className="rounded bg-muted px-1">{view.keyPrefix}…</code>
          {view.lastUsedAt ? ` · último uso ${new Date(view.lastUsedAt).toLocaleDateString('es-CL')}` : ' · todavía no se usa'}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Sin conexión.</p>
      )}

      {key && (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm" role="status">
          <p className="font-medium">Copia la llave ahora: no se vuelve a mostrar.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1">{key}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => void copy(key, 'Llave')}><Copy className="h-4 w-4" aria-hidden="true" /> Copiar</Button>
          </div>
          <p className="text-muted-foreground">
            En Hermes: Administración → CRM → Conexión con el ERP, pega esta llave y la dirección{' '}
            <code className="break-all rounded bg-background px-1">{apiUrl}</code>.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy || !warehouseId} onClick={() => void issue()}>
          {view.connected ? 'Generar llave nueva' : 'Conectar con Hermes'}
        </Button>
        {view.connected && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void revoke()}>Desactivar</Button>
        )}
      </div>
    </div>
  );
}
