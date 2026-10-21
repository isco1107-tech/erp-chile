'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/components/ui/confirm-provider';
import {
  disconnectBrevoAction,
  disconnectZapsignAction,
  saveBrevoConfigAction,
  saveZapsignConfigAction,
  sendBrevoTestEmailAction,
} from '@/lib/actions/integrations';
import { saveKhipuCredentialAction } from '@/modules/payment-plans/actions/online-payment.actions';
import type { IntegrationsStatus } from '@/lib/integrations/company-integrations';

/**
 * Cuentas propias de la empresa: Brevo (correo), ZapSign (firma de contratos)
 * y Khipu (cobro en línea de cuotas). Sin conectar, el ERP usa las de la
 * plataforma. Las credenciales nunca vuelven al navegador: solo se sabe si
 * existen, y se reemplazan escribiendo una nueva.
 */
export default function IntegrationsForm({ initial }: { initial: IntegrationsStatus }) {
  const confirm = useConfirm();
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);

  const [brevoKey, setBrevoKey] = useState('');
  const [fromName, setFromName] = useState(initial.brevo.fromName ?? '');
  const [fromAddress, setFromAddress] = useState(initial.brevo.fromAddress ?? '');

  const [zapsignToken, setZapsignToken] = useState('');
  const [zapsignSandbox, setZapsignSandbox] = useState(initial.zapsign.sandbox);

  const [khipuKey, setKhipuKey] = useState('');

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }

  const saveBrevo = () =>
    run(async () => {
      const result = await saveBrevoConfigAction({
        ...(brevoKey.trim() ? { apiKey: brevoKey.trim() } : {}),
        fromName,
        fromAddress,
      });
      if (!result.success) return void toast.error(result.error);
      setStatus(result.data);
      setBrevoKey('');
      toast.success(result.message ?? 'Guardado');
    });

  const testBrevo = () =>
    run(async () => {
      const result = await sendBrevoTestEmailAction();
      if (result.success) toast.success(result.message ?? 'Correo enviado');
      else toast.error(result.error);
    });

  const disconnectBrevo = async () => {
    if (!(await confirm('Los correos de tu empresa volverán a salir por la cuenta de la plataforma. ¿Desconectar Brevo?'))) return;
    await run(async () => {
      const result = await disconnectBrevoAction();
      if (!result.success) return void toast.error(result.error);
      setStatus(result.data);
      setFromName('');
      setFromAddress('');
      toast.success(result.message ?? 'Desconectado');
    });
  };

  const saveZapsign = () =>
    run(async () => {
      const result = await saveZapsignConfigAction({ ...(zapsignToken.trim() ? { token: zapsignToken.trim() } : {}), sandbox: zapsignSandbox });
      if (!result.success) return void toast.error(result.error);
      setStatus(result.data);
      setZapsignToken('');
      toast.success(result.message ?? 'Guardado');
    });

  const disconnectZapsign = async () => {
    if (
      !(await confirm(
        'Los contratos que ya enviaste a firmar con tu cuenta se confirmarán con la cuenta de la plataforma y podrían no actualizarse. Desconecta solo cuando no haya firmas pendientes. ¿Continuar?'
      ))
    ) {
      return;
    }
    await run(async () => {
      const result = await disconnectZapsignAction();
      if (!result.success) return void toast.error(result.error);
      setStatus(result.data);
      setZapsignSandbox(false);
      toast.success(result.message ?? 'Desconectado');
    });
  };

  const saveKhipu = (apiKey: string | null) =>
    run(async () => {
      const result = await saveKhipuCredentialAction({ apiKey });
      if (!result.success) return void toast.error(result.error);
      setStatus((current) => ({ ...current, khipu: { configured: result.data.khipuConfigured } }));
      setKhipuKey('');
      toast.success(result.message ?? 'Guardado');
    });

  return (
    <div className="max-w-2xl space-y-6 rounded-xl border border-border p-4">
      <div>
        <h2 className="font-semibold">Integraciones</h2>
        <p className="text-sm text-muted-foreground">
          Conecta tus propias cuentas. Sin conectar, tu empresa usa las de la plataforma. Las claves se guardan cifradas y no se
          vuelven a mostrar: para cambiarlas, escribe una nueva.
        </p>
      </div>

      <section className="space-y-3 border-t border-border pt-4" aria-labelledby="integration-brevo">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="integration-brevo" className="text-sm font-semibold">Correo (Brevo)</h3>
          <StatusBadge tone={status.brevo.configured ? 'success' : 'neutral'}>
            {status.brevo.configured ? 'Cuenta propia conectada' : 'Usa la cuenta de la plataforma'}
          </StatusBadge>
        </div>
        <p className="text-xs text-muted-foreground">
          Invitaciones, recordatorios de cobro, comprobantes y automatizaciones saldrán desde tu remitente. La API key está en Brevo →
          SMTP &amp; API → API Keys, y el remitente debe estar verificado en Brevo → Senders.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="brevoKey">API key de Brevo</Label>
            <Input
              id="brevoKey"
              type="password"
              autoComplete="off"
              value={brevoKey}
              onChange={(e) => setBrevoKey(e.target.value)}
              placeholder={status.brevo.configured ? '•••••••• (guardada — escribe para reemplazar)' : 'xkeysib-…'}
            />
          </div>
          <div>
            <Label htmlFor="emailFromName">Nombre del remitente</Label>
            <Input id="emailFromName" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Mi Empresa" maxLength={80} />
          </div>
          <div>
            <Label htmlFor="emailFromAddress">Correo del remitente</Label>
            <Input id="emailFromAddress" type="email" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} placeholder="contacto@miempresa.cl" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy || !fromName.trim() || !fromAddress.trim() || (!status.brevo.configured && !brevoKey.trim())} onClick={saveBrevo}>
            {status.brevo.configured ? 'Guardar cambios' : 'Conectar Brevo'}
          </Button>
          {status.brevo.configured && (
            <>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={testBrevo}>Enviarme un correo de prueba</Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={disconnectBrevo} className="text-destructive hover:text-destructive">
                Desconectar
              </Button>
            </>
          )}
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-4" aria-labelledby="integration-zapsign">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="integration-zapsign" className="text-sm font-semibold">Firma de contratos (ZapSign)</h3>
          <StatusBadge tone={status.zapsign.configured ? (status.zapsign.sandbox ? 'warning' : 'success') : 'neutral'}>
            {status.zapsign.configured ? (status.zapsign.sandbox ? 'Conectada en modo prueba' : 'Cuenta propia conectada') : 'Usa la cuenta de la plataforma'}
          </StatusBadge>
        </div>
        <p className="text-xs text-muted-foreground">
          Los contratos de candidatas se enviarán a firmar desde tu cuenta de ZapSign. El token está en ZapSign → Configuración →
          Integraciones.
        </p>
        <div>
          <Label htmlFor="zapsignToken">Token de la API de ZapSign</Label>
          <Input
            id="zapsignToken"
            type="password"
            autoComplete="off"
            value={zapsignToken}
            onChange={(e) => setZapsignToken(e.target.value)}
            placeholder={status.zapsign.configured ? '•••••••• (guardado — escribe para reemplazar)' : 'Pega el token de tu cuenta'}
          />
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={zapsignSandbox} onCheckedChange={setZapsignSandbox} label="Modo de prueba (sandbox) de ZapSign" />
          <span className="text-sm">Modo de prueba (sandbox): no envía correos reales a las candidatas</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy || (!status.zapsign.configured && !zapsignToken.trim())} onClick={saveZapsign}>
            {status.zapsign.configured ? 'Guardar cambios' : 'Conectar ZapSign'}
          </Button>
          {status.zapsign.configured && (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={disconnectZapsign} className="text-destructive hover:text-destructive">
              Desconectar
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-4" aria-labelledby="integration-khipu">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="integration-khipu" className="text-sm font-semibold">Cobro en línea (Khipu)</h3>
          <StatusBadge tone={status.khipu.configured ? 'success' : 'warning'}>{status.khipu.configured ? 'Khipu conectado' : 'Khipu sin conectar'}</StatusBadge>
        </div>
        <p className="text-xs text-muted-foreground">
          Define a qué cuenta llega el dinero del portal de pago de cuotas. La API key está en tu cuenta de cobro de Khipu, en la
          integración para desarrolladores (API 3.0).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="khipuKey"
            type="password"
            autoComplete="off"
            aria-label="API key de Khipu"
            className="max-w-md"
            value={khipuKey}
            onChange={(e) => setKhipuKey(e.target.value)}
            placeholder={status.khipu.configured ? '•••••••• (guardada — escribe para reemplazar)' : 'Pega la API key de tu cuenta de cobro'}
          />
          <Button type="button" size="sm" disabled={busy || khipuKey.trim().length === 0} onClick={() => saveKhipu(khipuKey.trim())}>Guardar</Button>
          {status.khipu.configured && (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => saveKhipu(null)} className="text-destructive hover:text-destructive">
              Desconectar
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-2 border-t border-border pt-4" aria-labelledby="integration-domain">
        <h3 id="integration-domain" className="text-sm font-semibold">Dominio propio</h3>
        <p className="text-xs text-muted-foreground">
          El dominio se configura en cada sitio: en el micrositio de cada certamen (<Link href="/dashboard/projects" className="underline">Certámenes</Link>)
          y en cada <Link href="/dashboard/web-sites" className="underline">Sitio web</Link>. Allí verás los registros DNS exactos para crear en el
          proveedor donde compraste el dominio. No necesitas ninguna clave: el dominio se sirve desde la plataforma.
        </p>
      </section>
    </div>
  );
}
