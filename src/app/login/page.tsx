"use client";

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from '@mantine/form';
import { z } from 'zod';
import { Card } from '@/components/ui/card';
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
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md p-6">
          <h2 className="text-2xl font-bold mb-1">Verificación en dos pasos</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Ingresa el código de 6 dígitos de tu app de autenticación, o uno de tus códigos de respaldo.
          </p>
          {error && <div className="text-red-600 mb-3">{error}</div>}
          <form onSubmit={handleVerifyTotp} className="space-y-4">
            <div>
              <Label htmlFor="totpCode">Código</Label>
              <Input
                id="totpCode"
                inputMode="numeric"
                autoFocus
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || totpCode.trim().length === 0}>
              {loading ? 'Verificando...' : 'Verificar'}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => { setChallengeToken(null); setTotpCode(''); setError(null); }}>
              Volver
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md p-6">
        <div className="mb-6 flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/aether-logo-full.png" alt="Aether ERP Solutions" className="h-10 w-auto object-contain" />
        </div>
        <h2 className="text-2xl font-bold mb-4">Iniciar sesión</h2>
        {error && <div className="text-red-600 mb-3">{error}</div>}

        <form onSubmit={form.onSubmit((values) => handleSubmit(values))} className="space-y-4">
          <div>
            <Label htmlFor="username">Usuario</Label>
            <Input id="username" {...form.getInputProps('username')} />
            {form.errors.username && <div className="text-sm text-red-600">{form.errors.username}</div>}
          </div>

          <div>
            <Label htmlFor="password">Contraseña</Label>
            <PasswordInput id="password" {...form.getInputProps('password')} />
            {form.errors.password && <div className="text-sm text-red-600">{form.errors.password}</div>}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</Button>
        </form>

        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
      </Card>
    </div>
  );
}
