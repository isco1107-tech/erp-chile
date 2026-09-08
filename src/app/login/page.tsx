"use client";

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from '@mantine/form';
import { z } from 'zod';
import { CreditCard, KeyRound, Mail, MessageSquareText, Package, ShieldCheck, Users } from 'lucide-react';
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

const HIGHLIGHTS = [
  { icon: Package, label: 'Inventario y ventas en tiempo real' },
  { icon: Users, label: 'Candidatas, staff y equipo en un solo lugar' },
  { icon: CreditCard, label: 'Cuotas, cobros y flujo de caja' },
  { icon: MessageSquareText, label: 'Mensajería interna cifrada' },
];

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
      <LoginShell>
        <Card className="w-full max-w-md border-white/10 bg-card/70 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="size-5.5" strokeWidth={1.75} />
          </div>
          <h2 className="text-xl font-bold">Verificación en dos pasos</h2>
          <p className="mt-1.5 mb-6 text-sm text-muted-foreground">
            Ingresa el código de 6 dígitos de tu app de autenticación, o uno de tus códigos de respaldo.
          </p>
          {error && (
            <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}
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
        </Card>
      </LoginShell>
    );
  }

  return (
    <LoginShell>
      <Card className="w-full max-w-md border-white/10 bg-card/70 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground">Bienvenido de vuelta</h2>
          <p className="mt-1 text-sm text-muted-foreground">Ingresa tus credenciales para acceder a tu panel.</p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

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
      </Card>
    </LoginShell>
  );
}

/**
 * Layout de dos paneles (estándar en SaaS moderno) en vez de una tarjeta
 * suelta sobre negro plano: a la izquierda la marca + propuesta de valor
 * (solo en pantallas grandes, `lg:flex`), a la derecha el formulario. Ambos
 * comparten el mismo fondo de marca (`BackgroundMark`) para que la
 * transición entre paneles no se sienta como dos pantallas distintas.
 */
function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen overflow-hidden">
      <BackgroundMark />

      <div className="relative z-10 flex w-full flex-col lg:flex-row">
        <div className="hidden flex-col justify-between p-12 lg:flex lg:w-1/2 xl:p-16">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding/aether-icon.png" alt="" aria-hidden="true" className="size-7 object-contain" />
            <span className="text-sm font-semibold tracking-wide text-foreground">AETHER ERP</span>
          </div>

          <div className="max-w-md space-y-7">
            <h1 className="text-4xl leading-[1.15] font-bold text-balance text-foreground">
              Todo tu negocio, en un solo panel.
            </h1>
            <p className="text-base text-muted-foreground">
              Ventas, inventario, cobros, candidatas y mensajería interna — sin planillas sueltas ni sistemas que no se
              hablan entre sí.
            </p>
            <ul className="space-y-3.5">
              {HIGHLIGHTS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3 text-sm text-foreground/90">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" strokeWidth={1.75} />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Aether ERP Solutions</p>
        </div>

        <div className="flex flex-1 items-center justify-center p-4">{children}</div>
      </div>
    </div>
  );
}

/**
 * El isotipo de Aether de fondo, a color real (estrella dorada, azul marino
 * — el logo tal cual es, no una silueta). `aether-mark.svg` se descartó:
 * era una versión en negro sólido sin los colores del logo real, así que
 * cualquier técnica sobre ese archivo (invert, mask-image) perdía la
 * estrella dorada — el propio PNG a color (`aether-logo-full.png`) es la
 * única fuente que tiene el diseño completo. Viñeta radial encima para que
 * se difumine hacia los bordes en vez de cortarse en seco.
 */
function BackgroundMark() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/branding/aether-logo-full.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 m-auto h-auto w-[min(78vw,1150px)] object-contain opacity-90 select-none lg:w-[min(52vw,950px)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 0%, transparent 42%, var(--background) 88%)' }}
      />
    </>
  );
}
