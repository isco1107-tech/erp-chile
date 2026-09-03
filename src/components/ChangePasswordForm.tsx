'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { completeForcedPasswordChangeAction } from '@/lib/actions/change-password';
import { PASSWORD_REQUIREMENTS, passwordPolicySchema } from '@/lib/auth/password-policy';

interface ChangePasswordFormProps {
  email: string;
}

export default function ChangePasswordForm({ email }: ChangePasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const policyCheck = passwordPolicySchema.safeParse(password);
  const showPolicyErrors = password.length > 0 && !policyCheck.success;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit = policyCheck.success && password === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await completeForcedPasswordChangeAction({ password, confirmPassword });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Contraseña actualizada');
      router.push('/dashboard');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
        <h2 className="mb-1 text-2xl font-bold">Elige tu nueva contraseña</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Ingresaste con una contraseña temporal para <span className="font-medium text-foreground">{email}</span>. Antes de
          continuar, elige una contraseña propia.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="password">Nueva contraseña</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={showPolicyErrors}
            />
          </div>

          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {PASSWORD_REQUIREMENTS.map((requirement) => (
              <li key={requirement}>· {requirement}</li>
            ))}
          </ul>
          {showPolicyErrors && (
            <p className="text-sm text-destructive">{policyCheck.success ? null : policyCheck.error.issues[0]?.message}</p>
          )}

          <div>
            <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={mismatch}
            />
            {mismatch && <p className="mt-1 text-sm text-destructive">Las contraseñas no coinciden.</p>}
          </div>

          <Button type="submit" className="w-full" disabled={submitting || !canSubmit}>
            {submitting ? 'Guardando...' : 'Guardar y entrar'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
