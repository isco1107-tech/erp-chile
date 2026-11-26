'use client';

import { useRef, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { formatRut } from '@/lib/chile/rut';
import type { CheckInOutcome } from '@/lib/academy/check-in';
import { ACADEMY_HONEYPOT_FIELD, publicCheckInSchema } from '@/modules/academy/schema';
import { PublicButton, PublicCard, PublicCardHeader, PublicField, PublicPage, PublicShell, PublicStatus, PublicTopBar } from '@/components/public/PublicShell';

/**
 * Página que abre el QR de asistencia (`/academia/asistencia/[token]`): la
 * alumna escribe su RUT y queda presente. Solo viaja el RUT; el grupo y el día
 * salen del token en el servidor.
 */

interface ApiResponse {
  success: boolean;
  data?: CheckInOutcome;
  error?: string;
}

interface Props {
  token: string;
  companyName: string;
  groupName: string;
  dayLabel: string;
  /** "HH:MM" desde la que se registra como atraso; `null` = nunca. */
  lateAfter: string | null;
}

export default function AcademyCheckInForm({ token, companyName, groupName, dayLabel, lateAfter }: Props) {
  const [rut, setRut] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CheckInOutcome | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (honeypotRef.current?.value) return;
    const parsed = publicCheckInSchema.safeParse({ rut });
    if (!parsed.success) return void setError(parsed.error.issues[0]?.message ?? 'Revisa tu RUT');
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/public/academy/check-in/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: parsed.data.rut, [ACADEMY_HONEYPOT_FIELD]: honeypotRef.current?.value ?? '' }),
      });
      const json = (await res.json()) as ApiResponse;
      setBusy(false);
      if (!json.success || !json.data) return void setError(json.error ?? 'No pudimos registrar tu asistencia. Intenta de nuevo.');
      if (json.data.kind === 'NOT_FOUND') {
        return void setError(`No encontramos ese RUT en la lista de ${groupName}. Revisa que esté bien escrito o avísale a tu profesora.`);
      }
      setOutcome(json.data);
    } catch {
      setBusy(false);
      setError('No se pudo conectar. Revisa tu conexión e intenta de nuevo.');
    }
  }

  function another() {
    setOutcome(null);
    setRut('');
    setError(null);
  }

  if (outcome) {
    const anotherButton = (
      <PublicButton type="button" variant="ghost" onClick={another}>
        Registrar a otra alumna
      </PublicButton>
    );
    switch (outcome.kind) {
      case 'CREATED':
        return (
          <PublicStatus
            accent="gold"
            variant="success"
            title={`¡Listo, ${outcome.firstName}!`}
            message={
              outcome.status === 'LATE'
                ? `Quedaste registrada con atraso en ${groupName} hoy, ${dayLabel}, a las ${outcome.at}.`
                : `Quedaste presente en ${groupName} hoy, ${dayLabel}, a las ${outcome.at}.`
            }
          >
            {anotherButton}
          </PublicStatus>
        );
      case 'ALREADY_PRESENT':
        return (
          <PublicStatus accent="gold" variant="success" title={`${outcome.firstName}, ya estabas registrada`} message={`Tu asistencia de hoy en ${groupName} ya estaba anotada. No tienes que hacer nada más.`}>
            {anotherButton}
          </PublicStatus>
        );
      case 'MARKED_BY_TEACHER':
        return (
          <PublicStatus accent="gold" variant="error" title={`${outcome.firstName}, avísale a tu profesora`} message="Tu profesora ya había marcado tu asistencia de hoy. Cuéntale que llegaste para que la corrija.">
            {anotherButton}
          </PublicStatus>
        );
      case 'CANCELLED':
        return <PublicStatus accent="gold" variant="error" title="La clase de hoy está cancelada" message={`La clase de ${groupName} de hoy no se realiza, así que no se registra asistencia.`} />;
      case 'CLOSED':
        return <PublicStatus accent="gold" variant="error" title="El registro ya se cerró" message="Este QR ya no recibe asistencia. Avísale a tu profesora para que te marque." />;
      default:
        return null;
    }
  }

  return (
    <PublicPage accent="gold">
      <PublicTopBar brand={companyName} right="Asistencia" />
      <PublicShell>
        <PublicCard glow>
          <PublicCardHeader icon={<CalendarCheck size={22} strokeWidth={1.6} />} eyebrow={groupName} title="Registra tu asistencia" subtitle={`Clase de hoy, ${dayLabel}. Escribe tu RUT para quedar presente.${lateAfter ? ` Desde las ${lateAfter} se registra como atraso.` : ''}`} />
          <form onSubmit={submit} className="pub-form" noValidate>
            <input ref={honeypotRef} type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="pub-honeypot" name={ACADEMY_HONEYPOT_FIELD} />
            <PublicField id="rut" label="Tu RUT" error={error ?? undefined} hint="Ejemplo: 12.345.678-5">
              <input
                id="rut"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                autoFocus
                maxLength={20}
                value={rut}
                onChange={(e) => setRut(e.target.value)}
                onBlur={() => rut && setRut(formatRut(rut))}
                placeholder="12.345.678-5"
              />
            </PublicField>
            <PublicButton type="submit" full disabled={busy}>
              {busy ? 'Registrando…' : 'Registrar asistencia'}
            </PublicButton>
            <p className="pub-hint">Tu RUT solo se usa para encontrarte en la lista de este grupo.</p>
          </form>
        </PublicCard>
      </PublicShell>
    </PublicPage>
  );
}
