'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MailPlus, RefreshCw, UserCheck, UserX, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cancelSupplierInviteAction, inviteSupplierPersonAction, resendSupplierInviteAction, setSupplierAccountActiveAction } from '@/modules/inventory/actions/seller-center.actions';
import type { MembershipStatus, SupplierAccountRow } from '@/modules/inventory/services/seller-center.service';

const STATUS: Record<MembershipStatus, { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' }> = {
  ACTIVE: { label: 'Activa', tone: 'success' },
  PENDING: { label: 'Invitación enviada', tone: 'warning' },
  EXPIRED: { label: 'Invitación vencida', tone: 'danger' },
  INACTIVE: { label: 'Desactivada', tone: 'neutral' },
};

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}

/**
 * Seller Center desde la ficha del proveedor: invitar a sus personas (cada una con su correo y su
 * contraseña) y quitarles el acceso. Ven ventas en $ de lo que surten en exclusiva, existencias y
 * mermas; nunca costos de la tienda ni otros proveedores.
 */
export default function SellerCenterAccountsCard({ supplierId, accounts, baseUrl }: { supplierId: string; accounts: SupplierAccountRow[]; baseUrl: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<{ success: true; message?: string } | { success: false; error: string }>, onOk?: () => void) {
    setBusy(true);
    try {
      const result = await work();
      if (!result.success) return void toast.error(result.error);
      onOk?.();
      if (result.message) toast.success(result.message);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    await run(
      () => inviteSupplierPersonAction(supplierId, { name, email }),
      () => {
        setName('');
        setEmail('');
      }
    );
  }

  async function deactivate(row: SupplierAccountRow) {
    if (!(await confirm({ title: `¿Desactivar el acceso de ${row.name}?`, description: 'Dejará de entrar de inmediato, aunque tenga la sesión abierta. Puedes reactivarlo cuando quieras.', confirmLabel: 'Desactivar' }))) return;
    await run(() => setSupplierAccountActiveAction(row.id, false));
  }

  async function cancel(row: SupplierAccountRow) {
    if (!(await confirm({ title: `¿Anular la invitación de ${row.name}?`, description: 'El enlace que le llegó dejará de servir.', confirmLabel: 'Anular' }))) return;
    await run(() => cancelSupplierInviteAction(row.id));
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card" data-testid="seller-center-card">
      <div className="flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent">
          <Users className="size-4 text-accent-foreground" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Seller Center: cuentas del proveedor</h3>
          <p className="text-xs text-muted-foreground">
            Cada persona del proveedor entra en {baseUrl}/proveedor/cuenta con su correo y su contraseña. Ve sus ventas en pesos (solo de los productos que surte en exclusiva), sus
            existencias por bodega y sus mermas. Nunca ve costos, márgenes, clientes ni otros proveedores.
          </p>
        </div>
      </div>

      {accounts.length > 0 ? (
        <ul className="mt-4 divide-y divide-border rounded-md border border-border" aria-label="Personas con acceso">
          {accounts.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">{row.name}</p>
                <p className="text-xs break-all text-muted-foreground">{row.email}</p>
                <p className="text-xs text-muted-foreground">
                  {row.status === 'ACTIVE' || row.status === 'INACTIVE'
                    ? row.lastAccessAt
                      ? `Último ingreso: ${formatDate(row.lastAccessAt)}`
                      : 'Aún no ingresa'
                    : `Invitada el ${formatDate(row.createdAt)}${row.invitedByName ? ` por ${row.invitedByName}` : ''}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={STATUS[row.status].tone} className="whitespace-nowrap">
                  {STATUS[row.status].label}
                </StatusBadge>
                {(row.status === 'PENDING' || row.status === 'EXPIRED') && (
                  <>
                    <Button type="button" size="xs" variant="outline" disabled={busy} onClick={() => void run(() => resendSupplierInviteAction(row.id))}>
                      <RefreshCw aria-hidden="true" /> Reenviar
                    </Button>
                    <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => void cancel(row)} aria-label={`Anular la invitación de ${row.name}`}>
                      <X aria-hidden="true" /> Anular
                    </Button>
                  </>
                )}
                {row.status === 'ACTIVE' && (
                  <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => void deactivate(row)}>
                    <UserX aria-hidden="true" /> Desactivar
                  </Button>
                )}
                {row.status === 'INACTIVE' && (
                  <Button type="button" size="xs" variant="outline" disabled={busy} onClick={() => void run(() => setSupplierAccountActiveAction(row.id, true))}>
                    <UserCheck aria-hidden="true" /> Reactivar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">Nadie de este proveedor tiene cuenta todavía.</p>
      )}

      <form onSubmit={invite} className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]" aria-label="Invitar a una persona del proveedor">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre" aria-label="Nombre de la persona" maxLength={120} required />
        <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Correo" aria-label="Correo de la persona" maxLength={254} required />
        <Button type="submit" size="sm" disabled={busy || name.trim().length < 2 || !email.includes('@')}>
          <MailPlus className="size-3.5" aria-hidden="true" /> Invitar
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">Le llega un enlace por correo para crear su contraseña; vence en 7 días y sirve una sola vez.</p>
    </div>
  );
}
