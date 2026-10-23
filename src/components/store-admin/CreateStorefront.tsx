'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ShoppingBag, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createStorefrontAction } from '@/modules/ecommerce/actions/store-workspace.actions';

export default function CreateStorefront({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!compact);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open)
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Nueva tienda
      </Button>
    );
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-8" aria-label="Crear tienda en línea">
      <div className="mb-6 flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <ShoppingBag className="size-6" />
        </span>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Tu próxima venta empieza aquí</h2>
          <p className="mt-1 text-sm text-muted-foreground">Crea tu tienda y elige qué productos del ERP quieres vender.</p>
        </div>
      </div>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setBusy(true);
          setError(null);
          try {
            const result = await createStorefrontAction({ name: data.get('name'), slug: data.get('slug') }, String(data.get('domain') ?? ''));
            if (!result.success) {
              setError(result.error);
              return;
            }
            if (result.data.notice) toast.info(result.data.notice);
            else toast.success('Tienda creada. Configura tus productos, pagos y entregas para abrirla.');
            if (compact) setOpen(false);
            router.push(`/dashboard/store?sitio=${encodeURIComponent(result.data.id)}&tab=products`);
            router.refresh();
          } catch {
            setError('No pudimos crear la tienda. Revisa tu conexión e inténtalo de nuevo.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="store-name">Nombre de la tienda</Label>
          <Input id="store-name" name="name" placeholder="El nombre de tu marca" required minLength={2} maxLength={80} disabled={busy} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="store-slug">Dirección corta (opcional)</Label>
          <Input id="store-slug" name="slug" placeholder="mi-tienda" maxLength={50} disabled={busy} />
          <p className="text-xs text-muted-foreground">Si la dejas vacía, la creamos para ti.</p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="store-domain">Tu dominio (opcional)</Label>
          <Input id="store-domain" name="domain" placeholder="mitienda.cl" disabled={busy} />
          <p className="text-xs text-muted-foreground">Puedes conectarlo ahora o después. La tienda también tendrá su dirección en Aether.</p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger sm:col-span-2">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? 'Creando tu tienda…' : 'Crear mi tienda'}
            <ArrowRight className="size-4" />
          </Button>
          {compact && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          )}
          <p className="text-xs text-muted-foreground">Tú decides cuándo abrirla al público.</p>
        </div>
      </form>
    </section>
  );
}
