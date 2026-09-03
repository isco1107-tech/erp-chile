'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  getTotpStatusAction,
  startTotpSetupAction,
  confirmTotpSetupAction,
  disableTotpAction,
  regenerateBackupCodesAction,
  type TotpStatus,
} from '@/lib/actions/totp';

/** Lista de códigos de respaldo mostrada una sola vez, con aviso de que no vuelve a estar disponible. */
function BackupCodesReveal({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  function copyAll() {
    navigator.clipboard.writeText(codes.join('\n'));
    toast.success('Códigos copiados al portapapeles');
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Guárdalos en un lugar seguro — cada uno sirve una sola vez para entrar si pierdes tu dispositivo.{' '}
        <strong>No volverán a mostrarse.</strong>
      </p>
      <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-input bg-muted/40 p-3 font-mono text-sm">
        {codes.map((c) => (
          <span key={c} className="select-all">{c}</span>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={copyAll}>Copiar todos</Button>
        <Button type="button" size="sm" onClick={onDone}>Listo</Button>
      </div>
    </div>
  );
}

type SetupStep = 'password' | 'qr' | 'backupCodes';

export default function SecurityClient() {
  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [setupOpen, setSetupOpen] = useState(false);
  const [setupStep, setSetupStep] = useState<SetupStep>('password');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupData, setSetupData] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [setupBackupCodes, setSetupBackupCodes] = useState<string[] | null>(null);
  const [startingSetup, setStartingSetup] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disabling, setDisabling] = useState(false);

  const [regenOpen, setRegenOpen] = useState(false);
  const [regenPassword, setRegenPassword] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [regenCodes, setRegenCodes] = useState<string[] | null>(null);

  async function load() {
    setLoading(true);
    const result = await getTotpStatusAction();
    if (result.success) setStatus(result.data);
    else toast.error(result.error);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openSetup() {
    setSetupOpen(true);
    setSetupStep('password');
    setSetupPassword('');
    setSetupData(null);
    setSetupBackupCodes(null);
    setSetupCode('');
  }

  async function handleStartSetup() {
    setStartingSetup(true);
    try {
      const result = await startTotpSetupAction({ password: setupPassword });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSetupData(result.data);
      setSetupStep('qr');
    } finally {
      setStartingSetup(false);
    }
  }

  async function handleConfirmSetup() {
    setConfirming(true);
    try {
      const result = await confirmTotpSetupAction({ code: setupCode.trim() });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSetupBackupCodes(result.data.backupCodes);
      setSetupStep('backupCodes');
      toast.success(result.message ?? 'Activado');
    } finally {
      setConfirming(false);
    }
  }

  function closeSetup() {
    setSetupOpen(false);
    load();
  }

  async function handleDisable() {
    setDisabling(true);
    try {
      const result = await disableTotpAction({ password: disablePassword });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Desactivado');
      setDisableOpen(false);
      setDisablePassword('');
      load();
    } finally {
      setDisabling(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const result = await regenerateBackupCodesAction({ password: regenPassword });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setRegenCodes(result.data.backupCodes);
    } finally {
      setRegenerating(false);
    }
  }

  function closeRegen() {
    setRegenOpen(false);
    setRegenPassword('');
    setRegenCodes(null);
    load();
  }

  if (loading) return <p className="p-4 text-center text-sm text-muted-foreground">Cargando...</p>;
  if (!status) return null;

  return (
    <div className="max-w-lg space-y-4 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Verificación en dos pasos (2FA)</h2>
          <p className="text-sm text-muted-foreground">
            Pide un código de tu app de autenticación (Google Authenticator, Authy, etc.) además de la contraseña al iniciar sesión.
          </p>
        </div>
        {status.enabled ? (
          <span className="flex items-center gap-1 rounded-full bg-green-600/10 px-2 py-0.5 text-xs font-medium text-green-600">
            <ShieldCheck className="size-3.5" /> Activo
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            <ShieldOff className="size-3.5" /> Inactivo
          </span>
        )}
      </div>

      {status.enabled ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Te quedan <strong>{status.backupCodesRemaining}</strong> código(s) de respaldo sin usar.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setRegenOpen(true)}>
              Regenerar códigos de respaldo
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => setDisableOpen(true)}>
              Desactivar
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" onClick={openSetup}>Activar verificación en dos pasos</Button>
      )}

      {/* Activación */}
      <Dialog open={setupOpen} onOpenChange={(open) => !open && closeSetup()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activar verificación en dos pasos</DialogTitle>
          </DialogHeader>

          {setupStep === 'password' && (
            <div className="space-y-3">
              <DialogDescription>Confirma tu contraseña para empezar.</DialogDescription>
              <div>
                <Label htmlFor="setupPassword">Contraseña</Label>
                <PasswordInput id="setupPassword" value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeSetup}>Cancelar</Button>
                <Button type="button" disabled={startingSetup || !setupPassword} onClick={handleStartSetup}>
                  {startingSetup ? 'Generando...' : 'Continuar'}
                </Button>
              </DialogFooter>
            </div>
          )}

          {setupStep === 'qr' && setupData && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Escanea el código con tu app de autenticación, o ingresa la clave manualmente.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setupData.qrDataUrl} alt="Código QR para 2FA" className="mx-auto size-48 rounded-lg border border-border" />
              <div className="rounded-lg border border-input bg-muted/40 px-3 py-2 text-center font-mono text-sm select-all">
                {setupData.secret}
              </div>
              <div>
                <Label htmlFor="setupCode">Código de 6 dígitos</Label>
                <Input id="setupCode" inputMode="numeric" value={setupCode} onChange={(e) => setSetupCode(e.target.value)} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeSetup}>Cancelar</Button>
                <Button type="button" disabled={confirming || setupCode.trim().length === 0} onClick={handleConfirmSetup}>
                  {confirming ? 'Verificando...' : 'Confirmar'}
                </Button>
              </DialogFooter>
            </div>
          )}

          {setupStep === 'backupCodes' && setupBackupCodes && (
            <BackupCodesReveal codes={setupBackupCodes} onDone={closeSetup} />
          )}
        </DialogContent>
      </Dialog>

      {/* Desactivación */}
      <Dialog open={disableOpen} onOpenChange={(open) => { setDisableOpen(open); if (!open) { setDisablePassword(''); load(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desactivar verificación en dos pasos</DialogTitle>
            <DialogDescription>Confirma tu contraseña para desactivarla. Tus códigos de respaldo dejarán de servir.</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="disablePassword">Contraseña</Label>
            <PasswordInput id="disablePassword" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDisableOpen(false)}>Cancelar</Button>
            <Button type="button" variant="destructive" disabled={disabling || !disablePassword} onClick={handleDisable}>
              {disabling ? 'Desactivando...' : 'Desactivar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regeneración de códigos de respaldo */}
      <Dialog open={regenOpen} onOpenChange={(open) => !open && closeRegen()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerar códigos de respaldo</DialogTitle>
            {!regenCodes && <DialogDescription>Los códigos actuales dejarán de servir. Confirma tu contraseña para generar unos nuevos.</DialogDescription>}
          </DialogHeader>
          {regenCodes ? (
            <BackupCodesReveal codes={regenCodes} onDone={closeRegen} />
          ) : (
            <>
              <div>
                <Label htmlFor="regenPassword">Contraseña</Label>
                <PasswordInput id="regenPassword" value={regenPassword} onChange={(e) => setRegenPassword(e.target.value)} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRegenOpen(false)}>Cancelar</Button>
                <Button type="button" disabled={regenerating || !regenPassword} onClick={handleRegenerate}>
                  {regenerating ? 'Generando...' : 'Regenerar'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
