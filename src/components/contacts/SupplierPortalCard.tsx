'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, ExternalLink, KeyRound, Link2Off, Plus, RefreshCw, Trash2, Truck } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-provider';
import {
  createSupplierPortalCodeAction,
  linkSupplierProductAction,
  revokeSupplierPortalAction,
  searchSupplierProductsAction,
  setSupplierPortalMovementAction,
  unlinkSupplierProductAction,
} from '@/modules/inventory/actions/supplier-portal.actions';
import type { SupplierPortalAdmin } from '@/modules/inventory/services/supplier-portal.service';

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}

/**
 * Portal del proveedor desde su ficha: genera (o regenera) el código con el que el proveedor
 * entra a ver cuánto le queda en bodega de SUS productos, y administra qué productos son suyos.
 * El código completo solo se muestra al generarlo (en la base queda su huella).
 */
export default function SupplierPortalCard({ contactId, contactName, phone, admin, baseUrl }: { contactId: string; contactName: string; phone: string | null; admin: SupplierPortalAdmin; baseUrl: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [issued, setIssued] = useState<{ code: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Array<{ id: string; sku: string; name: string }>>([]);
  const searchSeq = useRef(0);
  const { access, products } = admin;

  // Búsqueda de productos para agregar, con una pequeña espera para no consultar en cada letra.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setFound([]);
      return;
    }
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      const result = await searchSupplierProductsAction(contactId, text);
      if (seq === searchSeq.current && result.success) setFound(result.data);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, contactId]);

  async function run<T>(work: () => Promise<{ success: true; data: T; message?: string } | { success: false; error: string }>, onOk?: (data: T) => void) {
    setBusy(true);
    try {
      const result = await work();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onOk?.(result.data);
      if (result.message) toast.success(result.message);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (access && !(await confirm({ title: '¿Generar un código nuevo?', description: 'El código anterior dejará de funcionar de inmediato. Tendrás que entregarle el nuevo al proveedor.', confirmLabel: 'Generar nuevo' }))) return;
    await run(() => createSupplierPortalCodeAction(contactId), setIssued);
  }

  async function revoke() {
    if (!(await confirm({ title: '¿Desactivar el acceso del proveedor?', description: 'Su código dejará de funcionar y no podrá ver más el inventario. Puedes generar uno nuevo cuando quieras.', confirmLabel: 'Desactivar' }))) return;
    await run(() => revokeSupplierPortalAction(contactId), () => setIssued(null));
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copiado`);
    } catch {
      toast.error('No se pudo copiar: selecciónalo a mano');
    }
  }

  const digits = (phone ?? '').replace(/\D/g, '');
  const whatsapp = issued
    ? `https://wa.me/${digits.length >= 8 ? digits : ''}?text=${encodeURIComponent(`Hola ${contactName}, aquí puedes ver cuánto inventario te queda de tus productos: ${issued.url}\nO entra a ${baseUrl}/proveedor e ingresa tu código: ${issued.code}`)}`
    : null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent">
            <Truck className="size-4 text-accent-foreground" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Portal del proveedor</h3>
            <p className="text-xs text-muted-foreground">
              {access ? `Activo desde el ${formatDate(access.createdAt)} (código …${access.hint}). ${access.lastUsedAt ? `Último ingreso: ${formatDate(access.lastUsedAt)}.` : 'Aún no ha ingresado.'} ` : 'Sin acceso activo. '}
              Con su código, el proveedor ve cuánto le queda en bodega de sus productos para analizar y reponer. Solo ve cantidades: nunca costos ni precios.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {access && (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={revoke}>
              <Link2Off className="size-3.5" aria-hidden="true" /> Desactivar
            </Button>
          )}
          <Button type="button" size="sm" variant={access ? 'outline' : 'default'} disabled={busy} onClick={generate}>
            {access ? <RefreshCw className="size-3.5" aria-hidden="true" /> : <KeyRound className="size-3.5" aria-hidden="true" />} {access ? 'Generar código nuevo' : 'Generar código'}
          </Button>
        </div>
      </div>

      {issued && (
        <div className="mt-4 space-y-2 rounded-md bg-muted p-3">
          <p className="text-xs font-medium">Entrégale este código al proveedor (se muestra solo ahora):</p>
          <p className="font-mono text-xl font-semibold tracking-wider" data-testid="supplier-code">
            {issued.code}
          </p>
          <p className="text-xs text-muted-foreground">
            Lo escribe en {baseUrl}/proveedor, o abre directamente este enlace: <span className="break-all font-mono">{issued.url}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="xs" variant="outline" onClick={() => copy(issued.code, 'Código')}>
              <Copy aria-hidden="true" /> Copiar código
            </Button>
            <Button type="button" size="xs" variant="outline" onClick={() => copy(issued.url, 'Enlace')}>
              <Copy aria-hidden="true" /> Copiar enlace
            </Button>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'xs', variant: 'outline' })}>
                WhatsApp
              </a>
            )}
            <a href={issued.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'xs', variant: 'ghost' })}>
              <ExternalLink aria-hidden="true" /> Abrir
            </a>
          </div>
        </div>
      )}

      {access && (
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={access.showMovement}
            disabled={busy}
            onChange={(event) => void run(() => setSupplierPortalMovementAction(contactId, event.target.checked))}
            className="mt-0.5 size-4"
          />
          <span>
            Mostrar también lo que sale (ventas y bajas de los últimos 30 días) y los días que alcanza el stock
            <span className="block text-xs text-muted-foreground">Si lo apagas, el proveedor ve solo las existencias.</span>
          </span>
        </label>
      )}

      <div className="mt-5">
        <h4 className="text-sm font-medium text-foreground">Productos de este proveedor ({products.length})</h4>
        <p className="mb-2 text-xs text-muted-foreground">Se agregan solos cuando el bodeguero registra una llegada de este proveedor en la app. Aquí puedes sumar o quitar productos a mano.</p>
        {products.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">Producto</th>
                  <th className="py-1.5 pr-3">SKU</th>
                  <th className="py-1.5 pr-3 text-right">Stock</th>
                  <th className="py-1.5 pr-3">Última llegada</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-t border-border">
                    <td className="py-1.5 pr-3">{product.name}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs">{product.sku}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {product.stock} {product.unit}
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{product.lastReceivedAt ? formatDate(product.lastReceivedAt) : '—'}</td>
                    <td className="py-1.5 text-right">
                      <Button type="button" size="xs" variant="ghost" disabled={busy} aria-label={`Quitar ${product.name}`} onClick={() => void run(() => unlinkSupplierProductAction(contactId, product.id))}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Todavía no tiene productos. Aparecerán cuando registres una llegada de este proveedor, o agrégalos aquí.</p>
        )}

        <div className="relative mt-3 max-w-md">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Agregar un producto: busca por nombre o SKU" aria-label="Buscar un producto para agregar" autoComplete="off" />
          {found.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
              {found.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => linkSupplierProductAction(contactId, product.id),
                        () => {
                          setQuery('');
                          setFound([]);
                        }
                      )
                    }
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="truncate">{product.name}</span>
                    <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-muted-foreground">
                      {product.sku} <Plus className="size-3.5" aria-hidden="true" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
