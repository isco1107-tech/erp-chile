"use client";

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useForm } from '@mantine/form';
import { z } from 'zod';
import { KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { AuthCard, AuthCardHeader, AuthError, AuthShell } from '@/components/auth/AuthShell';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import TurnstileWidget, { isTurnstileConfigured } from '@/components/security/TurnstileWidget';

const loginSchema = z.object({
  username: z.string().min(1, { message: 'Ingresa tu usuario o correo' }),
  password: z.string().min(8, { message: 'La contraseña debe tener al menos 8 caracteres' }),
});

/** Mensajes de `/login?reason=...` para redirecciones desde el dashboard que no son un cierre de sesión normal (ver `(dashboard)/layout.tsx`). */
const LOGIN_REDIRECT_REASONS: Record<string, string> = {
  ip: 'Tu sesión sigue activa, pero tu empresa restringió el acceso a ciertas direcciones IP y la tuya no está autorizada. Contacta al administrador de tu empresa.',
};

function LoginForm() {
  const router = useRouter();
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
      toast.success('Inicio de sesión correcto');
      router.push('/dashboard');
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
      toast.success('Inicio de sesión correcto');
      router.push('/dashboard');
    } catch (e) {
      setError('No pudimos verificar el código. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (challengeToken) {
    return (
      <AuthShell>
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
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthCard>
        <AuthCardHeader
          title="Ingresa a tu empresa"
          description="Usa el correo y la contraseña con que te invitaron."
        />

        {error && <AuthError>{error}</AuthError>}

        <form onSubmit={form.onSubmit((values) => handleSubmit(values))} className="space-y-4">
          <div>
            <Label htmlFor="username">Correo o usuario</Label>
            <div className="relative mt-1.5">
              <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
              <Input
                id="username"
                className="h-10 pl-9"
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
                className="h-10 pl-9"
                autoComplete="current-password"
                aria-invalid={Boolean(form.errors.password)}
                aria-describedby={form.errors.password ? 'password-error' : undefined}
                {...form.getInputProps('password')}
              />
            </div>
            {form.errors.password && <p id="password-error" className="mt-1.5 text-sm text-destructive">{form.errors.password}</p>}
          </div>

          <TurnstileWidget key={turnstileKey} action="login" theme="dark" onToken={setTurnstileToken} className="flex min-h-[65px] justify-center" />

          <Button type="submit" className="mt-2 h-10 w-full" size="lg" disabled={loading || (isTurnstileConfigured && !turnstileToken)}>
            {loading ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </AuthCard>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <AuthCard>
            <AuthCardHeader title="Ingresa a tu empresa" description="Usa el correo y la contraseña con que te invitaron." />
          </AuthCard>
        </AuthShell>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
