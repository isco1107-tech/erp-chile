"use client";

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from '@mantine/form';
import { z } from 'zod';
import { KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { AuthCard, AuthCardHeader, AuthError, AuthShell } from '@/components/auth/AuthShell';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const loginSchema = z.object({
  username: z.string().min(1, { message: 'Ingresa tu usuario o correo' }),
  password: z.string().min(8, { message: 'La contraseña debe tener al menos 8 caracteres' }),
});

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');

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
        body: JSON.stringify({ email: values.username, password: values.password }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || 'Credenciales inválidas');
        setError(json.error || 'Credenciales inválidas');
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
      toast.error('Error al iniciar sesión');
      setError('Error al iniciar sesión');
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
        toast.error(json.error || 'Código incorrecto');
        setError(json.error || 'Código incorrecto');
        return;
      }
      toast.success('Inicio de sesión correcto');
      router.push('/dashboard');
    } catch (e) {
      toast.error('Error al verificar el código');
      setError('Error al verificar el código');
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
          title="Bienvenido de vuelta"
          description="Ingresa tus credenciales para acceder a tu panel."
        />

        {error && <AuthError>{error}</AuthError>}

        <form onSubmit={form.onSubmit((values) => handleSubmit(values))} className="space-y-4">
          <div>
            <Label htmlFor="username">Usuario</Label>
            <div className="relative mt-1.5">
              <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
              <Input id="username" className="pl-9" {...form.getInputProps('username')} />
            </div>
            {form.errors.username && <div className="mt-1 text-sm text-destructive">{form.errors.username}</div>}
          </div>

          <div>
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative mt-1.5">
              <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
              <PasswordInput id="password" className="pl-9" {...form.getInputProps('password')} />
            </div>
            {form.errors.password && <div className="mt-1 text-sm text-destructive">{form.errors.password}</div>}
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm">
          <Link href="/forgot-password" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}
