'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Truck } from 'lucide-react';
import { PublicButton, PublicCard, PublicCardHeader, PublicField, PublicFooter, PublicPage, PublicShell, PublicTopBar } from '@/components/public/PublicShell';
import { formatSupplierCode, normalizeSupplierCode } from '@/lib/supplier-portal/format';

/**
 * Ingreso al portal del proveedor: escribe el código que le dio la empresa. Se normaliza lo escrito
 * (minúsculas, espacios, guiones, I/L/O confundidas) y se pasa a la página del inventario; es esa
 * página la que valida el código contra la base.
 */
export default function SupplierCodeEntry({ prefill = '' }: { prefill?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(prefill);
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const normalized = normalizeSupplierCode(value);
    if (!normalized) {
      setError('El código tiene 16 letras y números, por ejemplo K7QM-4TXD-9HWB-2ZNC. Revisa que lo hayas escrito completo.');
      return;
    }
    setError(null);
    router.push(`/proveedor/${formatSupplierCode(normalized)}`);
  }

  return (
    <PublicPage accent="emerald">
      <PublicTopBar brand="Portal de proveedores" />
      <PublicShell>
        <PublicCard glow>
          <PublicCardHeader icon={<Truck className="size-5" />} title="Tu inventario en bodega" subtitle="Ingresa el código que te entregó la empresa para ver cuánto te queda de cada producto." />
          <form onSubmit={submit} noValidate>
            <PublicField id="supplier-code" label="Tu código de acceso" error={error ?? undefined} hint="Son 16 letras y números. Puedes escribirlo con o sin guiones.">
              <input
                id="supplier-code"
                name="code"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                autoFocus
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={32}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              />
            </PublicField>
            <PublicButton type="submit" full>
              Ver mi inventario
            </PublicButton>
          </form>
        </PublicCard>
        <PublicFooter>
          ¿Tienes una cuenta con correo y contraseña? <Link href="/proveedor/cuenta/ingresar">Ingresa aquí</Link>. ¿No tienes un código? Pídeselo a la empresa a la que le surtes mercadería.
        </PublicFooter>
      </PublicShell>
    </PublicPage>
  );
}
