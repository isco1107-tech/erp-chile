/**
 * Micrositio de la academia: esquema, plantilla inicial, lista de «qué falta»,
 * validación de fotos por empresa y —lo más importante— que la lectura pública
 * se arme campo por campo y nunca entregue alumnas, RUT, contactos ni pagos.
 */

const mockPrisma = {
  academySite: { findFirst: jest.fn() },
  academyGroup: { findMany: jest.fn(), count: jest.fn() },
  academyStudent: { count: jest.fn() },
  companySettings: { findUnique: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import {
  academySiteInputSchema,
  academySiteReadiness,
  academySlugProblem,
  emptyAcademyContent,
  parseAcademyContent,
  publishBlockers,
  starterAcademyContent,
  type ReadinessInput,
} from '@/lib/academy/site';
import { getPublicAcademySite, imagesProblem } from '@/modules/academy/services/academy-site.service';

const BLOB = 'https://abc.public.blob.vercel-storage.com';
const own = (name: string) => `${BLOB}/academy-site/company-a/${name}.jpg`;

function ready(over: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    name: 'Academia CR',
    slug: 'academia-cr',
    heroImageUrl: own('hero'),
    whatsapp: '56912345678',
    contactEmail: null,
    instagramHandle: null,
    content: { ...emptyAcademyContent(), disciplines: [{ title: 'Pasarela', text: '' }] },
    hasEnrollmentLink: true,
    activeGroups: 1,
    ...over,
  };
}

describe('contenido del sitio', () => {
  it('un contenido vacío, viejo o dañado cae a valores vacíos en vez de romper', () => {
    expect(parseAcademyContent({})).toEqual(emptyAcademyContent());
    expect(parseAcademyContent(null)).toEqual(emptyAcademyContent());
    expect(parseAcademyContent({ steps: 'no es una lista' })).toEqual(emptyAcademyContent());
    expect(emptyAcademyContent().showGroups).toBe(true);
    expect(emptyAcademyContent().monthlyFee).toBeNull();
  });

  it('la plantilla trae las clases y la mensualidad de la academia, y valida', () => {
    const starter = starterAcademyContent();
    expect(starter.disciplines.map((d) => d.title)).toContain('Pasarela');
    expect(starter.monthlyFee).toBe(45000);
    expect(starter.disciplines.length).toBeLessThanOrEqual(16);
    expect(academySiteInputSchema.safeParse({ name: 'Academia CR', slug: 'academia-cr', content: starter }).success).toBe(true);
  });

  it('respeta los topes de cada lista', () => {
    const tooMany = { ...emptyAcademyContent(), gallery: Array.from({ length: 13 }, () => ({ url: own('x'), caption: '' })) };
    expect(academySiteInputSchema.safeParse({ name: 'Academia CR', slug: 'academia-cr', content: tooMany }).success).toBe(false);
  });
});

describe('dirección del sitio', () => {
  it('reserva "inscripcion" (es la ruta del formulario) y valida el formato', () => {
    expect(academySlugProblem('inscripcion')).not.toBeNull();
    expect(academySlugProblem('academia-cr')).toBeNull();
    expect(academySlugProblem('Academia CR')).not.toBeNull();
    expect(academySlugProblem('ab')).not.toBeNull();
  });

  it('normaliza el WhatsApp y acepta varios Instagram', () => {
    const parsed = academySiteInputSchema.parse({
      name: 'Academia CR',
      slug: 'Academia-CR',
      whatsapp: '+56 9 1234 5678',
      instagramHandle: '@cr.academia, @cr.producciones',
      content: {},
    });
    expect(parsed.slug).toBe('academia-cr');
    expect(parsed.whatsapp).toBe('56912345678');
    expect(parsed.instagramHandle).toBe('cr.academia,cr.producciones');
  });
});

describe('qué falta para publicar', () => {
  it('con lo imprescindible se puede publicar', () => {
    expect(publishBlockers(academySiteReadiness(ready()))).toEqual([]);
  });

  it.each([
    ['la portada', { heroImageUrl: null }],
    ['el contacto', { whatsapp: null }],
    ['las clases', { content: emptyAcademyContent() }],
    ['el nombre', { name: ' ' }],
  ])('sin %s no se puede publicar', (_label, over) => {
    expect(publishBlockers(academySiteReadiness(ready(over as Partial<ReadinessInput>))).length).toBeGreaterThan(0);
  });

  it('la historia, las fotos y el link de inscripción son solo recomendaciones', () => {
    const items = academySiteReadiness(ready({ hasEnrollmentLink: false }));
    expect(items.filter((i) => !i.done && i.blocking)).toEqual([]);
    expect(items.find((i) => i.id === 'enrollment')?.done).toBe(false);
    expect(items.find((i) => i.id === 'enrollment')?.blocking).toBe(false);
  });
});

describe('fotos', () => {
  const content = (url: string) => ({ ...emptyAcademyContent(), gallery: [{ url, caption: '' }] });

  it('acepta solo fotos de nuestro almacenamiento y de la carpeta de la empresa', () => {
    expect(imagesProblem('company-a', { heroImageUrl: own('hero'), content: content(own('g1')) })).toBeNull();
  });

  it('rechaza una foto de otra empresa, de otra carpeta o de otro host', () => {
    expect(imagesProblem('company-a', { heroImageUrl: `${BLOB}/academy-site/company-b/hero.jpg`, content: emptyAcademyContent() })).not.toBeNull();
    expect(imagesProblem('company-a', { heroImageUrl: null, content: content(`${BLOB}/pageant-covers/company-a/x.jpg`) })).not.toBeNull();
    expect(imagesProblem('company-a', { heroImageUrl: null, content: content('https://evil.example.com/academy-site/company-a/x.jpg') })).not.toBeNull();
    expect(imagesProblem('company-a', { heroImageUrl: 'http://169.254.169.254/latest', content: emptyAcademyContent() })).not.toBeNull();
  });
});

describe('lectura pública', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    companyId: 'company-a',
    slug: 'academia-cr',
    name: 'Academia CR',
    heroImageUrl: own('hero'),
    whatsapp: '56912345678',
    contactEmail: 'hola@cr.cl',
    instagramHandle: 'cr.academia,cr.producciones',
    address: 'Temuco',
    content: { ...starterAcademyContent(), tagline: 'Modelaje y multidisciplinas', showStudentCount: true },
    company: { businessName: 'CR Producciones SpA', status: 'ACTIVE', features: { hasAcademy: true } },
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.academySite.findFirst.mockResolvedValue(row());
    mockPrisma.academyGroup.findMany.mockResolvedValue([{ name: 'Modelaje juvenil', schedule: 'Sábados 10:00' }]);
    mockPrisma.academyStudent.count.mockResolvedValue(12);
    mockPrisma.companySettings.findUnique.mockResolvedValue({ academyEnrollmentToken: 'a'.repeat(64) });
  });

  it('arma el sitio con grupos, cuenta de alumnas, contacto y el link de inscripción', async () => {
    const site = await getPublicAcademySite('academia-cr');
    expect(site?.name).toBe('Academia CR');
    expect(site?.organizer).toBe('CR Producciones SpA');
    expect(site?.groups).toEqual([{ name: 'Modelaje juvenil', schedule: 'Sábados 10:00' }]);
    expect(site?.studentCount).toBe(12);
    expect(site?.monthlyFee).toBe(45000);
    expect(site?.contact.instagrams.map((i) => i.handle)).toEqual(['cr.academia', 'cr.producciones']);
    expect(site?.contact.whatsapp?.href).toBe('https://wa.me/56912345678');
    expect(site?.enrollmentHref).toBe(`/academia/inscripcion/${'a'.repeat(64)}`);
  });

  it('solo consulta sitios publicados y de la dirección pedida', async () => {
    await getPublicAcademySite('academia-cr');
    expect(mockPrisma.academySite.findFirst.mock.calls[0][0].where).toEqual({ slug: 'academia-cr', isPublished: true });
  });

  it('nunca pide alumnas, RUT ni pagos: consulta grupos solo por nombre y horario, y alumnas solo contadas', async () => {
    await getPublicAcademySite('academia-cr');
    expect(mockPrisma.academyGroup.findMany.mock.calls[0][0].select).toEqual({ name: true, schedule: true });
    expect(mockPrisma.academyGroup.findMany.mock.calls[0][0].where).toEqual({ companyId: 'company-a', isActive: true });
    expect(mockPrisma.academyStudent.count).toHaveBeenCalledWith({ where: { companyId: 'company-a', isActive: true } });
    // Ninguna clave de lo publicado puede ser un dato privado (el id de empresa tampoco sale).
    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value)) {
          keys.push(key);
          walk(inner);
        }
      }
    };
    walk(await getPublicAcademySite('academia-cr'));
    expect(keys.filter((key) => key !== 'studentCount' && /rut|companyId|student|payment|guardian|birth|emergency|token/i.test(key))).toEqual([]);
  });

  it('no consulta grupos ni alumnas si el sitio no los muestra', async () => {
    mockPrisma.academySite.findFirst.mockResolvedValue(row({ content: { ...emptyAcademyContent(), showGroups: false, showStudentCount: false } }));
    const site = await getPublicAcademySite('academia-cr');
    expect(site?.groups).toEqual([]);
    expect(site?.studentCount).toBeNull();
    expect(mockPrisma.academyGroup.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.academyStudent.count).not.toHaveBeenCalled();
  });

  it('sin alumnas activas no publica "0 alumnas", y sin link generado no inventa uno', async () => {
    mockPrisma.academyStudent.count.mockResolvedValue(0);
    mockPrisma.companySettings.findUnique.mockResolvedValue(null);
    const site = await getPublicAcademySite('academia-cr');
    expect(site?.studentCount).toBeNull();
    expect(site?.enrollmentHref).toBeNull();
  });

  it.each([
    ['empresa suspendida', { company: { businessName: 'X', status: 'SUSPENDED', features: { hasAcademy: true } } }],
    ['empresa sin el módulo', { company: { businessName: 'X', status: 'ACTIVE', features: { hasAcademy: false } } }],
    ['empresa sin features', { company: { businessName: 'X', status: 'ACTIVE', features: null } }],
  ])('%s: el sitio no existe para el público', async (_label, over) => {
    mockPrisma.academySite.findFirst.mockResolvedValue(row(over));
    expect(await getPublicAcademySite('academia-cr')).toBeNull();
  });

  it('un sitio no publicado o una dirección inválida no existen', async () => {
    mockPrisma.academySite.findFirst.mockResolvedValue(null);
    expect(await getPublicAcademySite('academia-cr')).toBeNull();
    expect(await getPublicAcademySite('../etc/passwd')).toBeNull();
    expect(await getPublicAcademySite('Academia CR')).toBeNull();
  });

  it('omite secciones vacías: sin dirección no hay bloque de directora', async () => {
    const site = await getPublicAcademySite('academia-cr');
    expect(site?.director).toBeNull();
    expect(site?.gallery).toEqual([]);
    expect(site?.faq).toEqual([]);
  });
});
