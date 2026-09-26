'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Eye, EyeOff, RefreshCw, Zap, ZapOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  generateN8nWebhookSecretAction,
  regenerateN8nWebhookSecretAction,
  revokeN8nWebhookSecretAction,
} from '@/modules/webhooks/actions/n8n-secret.actions';

import { useConfirm } from '@/components/ui/confirm-provider';
import { publicUrl } from '@/lib/public-url';
interface N8nWebhookFormProps {
  initialSecret: string | null;
}

export default function N8nWebhookForm({ initialSecret }: N8nWebhookFormProps) {
  const confirm = useConfirm();
  const [secret, setSecret] = useState<string | null>(initialSecret);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);

  const webhookUrl = publicUrl('/api/webhooks');

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    } catch {
      toast.error('No se pudo copiar. Selecciona el texto manualmente.');
    }
  }

  async function handleGenerate() {
    setBusy(true);
    try {
      const result = await generateN8nWebhookSecretAction();
      if (!result.success) return toast.error(result.error);
      setSecret(result.data);
      setReveal(true);
      toast.success(result.message ?? 'Token generado');
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate() {
    if (!await confirm('El token anterior dejará de funcionar de inmediato. Si ya lo usaste en un workflow de n8n, tendrás que actualizarlo ahí también. ¿Continuar?')) return;
    setBusy(true);
    try {
      const result = await regenerateN8nWebhookSecretAction();
      if (!result.success) return toast.error(result.error);
      setSecret(result.data);
      setReveal(true);
      toast.success(result.message ?? 'Token regenerado');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    if (!await confirm('Esto desactiva la automatización externa: cualquier workflow de n8n que llame a este webhook empezará a recibir error 401. ¿Continuar?')) return;
    setBusy(true);
    try {
      const result = await revokeN8nWebhookSecretAction();
      if (!result.success) return toast.error(result.error);
      setSecret(null);
      toast.success(result.message ?? 'Desactivado');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-xl border border-border p-4">
      <div>
        <h2 className="font-semibold">Automatización externa (n8n / Zapier / webhooks)</h2>
        <p className="text-sm text-muted-foreground">
          Permite que una automatización externa registre eventos en el ERP en nombre de tu empresa — hoy soporta confirmar pagos por
          conciliación bancaria (evento <code className="rounded bg-muted px-1">payment.confirmed</code>). El token es la credencial
          completa: cualquiera que lo tenga puede actuar como tu empresa en este endpoint, trátalo como una contraseña.
        </p>
      </div>

      {!secret && (
        <Button type="button" onClick={handleGenerate} disabled={busy}>
          <Zap className="mr-2 size-4" /> Generar token de automatización
        </Button>
      )}

      {secret && (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">URL del webhook</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-border bg-muted px-3 py-2 text-sm">{webhookUrl}</code>
              <Button type="button" size="icon" variant="outline" onClick={() => copy(webhookUrl, 'URL')}>
                <Copy className="size-4" />
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Token (header Authorization: Bearer &lt;token&gt;)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                {reveal ? secret : '•'.repeat(24)}
              </code>
              <Button type="button" size="icon" variant="outline" onClick={() => setReveal((v) => !v)}>
                {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
              <Button type="button" size="icon" variant="outline" onClick={() => copy(secret, 'Token')}>
                <Copy className="size-4" />
              </Button>
            </div>
          </div>

          <details className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <summary className="cursor-pointer font-medium text-foreground">Ejemplo de payload (nodo HTTP Request de n8n)</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-muted-foreground">{`POST ${webhookUrl}
Authorization: Bearer ${reveal ? secret : '<token>'}
Content-Type: application/json

{
  "eventId": "banco-2026-09-08-0001",
  "eventType": "payment.confirmed",
  "payload": {
    "documentType": "sales",
    "folio": "1245",
    "amount": 89000,
    "paymentMethod": "TRANSFERENCIA",
    "referenceNumber": "OP123456"
  }
}`}</pre>
            <p className="mt-2 text-muted-foreground">
              <code className="rounded bg-background px-1">eventId</code> debe ser único por cada línea de la cartola (ej. hash de
              fecha+monto+glosa) para que un reintento no duplique el cobro. <code className="rounded bg-background px-1">documentType</code>{' '}
              es <code className="rounded bg-background px-1">&quot;sales&quot;</code> o <code className="rounded bg-background px-1">&quot;purchase&quot;</code>,
              y <code className="rounded bg-background px-1">folio</code> es el folio del documento tal como aparece en el ERP.
            </p>
          </details>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" disabled={busy} onClick={handleRegenerate}>
              <RefreshCw className="mr-2 size-4" /> Regenerar
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={handleRevoke} className="text-destructive hover:text-destructive">
              <ZapOff className="mr-2 size-4" /> Desactivar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
