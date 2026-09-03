'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
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
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
        {sentMessage ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto w-fit rounded-full bg-green-600/10 p-3">
              <MailCheck className="size-6 text-green-600" />
            </div>
            <h2 className="text-xl font-bold">Revisa tu correo</h2>
            <p className="text-sm text-muted-foreground">{sentMessage}</p>
            <Link href="/login" className="inline-block text-sm underline underline-offset-4">
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <>
            <h2 className="mb-1 text-2xl font-bold">Recuperar contraseña</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Ingresa tu correo y te enviaremos un enlace para elegir una nueva contraseña.
            </p>

            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@empresa.cl"
                />
              </div>
              <Button type="submit" className="w-full" disabled={sending}>
                {sending ? 'Enviando...' : 'Enviarme el enlace'}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm">
              <Link href="/login" className="underline underline-offset-4">
                Volver a iniciar sesión
              </Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
