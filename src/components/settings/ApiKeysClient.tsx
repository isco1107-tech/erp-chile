'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, KeyRound, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useConfirm } from '@/components/ui/confirm-provider';
import { API_SCOPES, API_SCOPE_KEYS, type ApiScope } from '@/lib/api/api-keys';
import { createApiKeyAction, listApiKeysAction, revokeApiKeyAction } from '@/modules/api-keys/actions/api-keys.actions';
import type { ApiKeyRow } from '@/modules/api-keys/services/api-keys.service';

const formatDate = (date: Date | string | null) => (date ? new Date(date).toLocaleString('es-CL', { timeZone: 'America/Santiago' }) : 'Nunca');

export default function ApiKeysClient({ baseUrl }: { baseUrl: string }) {
  const confirm = useConfirm();
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Set<ApiScope>>(new Set(['products:read', 'stock:read', 'sales:write']));
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await listApiKeysAction();
    if (result.success) setKeys(result.data);
    else toast.error(result.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      const result = await createApiKeyAction({ name, scopes: [...scopes] });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setPlaintext(result.data.plaintext);
      setCreating(false);
      setName('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(key: ApiKeyRow) {
    const ok = await confirm({ title: `¿Revocar "${key.name}"?`, description: 'Toda integración que la use dejará de funcionar de inmediato. No se puede deshacer.', confirmLabel: 'Revocar' });
    if (!ok) return;
    const result = await revokeApiKeyAction(key.id);
    if (!result.success) toast.error(result.error);
    else {
      toast.success(result.message ?? 'Revocada');
      await load();
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copiado');
    } catch {
      toast.error('No se pudo copiar: selecciónalo y cópialo a mano');
    }
  }

  const exampleKey = 'aek_TU_LLAVE';
  const curlMe = `curl ${baseUrl}/api/v1/me \\\n  -H "Authorization: Bearer ${exampleKey}"`;
  const curlSale = `curl -X POST ${baseUrl}/api/v1/sales \\\n  -H "Authorization: Bearer ${exampleKey}" \\\n  -H "Idempotency-Key: PEDIDO-1001" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "dteType": "BOLETA_39",\n    "paymentMethod": "TARJETA_CREDITO",\n    "items": [{ "sku": "POLERA-M", "quantity": 2 }]\n  }'`;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" /> Nueva llave
        </Button>
      </div>

      {!keys ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : keys.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="size-10 text-muted-foreground" aria-hidden="true" />}
          title="Sin llaves todavía"
          description="Crea una llave para conectar tu tienda en línea, una planilla o herramientas como Zapier, Make o n8n."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Llave</th>
                <th className="px-3 py-2">Permisos</th>
                <th className="px-3 py-2">Último uso</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className={`border-t border-border ${key.revokedAt ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2 font-medium">
                    {key.name}
                    {key.revokedAt && (
                      <StatusBadge tone="neutral" className="ml-2">
                        Revocada
                      </StatusBadge>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{key.prefix}…</td>
                  <td className="px-3 py-2 text-xs">{key.scopes.map((scope) => API_SCOPES[scope as ApiScope] ?? scope).join(' · ')}</td>
                  <td className="px-3 py-2 text-xs">{formatDate(key.lastUsedAt)}</td>
                  <td className="px-3 py-2 text-right">
                    {!key.revokedAt && (
                      <Button type="button" size="sm" variant="ghost" className="text-danger" onClick={() => void revoke(key)}>
                        Revocar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="space-y-3 rounded-xl border border-border bg-card p-5 text-sm">
        <h2 className="text-base font-semibold">Cómo usar la API</h2>
        <p className="text-muted-foreground">
          Base: <code className="rounded bg-muted px-1">{baseUrl}/api/v1</code>. Autenticación con la cabecera <code className="rounded bg-muted px-1">Authorization: Bearer &lt;llave&gt;</code>. Respuestas en JSON:{' '}
          <code className="rounded bg-muted px-1">{'{ data, meta }'}</code> o <code className="rounded bg-muted px-1">{'{ error: { code, message } }'}</code>. Límite: 120 solicitudes por minuto por llave.
        </p>
        <ul className="grid gap-1 text-xs sm:grid-cols-2">
          <li><code>GET /me</code> — prueba la llave</li>
          <li><code>GET /contacts</code> · <code>POST /contacts</code></li>
          <li><code>GET /products?sku=&amp;search=</code></li>
          <li><code>GET /stock?sku=&amp;warehouseId=</code></li>
          <li><code>GET /sales?from=&amp;to=&amp;status=</code> · <code>GET /sales/:id</code></li>
          <li><code>POST /sales</code> — emite boleta/factura (exige Idempotency-Key)</li>
          <li><code>GET /receivables</code> — cuentas por cobrar</li>
          <li><code>POST /payments</code> — registra un cobro</li>
        </ul>
        <p className="text-xs text-muted-foreground">Los precios (<code>unitPrice</code>) son NETOS, sin IVA, en pesos enteros, igual que en el formulario de venta. Si omites el precio, se usa el del catálogo.</p>
        <ExampleBlock title="Probar la llave" code={curlMe} onCopy={copy} />
        <ExampleBlock title="Emitir una boleta desde tu tienda" code={curlSale} onCopy={copy} />
        <p className="text-xs text-muted-foreground">
          Para recibir avisos del ERP en tu sistema (venta emitida, pago recibido, stock bajo…), usa Configuración → Automatizaciones con la acción “Llamar webhook”.
        </p>
      </section>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva llave de API</DialogTitle>
            <DialogDescription>Dale solo los permisos que la integración necesita.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="k-name">Nombre</Label>
              <Input id="k-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Tienda en línea" />
            </div>
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Permisos</legend>
              {API_SCOPE_KEYS.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={scopes.has(scope)}
                    onChange={(e) => {
                      const next = new Set(scopes);
                      if (e.target.checked) next.add(scope);
                      else next.delete(scope);
                      setScopes(next);
                    }}
                  />
                  {API_SCOPES[scope]} <code className="text-xs text-muted-foreground">{scope}</code>
                </label>
              ))}
            </fieldset>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={busy || scopes.size === 0 || name.trim().length < 2} onClick={() => void create()}>
              {busy ? 'Creando…' : 'Crear llave'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={plaintext !== null} onOpenChange={(open) => !open && setPlaintext(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copia tu llave ahora</DialogTitle>
            <DialogDescription>Por seguridad no se vuelve a mostrar. Si la pierdes, revócala y crea otra.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
            <code className="flex-1 break-all text-xs">{plaintext}</code>
            <Button type="button" size="sm" variant="outline" onClick={() => plaintext && void copy(plaintext)} aria-label="Copiar llave">
              <Copy aria-hidden="true" />
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setPlaintext(null)}>
              Ya la guardé
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExampleBlock({ title, code, onCopy }: { title: string; code: string; onCopy: (text: string) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-medium">{title}</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => onCopy(code)}>
          <Copy aria-hidden="true" /> Copiar
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{code}</pre>
    </div>
  );
}
