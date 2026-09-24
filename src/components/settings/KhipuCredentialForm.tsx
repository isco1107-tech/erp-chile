'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useConfirm } from '@/components/ui/confirm-provider';
import { saveKhipuCredentialAction } from '@/modules/payment-plans/actions/online-payment.actions';

/**
 * Conectar o desconectar la cuenta de cobro Khipu. La llave se guarda
 * cifrada y nunca se vuelve a mostrar: solo se ve si está conectada.
 */
export default function KhipuCredentialForm({ connected }: { connected: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(value: string | null) {
    setBusy(true);
    try {
      const result = await saveKhipuCredentialAction({ apiKey: value });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(value ? 'Khipu conectado' : 'Khipu desconectado');
      setApiKey('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    const ok = await confirm({ title: '¿Desconectar Khipu?', description: 'Los links de pago y el portal de cuotas dejarán de aceptar pagos en línea.', confirmLabel: 'Desconectar' });
    if (ok) await save(null);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <PasswordInput
        aria-label="API key de Khipu"
        className="max-w-xs"
        placeholder={connected ? 'Reemplazar API key…' : 'API key de tu cuenta de cobro'}
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        autoComplete="off"
      />
      <Button type="button" size="sm" disabled={busy || apiKey.trim().length < 10} onClick={() => void save(apiKey.trim())}>
        {connected ? 'Reemplazar' : 'Conectar'}
      </Button>
      {connected && (
        <Button type="button" size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => void disconnect()}>
          Desconectar
        </Button>
      )}
    </div>
  );
}
