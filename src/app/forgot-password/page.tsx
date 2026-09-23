'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KeyRound, MailCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AuthCard, AuthCardHeader, AuthError, AuthShell } from '@/components/auth/AuthShell';
import { requestPasswordResetAction } from '@/lib/actions/password-reset';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const result = await requestPasswordResetAction({ email });
      if (!result.success) {
        setError(result.error);
        return;
      }
      // La respuesta es la misma exista o no la cuenta: la pantalla de "revisa
      // tu correo" no confirma ni desmiente que el correo esté registrado.
      setSentMessage(result.message ?? 'Revisa tu correo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthShell>
      <AuthCard>
        {sentMessage ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <MailCheck className="size-5.5" strokeWidth={1.75} />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Revisa tu correo</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{sentMessage}</p>
            <Link href="/login" className="inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <>
            <AuthCardHeader
              icon={<KeyRound className="size-5.5" strokeWidth={1.75} />}
              title="Recuperar contraseña"
              description="Ingresa tu correo y te enviaremos un enlace para elegir una nueva contraseña."
            />

            {error && <AuthError>{error}</AuthError>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="mt-1.5"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@empresa.cl"
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={sending}>
                {sending ? 'Enviando...' : 'Enviarme el enlace'}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm">
              <Link href="/login" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
                Volver a iniciar sesión
              </Link>
            </p>
          </>
        )}
      </AuthCard>
    </AuthShell>
  );
}
