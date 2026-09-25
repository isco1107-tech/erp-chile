import type { CandidateStatus } from '@prisma/client';
import { buildCandidateStatusChangeEmail, buildSponsorAcceptedEmail } from '@/lib/email/templates';
import { isSponsorAcceptance } from '@/modules/sponsorships/schema';

const base = { fullName: 'Ana Pérez', projectName: 'Miss Ejemplo 2026', companyName: 'Productora Demo' };

function subjectFor(status: CandidateStatus, previousStatus?: CandidateStatus): string | null {
  return buildCandidateStatusChangeEmail({ ...base, status, previousStatus })?.subject ?? null;
}

describe('buildCandidateStatusChangeEmail (tablero de casting)', () => {
  const all: CandidateStatus[] = ['APPLICANT', 'UNDER_REVIEW', 'CALLED_TO_CASTING', 'OFFICIAL_CANDIDATE', 'FINALIST', 'WINNER', 'WITHDRAWN', 'REJECTED'];

  it('todo movimiento entre columnas distintas genera un correo', () => {
    for (const from of all) {
      for (const to of all) {
        if (from === to) continue;
        expect(subjectFor(to, from)).not.toBeNull();
      }
    }
  });

  it('sin cambio real de estado no se envía nada', () => {
    expect(subjectFor('FINALIST', 'FINALIST')).toBeNull();
  });

  it('avanzar felicita', () => {
    expect(subjectFor('CALLED_TO_CASTING', 'UNDER_REVIEW')).toContain('Felicitaciones');
    expect(subjectFor('FINALIST', 'OFFICIAL_CANDIDATE')).toContain('finalista');
  });

  it('retroceder nunca felicita', () => {
    expect(subjectFor('OFFICIAL_CANDIDATE', 'FINALIST')).toBe('Actualizamos tu postulación — Miss Ejemplo 2026');
    expect(subjectFor('UNDER_REVIEW', 'CALLED_TO_CASTING')).toBe('Actualizamos tu postulación — Miss Ejemplo 2026');
  });

  it('revisión, descarte y retiro tienen su propio correo', () => {
    expect(subjectFor('UNDER_REVIEW', 'APPLICANT')).toContain('en revisión');
    expect(subjectFor('REJECTED', 'UNDER_REVIEW')).toContain('Gracias por participar');
    expect(subjectFor('WITHDRAWN', 'OFFICIAL_CANDIDATE')).toContain('Confirmamos tu retiro');
  });

  it('una candidata reactivada tras un descarte recibe felicitaciones si avanza', () => {
    expect(subjectFor('CALLED_TO_CASTING', 'REJECTED')).toContain('Felicitaciones');
  });

  it('escapa el nombre en el HTML', () => {
    const email = buildCandidateStatusChangeEmail({ ...base, fullName: '<b>Ana</b>', status: 'UNDER_REVIEW', previousStatus: 'APPLICANT' });
    expect(email?.html).not.toContain('<b>Ana</b>');
    expect(email?.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
  });
});

describe('isSponsorAcceptance', () => {
  it('confirmar una propuesta, un cancelado o crear confirmado es aceptar', () => {
    expect(isSponsorAcceptance('PROPOSAL', 'CONFIRMED')).toBe(true);
    expect(isSponsorAcceptance('CANCELLED', 'CONFIRMED')).toBe(true);
    expect(isSponsorAcceptance(null, 'CONFIRMED')).toBe(true);
  });

  it('no reenvía si ya era sponsor ni en otros estados', () => {
    expect(isSponsorAcceptance('CONFIRMED', 'CONFIRMED')).toBe(false);
    expect(isSponsorAcceptance('COMPLETED', 'CONFIRMED')).toBe(false);
    expect(isSponsorAcceptance(null, 'PROPOSAL')).toBe(false);
    expect(isSponsorAcceptance('CONFIRMED', 'COMPLETED')).toBe(false);
  });
});

describe('buildSponsorAcceptedEmail', () => {
  it('incluye el portal, el nivel y el contacto del certamen', () => {
    const email = buildSponsorAcceptedEmail({
      contactName: 'Marca Uno',
      projectName: 'Miss Ejemplo 2026',
      companyName: 'Productora <Demo>',
      tierLabel: 'Oro',
      packageName: 'Plan Gala',
      portalUrl: 'https://app.ejemplo.cl/sponsors/abc',
      contact: { email: 'hola@ejemplo.cl', whatsapp: null },
    });
    expect(email.subject).toBe('¡Bienvenido como sponsor de Miss Ejemplo 2026!');
    expect(email.html).toContain('https://app.ejemplo.cl/sponsors/abc');
    expect(email.html).toContain('Plan Gala');
    expect(email.html).toContain('Productora &lt;Demo&gt;');
    expect(email.text).toContain('hola@ejemplo.cl');
  });
});
