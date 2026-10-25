"use client";

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useForm } from '@mantine/form';
import { z } from 'zod';
import { KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { AuthCard, AuthCardHeader, AuthError, LoginShell } from '@/components/auth/AuthShell';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { offerPasswordSave, readRememberedLogin, rememberedLoginSnapshot, saveRememberedLogin, subscribeRememberedLogin } from '@/lib/auth/remembered-login';
import TurnstileWidget, { isTurnstileConfigured } from '@/components/security/TurnstileWidget';

const loginSchema = z.object({
  username: z.string().min(1, { message: 'Ingresa tu usuario o correo' }),
  password: z.string().min(8, { message: 'La contraseña debe tener al menos 8 caracteres' }),
});

/** Mensajes de `/login?reason=...` para redirecciones desde el dashboard que no son un cierre de sesión normal (ver `(dashboard)/layout.tsx`). */
/** Destino tras iniciar sesión: el que indica el servidor (el selector de empresa si trabaja en varias), solo si es una ruta interna. */
function nextPath(json: { data?: { redirectTo?: unknown } }, callbackUrl: string | null): string {
  const target = json.data?.redirectTo;
  const server = typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/dashboard';
  // La app del bodeguero (`/bodega`) vuelve a sí misma tras iniciar sesión. Solo esa ruta, y solo si
  // el servidor no mandó a otro lado (selector de empresa, cambio de contraseña).
  return server === '/dashboard' && (callbackUrl === '/bodega' || callbackUrl === '/pos' || callbackUrl === '/control') ? callbackUrl : server;
}

/**
 * La app del bodeguero necesita la cámara y el POS el USB (cajón e impresora), y el permiso lo da una cabecera
 * del DOCUMENTO (`Permissions-Policy`, ver next.config.js): una navegación interna desde esta página conservaría
 * la política del login (sin cámara ni USB). Por eso a `/bodega` y `/pos` se entra con una carga completa.
 */
function goTo(router: ReturnType<typeof useRouter>, path: string): void {
  if (path === '/bodega' || path === '/pos') {
    window.location.assign(path);
    return;
  }
  router.push(path);
}

const LOGIN_REDIRECT_REASONS: Record<string, string> = {
  ip: 'Tu sesión sigue activa, pero tu empresa restringió el acceso a ciertas direcciones IP y la tuya no está autorizada. Contacta al administrador de tu empresa.',
};

export function LoginForm({ warehouse = false, pos = false, control = false }: { warehouse?: boolean; pos?: boolean; control?: boolean }) {
  const router = useRouter();
  const savedLogin = readRememberedLogin(useSyncExternalStore(subscribeRememberedLogin, rememberedLoginSnapshot, () => null));
  const [rememberOverride, setRememberOverride] = useState<boolean | null>(null);
  const remember = rememberOverride ?? savedLogin.remember;
  const passwordInput = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();
  const redirectReason = searchParams.get('reason');
  const [error, setError] = useState<string | null>(
    redirectReason ? (LOGIN_REDIRECT_REASONS[redirectReason] ?? null) : null
  );
  const [loading, setLoading] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  // Token de Cloudflare Turnstile (solo si está configurado). Es de un solo
  // uso: tras cada intento se remonta el widget para obtener uno nuevo.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);

  const form = useForm({
    initialValues: { username: '', password: '' },
    validate: (values) => {
      const result = loginSchema.safeParse(values);
      if (result.success) return {};
      return result.error.issues.reduce<Record<string, string>>((acc, issue) => {
        const key = issue.path[0];
        if (typeof key === 'string') acc[key] = issue.message;
        return acc;
      }, {});
    }
  });

  const { setFieldValue, isDirty } = form;
  useEffect(() => {
    if (savedLogin.username && !isDirty('username')) {
      setFieldValue('username', savedLogin.username);
      passwordInput.current?.focus();
    }
  }, [savedLogin.username, setFieldValue, isDirty]);

  const rememberSuccessfulLogin = (username: string, password: string) => {
    saveRememberedLogin(username, remember);
    if (remember) offerPasswordSave(username, password);
  };

  const handleSubmit = async (values: typeof form.values) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.username, password: values.password, 'cf-turnstile-response': turnstileToken }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Correo o contraseña incorrectos');
        if (isTurnstileConfigured) {
          setTurnstileToken(null);
          setTurnstileKey((key) => key + 1);
        }
        return;
      }
      if (json.data?.totpRequired) {
        setChallengeToken(json.data.challengeToken);
        setError(null);
        return;
      }
      rememberSuccessfulLogin(values.username, values.password);
      toast.success('Inicio de sesión correcto');
      goTo(router, nextPath(json, warehouse ? '/bodega' : pos ? '/pos' : control ? '/control' : searchParams.get('callbackUrl')));
    } catch (e) {
      setError('No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeToken) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken, code: totpCode.trim() }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Código incorrecto');
        return;
      }
      rememberSuccessfulLogin(form.values.username, form.values.password);
      toast.success('Inicio de sesión correcto');
      goTo(router, nextPath(json, warehouse ? '/bodega' : pos ? '/pos' : control ? '/control' : searchParams.get('callbackUrl')));
    } catch (e) {
      setError('No pudimos verificar el código. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (challengeToken) {
    return (
      <AuthCard>
        <AuthCardHeader
          icon={<ShieldCheck className="size-5.5" strokeWidth={1.75} />}
          title="Verificación en dos pasos"
          description="Ingresa el código de 6 dígitos de tu app de autenticación, o uno de tus códigos de respaldo."
        />
        {error && <AuthError>{error}</AuthError>}
        <form onSubmit={handleVerifyTotp} className="space-y-5">
          <div>
            <Label htmlFor="totpCode">Código</Label>
            <Input
              id="totpCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              className="mt-1.5 text-center text-lg tracking-[0.4em]"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={loading || totpCode.trim().length === 0}>
            {loading ? 'Verificando...' : 'Verificar'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => { setChallengeToken(null); setTotpCode(''); setError(null); }}
          >
            Volver
          </Button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthCardHeader
        title={warehouse ? "Ingresa a Bodega móvil" : pos ? "Ingresa al Punto de Venta" : control ? "Ingresa a Aether Control" : "Ingresa a tu empresa"}
        description={warehouse ? "Usa tu usuario y contraseña del ERP. Entrarás directamente a tu bodega." : pos ? "Usa tu cuenta personal del ERP. Las ventas y los movimientos quedarán identificados con tu cajero." : control ? "Usa la cuenta del dueño. Entrarás directamente al control de tu empresa." : "Usa el correo y la contraseña con que te invitaron."}
      />

      {error && <AuthError>{error}</AuthError>}

      <form method="post" autoComplete="on" onSubmit={form.onSubmit((values) => handleSubmit(values))} className="space-y-4">
        <div>
          <Label htmlFor="username">Correo o usuario</Label>
          <div className="relative mt-1.5">
            <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <Input
              id="username"
              name="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={warehouse ? "h-12 pl-9 text-base" : "h-10 pl-9"}
              autoComplete="username"
              autoFocus
              aria-invalid={Boolean(form.errors.username)}
              aria-describedby={form.errors.username ? 'username-error' : undefined}
              {...form.getInputProps('username')}
            />
          </div>
          {form.errors.username && <p id="username-error" className="mt-1.5 text-sm text-destructive">{form.errors.username}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Link href="/forgot-password" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              ¿La olvidaste?
            </Link>
          </div>
          <div className="relative mt-1.5">
            <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <PasswordInput
              id="password"
              name="password"
              ref={passwordInput}
              className={warehouse ? "h-12 pl-9 text-base" : "h-10 pl-9"}
              autoComplete="current-password"
              aria-invalid={Boolean(form.errors.password)}
              aria-describedby={form.errors.password ? 'password-error' : undefined}
              {...form.getInputProps('password')}
            />
          </div>
          {form.errors.password && <p id="password-error" className="mt-1.5 text-sm text-destructive">{form.errors.password}</p>}
        </div>

        <div className="space-y-1">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" name="remember" checked={remember} onChange={(event) => {
              setRememberOverride(event.target.checked);
              if (!event.target.checked) saveRememberedLogin('', false);
            }} className="size-5 accent-primary" />
            Recordar mis datos en este dispositivo
          </label>
          <p className="text-xs text-muted-foreground">Recordamos tu usuario. Guarda la contraseña con el gestor de tu teléfono o navegador.</p>
          {savedLogin.username ? (
            <button type="button" onClick={() => {
              saveRememberedLogin('', false);
              setRememberOverride(false);
              form.setValues({ username: '', password: '' });
              document.getElementById('username')?.focus();
            }} className="min-h-11 text-sm text-muted-foreground underline underline-offset-4">Olvidar usuario</button>
          ) : null}
        </div>

        <TurnstileWidget key={turnstileKey} action="login" theme="dark" onToken={setTurnstileToken} className="flex min-h-[65px] justify-center" />

        <Button type="submit" className={warehouse ? "mt-2 h-12 w-full text-base" : "mt-2 h-10 w-full"} size="lg" disabled={loading || (isTurnstileConfigured && !turnstileToken)}>
          {loading ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  // El marco (con el video) queda fuera del Suspense y del formulario: pasar
  // del fallback al formulario, o al paso de 2FA, no reinicia el video.
  return (
    <LoginShell>
      <Suspense
        fallback={
          <AuthCard>
            <AuthCardHeader title="Ingresa a tu empresa" description="Usa el correo y la contraseña con que te invitaron." />
          </AuthCard>
        }
      >
        <LoginForm />
      </Suspense>
    </LoginShell>
  );
}
