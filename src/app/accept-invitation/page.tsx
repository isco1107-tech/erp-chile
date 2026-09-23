'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import { acceptInvitationAction, getInvitationByTokenAction } from '@/lib/actions/users';
import { ROLE_LABELS } from '@/lib/auth/roles';
import {
  PublicBadge,
  PublicButton,
  PublicCard,
  PublicCardHeader,
  PublicField,
  PublicFooter,
  PublicPage,
  PublicShell,
  PublicStatus,
  PublicTopBar,
} from '@/components/public/PublicShell';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Fuerza de contraseña, solo como guía visual: el mínimo real que exige el
 * servidor sigue siendo la longitud (`MIN_PASSWORD_LENGTH`). Esta barra no
 * bloquea el envío — señalar "débil" y además impedir continuar convierte una
 * ayuda en un muro, y la política de contraseñas vive en el servidor, no acá.
 */
function passwordStrength(value: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (value.length < MIN_PASSWORD_LENGTH) return { score: 0, label: `Mínimo ${MIN_PASSWORD_LENGTH} caracteres` };
  let points = 0;
  if (value.length >= 12) points += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) points += 1;
  if (/\d/.test(value)) points += 1;
  if (/[^A-Za-z0-9]/.test(value)) points += 1;
  if (points <= 1) return { score: 1, label: 'Débil' };
  if (points <= 2) return { score: 2, label: 'Aceptable' };
  return { score: 3, label: 'Fuerte' };
}

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
  const [showPassword, setShowPassword] = useState(false);
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

  if (loading) return <PublicStatus variant="loading" message="Cargando tu invitación…" />;

  if (error || !invitation) {
    return (
      <PublicStatus
        variant="error"
        title="Invitación no disponible"
        message={error ?? 'No encontramos esta invitación. Pide a un administrador que la reenvíe.'}
      />
    );
  }

  if (invitation.expired) {
    return (
      <PublicStatus
        variant="error"
        title="Esta invitación expiró"
        message={`Pide a un administrador de ${invitation.companyName} que te reenvíe la invitación.`}
      />
    );
  }

  const roleLabel = ROLE_LABELS[invitation.role as keyof typeof ROLE_LABELS] ?? invitation.role;
  const strength = passwordStrength(password);
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <PublicPage accent="gold">
      <PublicTopBar brand={invitation.companyName} right="Invitación" />
      <PublicShell>
        <PublicCard glow>
          <PublicCardHeader
            icon={<UserPlus size={22} strokeWidth={1.6} />}
            eyebrow="Te invitaron al equipo"
            title={`Únete a ${invitation.companyName}`}
            subtitle="Crea tu contraseña y entras directo a tu panel."
          />

          <div className="pub-panel" style={{ marginBottom: '1.5rem' }}>
            <div className="pub-row">
              <span>Correo</span>
              <span>{invitation.email}</span>
            </div>
            <div className="pub-row">
              <span>Rol asignado</span>
              <span><PublicBadge tone="accent">{roleLabel}</PublicBadge></span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="pub-form">
            <PublicField id="name" label="Nombre completo">
              <input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </PublicField>

            <PublicField
              id="password"
              label="Contraseña"
              hint={password.length === 0 ? `Al menos ${MIN_PASSWORD_LENGTH} caracteres.` : undefined}
            >
              <div className="pub-input-affix">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={16} strokeWidth={1.7} /> : <Eye size={16} strokeWidth={1.7} />}
                </button>
              </div>
              {password.length > 0 && (
                <div className="pub-strength" data-score={strength.score}>
                  <span /><span /><span />
                  <em>{strength.label}</em>
                </div>
              )}
            </PublicField>

            <PublicField
              id="confirmPassword"
              label="Confirmar contraseña"
              error={mismatch ? 'Las contraseñas no coinciden.' : undefined}
            >
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </PublicField>

            <PublicButton type="submit" full disabled={submitting || mismatch}>
              {submitting ? 'Creando cuenta…' : 'Crear cuenta y continuar'}
            </PublicButton>
          </form>
        </PublicCard>
      </PublicShell>
      <PublicFooter>{invitation.companyName} · Invitación privada, no la compartas</PublicFooter>
    </PublicPage>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<PublicStatus variant="loading" message="Cargando tu invitación…" />}>
      <AcceptInvitationForm />
    </Suspense>
  );
}
