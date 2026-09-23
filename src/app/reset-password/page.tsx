'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { LockKeyhole } from 'lucide-react';
import { AuthCard, AuthCardHeader, AuthError, AuthShell } from '@/components/auth/AuthShell';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { checkResetTokenAction, resetPasswordAction } from '@/lib/actions/password-reset';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Se valida el token antes de mostrar el formulario: es preferible decir
  // "este enlace venció" de entrada que después de que el usuario escribió
  // dos veces una contraseña nueva.
  useEffect(() => {
    if (!token) {
      setTokenError('Enlace de recuperación inválido.');
      setChecking(false);
      return;
    }
    checkResetTokenAction(token).then((result) => {
      if (result.success) setEmail(result.data.email);
      else setTokenError(result.error);
      setChecking(false);
    });
  }, [token]);

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const tooShort = password.length > 0 && password.length < 8;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    setSubmitting(true);
    try {
      const result = await resetPasswordAction({ token, password, confirmPassword });
      if (!result.success) {
        toast.error(result.error);
        setTokenError(result.error);
        return;
      }
      toast.success(result.message ?? 'Contraseña actualizada');
      router.push('/login');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <AuthCard>
        <AuthCardHeader
          icon={<LockKeyhole className="size-5.5" strokeWidth={1.75} />}
          title="Elegir nueva contraseña"
          description={checking ? 'Validando tu enlace…' : undefined}
        />

        {!checking && tokenError && (
          <div className="space-y-4">
            <AuthError>{tokenError}</AuthError>
            <Link href="/forgot-password" className="inline-block text-sm underline underline-offset-4">
              Solicitar un enlace nuevo
            </Link>
          </div>
        )}

        {!checking && !tokenError && email && (
          <>
            <p className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-muted-foreground">
              Estás cambiando la contraseña de <span className="font-medium text-foreground">{email}</span>.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password">Nueva contraseña</Label>
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={tooShort}
                />
                {tooShort && <p className="mt-1 text-sm text-destructive">Mínimo 8 caracteres.</p>}
              </div>
              <div>
                <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                <PasswordInput
                  id="confirmPassword"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-invalid={mismatch}
                />
                {mismatch && <p className="mt-1 text-sm text-destructive">Las contraseñas no coinciden.</p>}
              </div>
              <Button type="submit" className="w-full" disabled={submitting || mismatch || tooShort}>
                {submitting ? 'Guardando...' : 'Guardar y volver a entrar'}
              </Button>
            </form>
          </>
        )}
      </AuthCard>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <AuthCard>
            <AuthCardHeader title="Elegir nueva contraseña" description="Validando tu enlace…" />
          </AuthCard>
        </AuthShell>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
