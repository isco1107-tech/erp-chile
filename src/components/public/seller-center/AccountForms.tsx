'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import InstallApplication from '@/components/apps/InstallApplication';
import { KeyRound, LogIn, MailCheck, Truck } from 'lucide-react';
import { PublicButton, PublicCard, PublicCardHeader, PublicField, PublicFooter, PublicPage, PublicShell, PublicTopBar } from '@/components/public/PublicShell';
import { PASSWORD_REQUIREMENTS, passwordPolicySchema } from '@/lib/auth/password-policy';

/**
 * Formularios del Seller Center (`/proveedor/cuenta/*`). Hablan con `/api/supplier-portal/*`, que
 * pone la cookie de sesión; al entrar se navega a `/proveedor/cuenta`, que la lee en el servidor.
 */

type ApiResult = { success: boolean; error?: string; message?: string };

async function post(path: string, body: unknown): Promise<ApiResult> {
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
    const data = (await response.json().catch(() => null)) as ApiResult | null;
    return data ?? { success: false, error: 'No se pudo completar. Intenta de nuevo en un momento' };
  } catch {
    return { success: false, error: 'Sin conexión. Revisa tu internet e intenta de nuevo' };
  }
}

function Frame({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <PublicPage accent="gold">
      <PublicTopBar brand="Aether · Seller Center" />
      <PublicShell>
        {children}
        <InstallApplication name="Seller Center" scope="/proveedor/cuenta" />
        {footer && <PublicFooter>{footer}</PublicFooter>}
      </PublicShell>
    </PublicPage>
  );
}

function PasswordRules() {
  return (
    <ul className="pub-hint" style={{ margin: '-0.5rem 0 0', paddingLeft: '1.1rem' }}>
      {PASSWORD_REQUIREMENTS.map((rule) => (
        <li key={rule}>{rule}</li>
      ))}
    </ul>
  );
}

function NewPasswordFields({ password, setPassword, confirm, setConfirm, error }: { password: string; setPassword: (v: string) => void; confirm: string; setConfirm: (v: string) => void; error?: string }) {
  return (
    <>
      <PublicField id="sc-new-password" label="Contraseña nueva" error={error}>
        <input id="sc-new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={200} required />
      </PublicField>
      <PasswordRules />
      <PublicField id="sc-confirm-password" label="Repite la contraseña">
        <input id="sc-confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} maxLength={200} required />
      </PublicField>
    </>
  );
}

/** Revisa la contraseña nueva igual que el servidor (misma regla) antes de enviarla. */
function newPasswordProblem(password: string, confirm: string): string | null {
  const policy = passwordPolicySchema.safeParse(password);
  if (!policy.success) return policy.error.issues[0]?.message ?? 'La contraseña no cumple los requisitos';
  if (password !== confirm) return 'Las contraseñas no coinciden';
  return null;
}

export function SellerCenterLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await post('/api/supplier-portal/login', { email, password });
    if (result.success) return router.replace('/proveedor/cuenta');
    setBusy(false);
    setError(result.error ?? 'No se pudo ingresar');
  }

  return (
    <Frame footer={<>¿Solo tienes un código de acceso? <Link href="/proveedor">Ingresa con tu código</Link>.</>}>
      <PublicCard glow>
        <PublicCardHeader icon={<Truck className="size-5" />} title="Ingresa a tu cuenta" subtitle="Tus ventas, tu mercadería en bodega, tus liquidaciones y tus mermas, con el correo al que te llegó la invitación." />
        <form onSubmit={submit} noValidate className="pub-form">
          <PublicField id="sc-email" label="Correo">
            <input id="sc-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required autoFocus />
          </PublicField>
          <PublicField id="sc-password" label="Contraseña" error={error ?? undefined}>
            <input id="sc-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={200} required />
          </PublicField>
          <PublicButton type="submit" full disabled={busy || !email || !password}>
            <LogIn className="size-4" aria-hidden="true" /> {busy ? 'Ingresando…' : 'Ingresar'}
          </PublicButton>
        </form>
        <p className="pub-hint" style={{ marginTop: '1rem', textAlign: 'center' }}>
          <Link href="/proveedor/cuenta/recuperar">¿Olvidaste tu contraseña?</Link>
        </p>
      </PublicCard>
    </Frame>
  );
}

export function SellerCenterForgot() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await post('/api/supplier-portal/forgot', { email });
    setBusy(false);
    if (result.success) setDone(result.message ?? 'Revisa tu correo.');
    else setError(result.error ?? 'No se pudo enviar');
  }

  return (
    <Frame footer={<Link href="/proveedor/cuenta/ingresar">Volver a ingresar</Link>}>
      <PublicCard glow>
        <PublicCardHeader icon={<MailCheck className="size-5" />} title="Recupera tu contraseña" subtitle={done ?? 'Te enviaremos un enlace para elegir una nueva. Vence en una hora.'} />
        {!done && (
          <form onSubmit={submit} noValidate className="pub-form">
            <PublicField id="sc-forgot-email" label="Correo" error={error ?? undefined}>
              <input id="sc-forgot-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required autoFocus />
            </PublicField>
            <PublicButton type="submit" full disabled={busy || !email}>
              {busy ? 'Enviando…' : 'Enviar enlace'}
            </PublicButton>
          </form>
        )}
      </PublicCard>
    </Frame>
  );
}

export function SellerCenterReset({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = newPasswordProblem(password, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const result = await post('/api/supplier-portal/reset', { token, password });
    setBusy(false);
    if (result.success) setDone(result.message ?? 'Listo.');
    else setError(result.error ?? 'No se pudo cambiar la contraseña');
  }

  return (
    <Frame footer={<Link href="/proveedor/cuenta/ingresar">Ir a ingresar</Link>}>
      <PublicCard glow>
        <PublicCardHeader icon={<KeyRound className="size-5" />} title="Elige una nueva contraseña" subtitle={done ?? 'Al guardarla se cierran las sesiones abiertas con la contraseña anterior.'} />
        {done ? (
          <PublicButton type="button" full onClick={() => router.push('/proveedor/cuenta/ingresar')}>
            Ingresar
          </PublicButton>
        ) : (
          <form onSubmit={submit} noValidate className="pub-form">
            <NewPasswordFields password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} error={error ?? undefined} />
            <PublicButton type="submit" full disabled={busy || !password || !confirm}>
              {busy ? 'Guardando…' : 'Guardar contraseña'}
            </PublicButton>
          </form>
        )}
      </PublicCard>
    </Frame>
  );
}

export function SellerCenterAccept({ token, email, personName, hasPassword, companyName, supplierName }: { token: string; email: string; personName: string; hasPassword: boolean; companyName: string; supplierName: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!hasPassword) {
      const problem = newPasswordProblem(password, confirm);
      if (problem) return setError(problem);
    }
    setBusy(true);
    setError(null);
    const result = await post('/api/supplier-portal/accept', { token, password });
    if (result.success) return router.replace('/proveedor/cuenta');
    setBusy(false);
    setError(result.error ?? 'No se pudo activar el acceso');
  }

  return (
    <Frame footer={hasPassword ? <Link href="/proveedor/cuenta/recuperar">¿Olvidaste tu contraseña?</Link> : 'Este enlace sirve una sola vez.'}>
      <PublicCard glow>
        <PublicCardHeader
          icon={<Truck className="size-5" />}
          eyebrow={`${companyName} · ${supplierName}`}
          title={`Hola, ${personName}`}
          subtitle={hasPassword ? 'Ya tienes una cuenta en el portal de proveedores. Escribe tu contraseña para sumar este acceso.' : 'Crea tu contraseña para entrar al portal de proveedores.'}
        />
        <form onSubmit={submit} noValidate className="pub-form">
          <PublicField id="sc-accept-email" label="Correo">
            <input id="sc-accept-email" type="email" value={email} readOnly autoComplete="username" />
          </PublicField>
          {hasPassword ? (
            <PublicField id="sc-accept-password" label="Tu contraseña" error={error ?? undefined}>
              <input id="sc-accept-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={200} required autoFocus />
            </PublicField>
          ) : (
            <NewPasswordFields password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} error={error ?? undefined} />
          )}
          <PublicButton type="submit" full disabled={busy || !password || (!hasPassword && !confirm)}>
            {busy ? 'Activando…' : 'Activar mi acceso'}
          </PublicButton>
        </form>
      </PublicCard>
    </Frame>
  );
}
