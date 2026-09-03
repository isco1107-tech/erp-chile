'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getTotpStatusAction } from '@/lib/actions/totp';
import { deleteTenantAction } from '@/modules/platform/actions/platform-delete.actions';

interface Props {
  companyId: string;
  companyName: string;
}

/**
 * Borrado PERMANENTE del tenant. Solo el propio superadmin, con 2FA ya
 * activo en su cuenta, puede llegar a confirmar — sin excepciones (ver
 * CLAUDE.md / deleteTenantAction).
 */
export default function TenantDangerZone({ companyId, companyName }: Props) {
  const router = useRouter();

  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null);
  const [checkingTotp, setCheckingTotp] = useState(true);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [code, setCode] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getTotpStatusAction();
      if (cancelled) return;
      setTotpEnabled(result.success ? result.data.enabled : false);
      setCheckingTotp(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function openConfirm() {
    setCode('');
    setConfirmOpen(true);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const result = await deleteTenantAction(companyId, { code: code.trim() });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Empresa eliminada');
      setConfirmOpen(false);
      router.push('/superadmin/companies');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
      <div className="mb-3 flex items-center gap-2 text-destructive">
        <ShieldAlert className="size-4" />
        <h2 className="text-sm font-semibold">Zona de peligro</h2>
      </div>

      {checkingTotp ? (
        <p className="text-sm text-muted-foreground">Verificando tu verificación en dos pasos...</p>
      ) : totpEnabled ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Elimina <strong>{companyName}</strong> y absolutamente todos sus datos (usuarios, ventas, compras,
            inventario, contabilidad) de forma permanente. Esta acción no se puede deshacer.
          </p>
          <Button type="button" variant="destructive" onClick={openConfirm}>
            Eliminar empresa
          </Button>
        </div>
      ) : (
        <div className="flex items-start gap-2 text-sm text-amber-600">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            Debes activar la verificación en dos pasos en tu propia cuenta antes de poder eliminar empresas.{' '}
            <Link href="/dashboard/settings/security" className="font-medium underline underline-offset-2">
              Activarla ahora
            </Link>
          </p>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={(open) => !deleting && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar {companyName} permanentemente</DialogTitle>
            <DialogDescription>
              Se borrarán TODOS los datos de esta empresa sin posibilidad de recuperación: usuarios, clientes y
              proveedores, ventas, compras, inventario y contabilidad. Ingresa tu código de verificación en dos
              pasos para confirmar.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="deleteTenantCode">Código de 6 dígitos</Label>
            <Input
              id="deleteTenantCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting || !/^\d{6}$/.test(code.trim())}
              onClick={handleDelete}
            >
              {deleting ? 'Eliminando...' : 'Eliminar permanentemente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
