'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { acceptInvitationAction, getInvitationByTokenAction } from '@/lib/actions/users';
import { ROLE_LABELS } from '@/lib/auth/roles';

function AcceptInvitationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<{ email: string; role: string; companyName: string; expired: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Enlace de invitación inválido');
      setLoading(false);
      return;
    }
    getInvitationByTokenAction(token).then((result) => {
      if (!result.success) setError(result.error);
      else setInvitation(result.data);
      setLoading(false);
    });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    setSubmitting(true);
    try {
      const result = await acceptInvitationAction(token, { name, password });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Cuenta creada correctamente');
      router.push('/dashboard');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md p-6">
        <h2 className="mb-4 text-2xl font-bold">Unirse al equipo</h2>

        {loading && <p className="text-sm text-muted-foreground">Cargando invitación...</p>}

        {!loading && (error || !invitation) && (
          <p className="text-sm text-destructive">{error ?? 'Invitación no encontrada'}</p>
        )}

        {!loading && invitation && invitation.expired && (
          <p className="text-sm text-destructive">Esta invitación ha expirado. Pide a un administrador que la reenvíe.</p>
        )}

        {!loading && invitation && !invitation.expired && (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Te han invitado a unirte a <span className="font-medium text-foreground">{invitation.companyName}</span> con el rol{' '}
              <span className="font-medium text-foreground">{ROLE_LABELS[invitation.role as keyof typeof ROLE_LABELS] ?? invitation.role}</span>.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Correo</Label>
                <Input value={invitation.email} disabled />
              </div>
              <div>
                <Label htmlFor="name">Nombre completo</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="password">Contraseña</Label>
                <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              </div>
              <div>
                <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                <PasswordInput
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Creando cuenta...' : 'Crear cuenta y continuar'}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Cargando...</div>}>
      <AcceptInvitationForm />
    </Suspense>
  );
}
