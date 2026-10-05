'use client';

import { useRef, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { formatRut } from '@/lib/chile/rut';
import { ADULT_AGE, ageOn } from '@/lib/academy/enrollment';
import { dayToDate } from '@/lib/academy/billing';
import { ACADEMY_HONEYPOT_FIELD, publicApplicationSchema } from '@/modules/academy/schema';
import { PublicButton, PublicCard, PublicCardHeader, PublicField, PublicPage, PublicShell, PublicStatus, PublicTopBar } from '@/components/public/PublicShell';

/**
 * Formulario público de inscripción a la academia (`/academia/inscripcion/[token]`).
 * La inscripción queda pendiente de revisión: acá solo se recopilan y validan
 * los datos; el servidor vuelve a validarlos y calcula la edad por su cuenta.
 */

interface Group {
  id: string;
  name: string;
  schedule: string | null;
}

interface ApiResponse {
  success: boolean;
  error?: string;
}

export default function AcademyEnrollmentForm({ token, companyName, groups }: { token: string; companyName: string; groups: Group[] }) {
  const [fullName, setFullName] = useState('');
  const [rut, setRut] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [preferredGroupId, setPreferredGroupId] = useState('');
  const [message, setMessage] = useState('');
  const [photoConsent, setPhotoConsent] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const honeypotRef = useRef<HTMLInputElement>(null);

  const birth = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? dayToDate(birthDate) : null;
  const minor = birth !== null && !Number.isNaN(birth.getTime()) && ageOn(birth, new Date()) < ADULT_AGE;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (honeypotRef.current?.value) return;
    const payload = {
      fullName,
      rut,
      birthDate,
      phone,
      email,
      guardianName,
      guardianPhone,
      guardianEmail,
      preferredGroupId: preferredGroupId || null,
      photoConsent,
      message,
      acceptPrivacy,
    };
    const parsed = publicApplicationSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await fetch(`/api/public/academy/${token}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed.data, [ACADEMY_HONEYPOT_FIELD]: honeypotRef.current?.value ?? '' }),
      });
      const json = (await res.json()) as ApiResponse;
      if (!json.success) {
        setErrors({ form: json.error ?? 'No pudimos enviar tu inscripción. Intenta de nuevo.' });
        setBusy(false);
        return;
      }
      setDone(true);
    } catch {
      setErrors({ form: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.' });
      setBusy(false);
    }
  }

  if (done) {
    return (
      <PublicStatus
        accent="gold"
        variant="success"
        title="¡Recibimos tu inscripción!"
        message={`${companyName} la revisará y se pondrá en contacto contigo para confirmar el grupo y el inicio de clases.`}
      />
    );
  }

  return (
    <PublicPage accent="gold">
      <PublicTopBar brand={companyName} right="Inscripción" />
      <PublicShell>
        <PublicCard glow>
          <PublicCardHeader
            icon={<GraduationCap size={22} strokeWidth={1.6} />}
            eyebrow="Academia"
            title="Inscríbete en la academia"
            subtitle="Completa tus datos. Revisaremos tu inscripción y te contactaremos para confirmarla."
          />
          <form onSubmit={submit} className="pub-form" noValidate>
            <input ref={honeypotRef} type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="pub-honeypot" name={ACADEMY_HONEYPOT_FIELD} />

            <PublicField id="fullName" label="Nombre completo de la alumna" error={errors.fullName}>
              <input id="fullName" autoComplete="name" maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </PublicField>
            <PublicField id="rut" label="RUT" error={errors.rut} hint="Ejemplo: 12.345.678-5">
              <input id="rut" inputMode="text" autoComplete="off" value={rut} onChange={(e) => setRut(e.target.value)} onBlur={() => rut && setRut(formatRut(rut))} placeholder="12.345.678-5" />
            </PublicField>
            <PublicField id="birthDate" label="Fecha de nacimiento" error={errors.birthDate}>
              <input id="birthDate" type="date" autoComplete="bday" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </PublicField>
            <PublicField id="phone" label="Teléfono de contacto" error={errors.phone}>
              <input id="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </PublicField>
            <PublicField id="email" label="Correo" optional error={errors.email}>
              <input id="email" type="email" autoComplete="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} />
            </PublicField>

            {minor && (
              <>
                <p className="pub-hint">Como es menor de edad, necesitamos los datos de su madre, padre o apoderado.</p>
                <PublicField id="guardianName" label="Nombre del apoderado" error={errors.guardianName}>
                  <input id="guardianName" maxLength={120} value={guardianName} onChange={(e) => setGuardianName(e.target.value)} />
                </PublicField>
                <PublicField id="guardianPhone" label="Teléfono del apoderado" error={errors.guardianPhone}>
                  <input id="guardianPhone" type="tel" inputMode="tel" maxLength={30} value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} />
                </PublicField>
                <PublicField id="guardianEmail" label="Correo del apoderado" optional error={errors.guardianEmail}>
                  <input id="guardianEmail" type="email" maxLength={120} value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} />
                </PublicField>
              </>
            )}

            {groups.length > 0 && (
              <PublicField id="preferredGroupId" label="Grupo de interés" optional>
                <select id="preferredGroupId" value={preferredGroupId} onChange={(e) => setPreferredGroupId(e.target.value)}>
                  <option value="">Aún no lo sé</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.schedule ? `${group.name} · ${group.schedule}` : group.name}
                    </option>
                  ))}
                </select>
              </PublicField>
            )}
            <PublicField id="message" label="Algo que quieras contarnos" optional error={errors.message}>
              <textarea id="message" maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
            </PublicField>

            <label className="pub-option">
              <input type="checkbox" checked={photoConsent} onChange={(e) => setPhotoConsent(e.target.checked)} />
              <span className="pub-option-body">
                <span className="pub-option-name">Autorizo el uso de la imagen (fotos y videos) de la alumna</span>
                <span className="pub-hint">Opcional. Puedes cambiarlo después hablando con la academia.</span>
              </span>
            </label>
            <PublicField id="acceptPrivacy" label="" error={errors.acceptPrivacy}>
              <label className="pub-option">
                <input id="acceptPrivacy" type="checkbox" checked={acceptPrivacy} onChange={(e) => setAcceptPrivacy(e.target.checked)} />
                <span className="pub-option-body">
                  <span className="pub-option-name">He leído el aviso de privacidad (al pie de esta página) y acepto el uso de mis datos para esta inscripción</span>
                </span>
              </label>
            </PublicField>

            {errors.form && (
              <p className="pub-error" role="alert">
                {errors.form}
              </p>
            )}
            <PublicButton type="submit" full disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar inscripción'}
            </PublicButton>
          </form>
        </PublicCard>
      </PublicShell>
    </PublicPage>
  );
}
