import {
  applicationPhotoPrefix,
  checkRegistrationRequirements,
  describeRequirements,
  requirementsFromProject,
} from '@/lib/events/registration-requirements';
import { candidateSelfRegistrationSchema } from '@/modules/candidates/schema';
import { pageantFaq } from '@/lib/events/pageant-site';

const all = { minAge: 21, chileanNationality: true, instagram: true, photo: true };

describe('requisitos de inscripción', () => {
  it('arma los requisitos desde las columnas del certamen', () => {
    expect(
      requirementsFromProject({ minCandidateAge: 21, requireChileanNationality: true, requireCandidateInstagram: false, requireCandidatePhoto: true })
    ).toEqual({ minAge: 21, chileanNationality: true, instagram: false, photo: true });
  });

  it('lista solo lo que el certamen exige', () => {
    expect(describeRequirements({ minAge: 18, chileanNationality: false, instagram: false, photo: false })).toEqual(['Tener al menos 18 años']);
    expect(describeRequirements(all)).toEqual([
      'Tener al menos 21 años',
      'Ser chilena',
      'Tener una cuenta de Instagram',
      'Subir una foto tuya al inscribirte',
    ]);
  });

  it('marca cada requisito incumplido por campo', () => {
    expect(Object.keys(checkRegistrationRequirements(all, { age: 19 })).sort()).toEqual(['age', 'declaraNacionalidadChilena', 'instagram', 'photoUrl']);
    expect(
      checkRegistrationRequirements(all, { age: 21, instagram: '@ana', photoUrl: 'https://x/y.jpg', declaraNacionalidadChilena: true })
    ).toEqual({});
  });

  it('no exige lo que el certamen no pidió', () => {
    expect(checkRegistrationRequirements({ minAge: 18, chileanNationality: false, instagram: false, photo: false }, { age: 18 })).toEqual({});
  });

  it('la carpeta de fotos es por empresa', () => {
    expect(applicationPhotoPrefix('c1')).toBe('candidates/c1/applications/');
  });
});

describe('esquema de auto-inscripción con requisitos opcionales', () => {
  const base = {
    fullName: 'Ana Pérez',
    rut: '12.345.678-5',
    age: 20,
    comuna: 'Temuco',
    phone: '+56 9 1234 5678',
    email: 'ana@example.cl',
    motivacion: 'Quiero participar y crecer',
    aceptaTratamientoDatos: true,
  };

  it('acepta sin Instagram (la exigencia la decide el certamen en el servidor)', () => {
    const parsed = candidateSelfRegistrationSchema.safeParse({ ...base, instagram: '' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.instagram).toBeUndefined();
  });

  it('normaliza el Instagram cuando viene y rechaza uno inválido', () => {
    const ok = candidateSelfRegistrationSchema.safeParse({ ...base, instagram: 'https://instagram.com/ana.perez' });
    expect(ok.success && ok.data.instagram).toBe('@ana.perez');
    expect(candidateSelfRegistrationSchema.safeParse({ ...base, instagram: 'no es un usuario!!' }).success).toBe(false);
  });
});

describe('pregunta frecuente de postulación', () => {
  it('nombra los requisitos marcados', () => {
    const faq = pageantFaq({
      name: 'Miss Test',
      registration: { closesAt: null, minAge: 21, requirements: all },
      voting: null,
      tickets: null,
      galaDate: null,
      venueName: null,
      venueAddress: null,
      sponsorChannel: null,
      contactEmail: null,
      formatMoney: String,
    });
    expect(faq[0]?.a).toContain('Debes tener al menos 21 años, ser chilena, tener Instagram y subir una foto tuya.');
  });
});

describe('formulario de sponsor: Instagram de la empresa', () => {
  const base = { companyName: 'Marca SpA', contactName: 'Luis Soto', email: 'luis@marca.cl', phone: '+56 9 8765 4321', message: 'Cosmética' };
  const { publicSponsorLeadSchema } = jest.requireActual('@/modules/crm/schema') as typeof import('@/modules/crm/schema');

  it('lo exige', () => {
    expect(publicSponsorLeadSchema.safeParse(base).success).toBe(false);
    expect(publicSponsorLeadSchema.safeParse({ ...base, instagram: '' }).success).toBe(false);
  });

  it('lo normaliza a @usuario y rechaza lo que no es un usuario', () => {
    const ok = publicSponsorLeadSchema.safeParse({ ...base, instagram: 'https://www.instagram.com/marca.cl/' });
    expect(ok.success && ok.data.instagram).toBe('@marca.cl');
    expect(publicSponsorLeadSchema.safeParse({ ...base, instagram: 'mi marca!!' }).success).toBe(false);
  });
});
