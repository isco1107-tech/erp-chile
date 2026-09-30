/**
 * Salón de la fama del micrositio (ganadoras de ediciones anteriores).
 *
 * Reglas que estos tests protegen:
 *  - validación: nombre obligatorio, título por defecto "Ganadora", año real, foto con URL;
 *  - multi-tenant: toda consulta lleva `companyId` (y `projectId`); una empresa no toca
 *    ni asocia a un certamen ajeno, y no puede usar una foto subida por otra empresa;
 *  - lo público sale campo por campo: solo nombre, título, año, nota y foto.
 *
 * Prisma: se espía el cliente real; cualquier consulta sin simular lanza.
 */

jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/storage/blob', () => ({ del: jest.fn() }));
jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));
jest.mock('@/lib/email/mailer', () => ({ getAppUrl: () => 'https://app.test' }));
jest.mock('@/lib/security/blob-url', () => ({ ...jest.requireActual('@/lib/security/blob-url'), isAllowedBlobUrl: jest.fn(() => true) }));
jest.mock('@/lib/auth/guards', () => {
  const actual = jest.requireActual('@/lib/auth/guards');
  return { ...actual, requireAuthWithPermission: jest.fn() };
});

import { revalidatePath } from 'next/cache';
import { del } from '@/lib/storage/blob';
import { captureException } from '@/lib/observability';
import { AuthError, requireAuthWithPermission } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { MAX_PAST_WINNERS, pastWinnerSchema } from '@/modules/projects/schema';
import * as actions from '@/modules/projects/actions/past-winners.actions';
import * as service from '@/modules/projects/services/past-winners.service';
import { getPublicPageantSite } from '@/modules/projects/services/public-site.service';

type Delegate = Record<string, (...args: unknown[]) => unknown>;
const delegateOf = (model: string) => (prisma as unknown as Record<string, Delegate>)[model]!;

function spy(model: string, method: string): jest.Mock {
  return jest.spyOn(delegateOf(model), method).mockImplementation(() => {
    throw new Error(`Consulta no prevista: ${model}.${method}`);
  }) as unknown as jest.Mock;
}

const COMPANY = 'co_1';
const PROJECT = 'pr_1';
const OWN_PHOTO = `https://x.public.blob.vercel-storage.com/pageant-winners/${COMPANY}/${PROJECT}-1-abc.jpg`;
const OTHER_COMPANY_PHOTO = `https://x.public.blob.vercel-storage.com/pageant-winners/co_2/${PROJECT}-1-abc.jpg`;
const COVER_PHOTO = `https://x.public.blob.vercel-storage.com/pageant-covers/${COMPANY}/${PROJECT}-1.jpg`;

let db: { pwFindFirst: jest.Mock; pwFindMany: jest.Mock; pwCreate: jest.Mock; pwCount: jest.Mock; pwUpdateMany: jest.Mock; pwDeleteMany: jest.Mock; projFindFirst: jest.Mock; projFindUnique: jest.Mock };

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  db = {
    pwFindFirst: spy('pastWinner', 'findFirst'),
    pwFindMany: spy('pastWinner', 'findMany'),
    pwCreate: spy('pastWinner', 'create'),
    pwCount: spy('pastWinner', 'count'),
    pwUpdateMany: spy('pastWinner', 'updateMany'),
    pwDeleteMany: spy('pastWinner', 'deleteMany'),
    projFindFirst: spy('project', 'findFirst'),
    projFindUnique: spy('project', 'findUnique'),
  };
  (requireAuthWithPermission as jest.Mock).mockResolvedValue({ id: 'u1', email: 'a@b.cl', companyId: COMPANY });
});

describe('pastWinnerSchema', () => {
  const valid = { name: '  Camila Rojas ', title: 'Virreina', year: 2024, note: 'Representó a Temuco', photoUrl: OWN_PHOTO };

  it('acepta una ganadora completa y limpia los espacios', () => {
    const parsed = pastWinnerSchema.parse(valid);
    expect(parsed).toMatchObject({ name: 'Camila Rojas', title: 'Virreina', year: 2024, note: 'Representó a Temuco' });
  });

  it('el título vacío queda como "Ganadora"; el año y la nota son opcionales', () => {
    const parsed = pastWinnerSchema.parse({ name: 'Ana', title: '   ', year: null, note: '', photoUrl: OWN_PHOTO });
    expect(parsed.title).toBe('Ganadora');
    expect(parsed.year).toBeNull();
    expect(parsed.note).toBeNull();
    expect(parsed.featured).toBe(false);
  });

  it('la marca "reciente" se conserva y por defecto está apagada', () => {
    expect(pastWinnerSchema.parse({ ...valid, featured: true }).featured).toBe(true);
    expect(pastWinnerSchema.parse(valid).featured).toBe(false);
    expect(pastWinnerSchema.safeParse({ ...valid, featured: 'si' }).success).toBe(false);
  });

  it('rechaza nombre vacío, año imposible y foto que no es URL', () => {
    expect(pastWinnerSchema.safeParse({ ...valid, name: '  ' }).success).toBe(false);
    expect(pastWinnerSchema.safeParse({ ...valid, year: 1899 }).success).toBe(false);
    expect(pastWinnerSchema.safeParse({ ...valid, year: new Date().getFullYear() + 5 }).success).toBe(false);
    expect(pastWinnerSchema.safeParse({ ...valid, year: 2024.5 }).success).toBe(false);
    expect(pastWinnerSchema.safeParse({ ...valid, photoUrl: 'no-es-url' }).success).toBe(false);
  });

  it('respeta los máximos de largo (el pie de foto se muestra tal cual)', () => {
    expect(pastWinnerSchema.safeParse({ ...valid, name: 'x'.repeat(121) }).success).toBe(false);
    expect(pastWinnerSchema.safeParse({ ...valid, title: 'x'.repeat(61) }).success).toBe(false);
    expect(pastWinnerSchema.safeParse({ ...valid, note: 'x'.repeat(161) }).success).toBe(false);
  });
});

describe('servicio', () => {
  const input = pastWinnerSchema.parse({ name: 'Camila', title: 'Ganadora', year: 2025, photoUrl: OWN_PHOTO });

  it('lista solo lo de la empresa y el certamen, la edición más reciente primero', async () => {
    db.pwFindMany.mockResolvedValue([]);
    await service.listPastWinners(COMPANY, PROJECT);
    expect(db.pwFindMany.mock.calls[0]![0]).toEqual({
      where: { companyId: COMPANY, projectId: PROJECT },
      orderBy: [{ year: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
  });

  it('no crea en un certamen de otra empresa', async () => {
    db.projFindFirst.mockResolvedValue(null);
    await expect(service.createPastWinner(COMPANY, 'pr_ajeno', input)).rejects.toThrow('Certamen no encontrado');
    expect(db.projFindFirst.mock.calls[0]![0].where).toEqual({ id: 'pr_ajeno', companyId: COMPANY });
    expect(db.pwCreate).not.toHaveBeenCalled();
  });

  it('crea con el companyId de la sesión, nunca del cuerpo', async () => {
    db.projFindFirst.mockResolvedValue({ id: PROJECT });
    db.pwCount.mockResolvedValue(0);
    db.pwCreate.mockResolvedValue({ id: 'w1' });
    await service.createPastWinner(COMPANY, PROJECT, input);
    expect(db.pwCreate.mock.calls[0]![0].data).toMatchObject({ companyId: COMPANY, projectId: PROJECT, name: 'Camila', year: 2025 });
  });

  it('respeta el máximo de fotos por certamen', async () => {
    db.projFindFirst.mockResolvedValue({ id: PROJECT });
    db.pwCount.mockResolvedValue(MAX_PAST_WINNERS);
    await expect(service.createPastWinner(COMPANY, PROJECT, input)).rejects.toThrow(String(MAX_PAST_WINNERS));
    expect(db.pwCreate).not.toHaveBeenCalled();
  });

  it('editar y borrar filtran por empresa y certamen; un id ajeno no encuentra nada', async () => {
    db.pwFindFirst.mockResolvedValue(null);
    await expect(service.updatePastWinner(COMPANY, PROJECT, 'w_ajena', input)).rejects.toThrow('Ganadora no encontrada');
    await expect(service.deletePastWinner(COMPANY, PROJECT, 'w_ajena')).rejects.toThrow('Ganadora no encontrada');
    expect(db.pwFindFirst.mock.calls[0]![0].where).toEqual({ id: 'w_ajena', companyId: COMPANY, projectId: PROJECT });
    expect(db.pwUpdateMany).not.toHaveBeenCalled();
    expect(db.pwDeleteMany).not.toHaveBeenCalled();
  });

  it('al escribir vuelve a filtrar por empresa y certamen (nunca solo por id)', async () => {
    db.pwFindFirst.mockResolvedValue({ photoUrl: OWN_PHOTO });
    db.pwUpdateMany.mockResolvedValue({ count: 1 });
    db.pwDeleteMany.mockResolvedValue({ count: 1 });
    await service.updatePastWinner(COMPANY, PROJECT, 'w1', input);
    await service.deletePastWinner(COMPANY, PROJECT, 'w1');
    expect(db.pwUpdateMany.mock.calls[0]![0].where).toEqual({ id: 'w1', companyId: COMPANY, projectId: PROJECT });
    expect(db.pwDeleteMany.mock.calls[0]![0].where).toEqual({ id: 'w1', companyId: COMPANY, projectId: PROJECT });
  });

  it('informa la foto reemplazada solo si cambió', async () => {
    db.pwFindFirst.mockResolvedValue({ photoUrl: COVER_PHOTO });
    db.pwUpdateMany.mockResolvedValue({ count: 1 });
    expect(await service.updatePastWinner(COMPANY, PROJECT, 'w1', input)).toEqual({ replacedPhotoUrl: COVER_PHOTO });
    db.pwFindFirst.mockResolvedValue({ photoUrl: OWN_PHOTO });
    expect(await service.updatePastWinner(COMPANY, PROJECT, 'w1', input)).toEqual({ replacedPhotoUrl: null });
  });
});

describe('acciones', () => {
  const body = { name: 'Camila', title: 'Ganadora', year: 2025, note: '', photoUrl: OWN_PHOTO };

  it('exigen el permiso de escritura de proyectos', async () => {
    db.projFindFirst.mockResolvedValue({ id: PROJECT, publicSlug: 'mi-sitio' });
    db.pwCount.mockResolvedValue(0);
    db.pwCreate.mockResolvedValue({ id: 'w1', name: 'Camila', year: 2025 });
    await actions.createPastWinnerAction(PROJECT, body);
    expect(requireAuthWithPermission).toHaveBeenCalledWith('projects:write');
  });

  it('sin permiso no toca la base de datos', async () => {
    (requireAuthWithPermission as jest.Mock).mockRejectedValue(new AuthError('No tienes permiso', 403));
    const result = await actions.createPastWinnerAction(PROJECT, body);
    expect(result.success).toBe(false);
    expect(db.pwCreate).not.toHaveBeenCalled();
    expect(db.projFindFirst).not.toHaveBeenCalled();
  });

  it('solo acepta fotos subidas por esta empresa desde el panel', async () => {
    for (const photoUrl of [OTHER_COMPANY_PHOTO, COVER_PHOTO, 'https://evil.example/foto.jpg']) {
      const result = await actions.createPastWinnerAction(PROJECT, { ...body, photoUrl });
      expect(result.success).toBe(false);
    }
    expect(db.pwCreate).not.toHaveBeenCalled();
    const edit = await actions.updatePastWinnerAction(PROJECT, 'w1', { ...body, photoUrl: OTHER_COMPANY_PHOTO });
    expect(edit.success).toBe(false);
    expect(db.pwUpdateMany).not.toHaveBeenCalled();
  });

  it('al quitar una ganadora borra su foto del almacenamiento; si el borrado falla, igual queda quitada', async () => {
    db.pwFindFirst.mockResolvedValue({ photoUrl: OWN_PHOTO });
    db.pwDeleteMany.mockResolvedValue({ count: 1 });
    db.projFindFirst.mockResolvedValue({ id: PROJECT, publicSlug: null });
    expect((await actions.deletePastWinnerAction(PROJECT, 'w1')).success).toBe(true);
    expect(del).toHaveBeenCalledWith(OWN_PHOTO);

    (del as jest.Mock).mockRejectedValueOnce(new Error('storage caído'));
    const result = await actions.deletePastWinnerAction(PROJECT, 'w1');
    expect(result.success).toBe(true);
    expect(captureException).toHaveBeenCalled();
  });

  it('al cambiar la foto borra la anterior', async () => {
    db.pwFindFirst.mockResolvedValue({ photoUrl: COVER_PHOTO });
    db.pwUpdateMany.mockResolvedValue({ count: 1 });
    db.projFindFirst.mockResolvedValue({ id: PROJECT, publicSlug: null });
    const result = await actions.updatePastWinnerAction(PROJECT, 'w1', body);
    expect(result.success).toBe(true);
    expect(del).toHaveBeenCalledWith(COVER_PHOTO);
  });

  it('al guardar refresca el sitio público del certamen', async () => {
    db.projFindFirst.mockResolvedValue({ id: PROJECT, publicSlug: 'mi-sitio' });
    db.pwCount.mockResolvedValue(0);
    db.pwCreate.mockResolvedValue({ id: 'w1', name: 'Camila', year: 2025 });
    const result = await actions.createPastWinnerAction(PROJECT, body);
    expect(result.success).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith('/certamen/mi-sitio');
  });
});

describe('sitio público', () => {
  it('publica la galería campo por campo (nada más que lo que se ve en pantalla)', async () => {
    db.projFindUnique.mockResolvedValue({
      id: PROJECT,
      companyId: COMPANY,
      name: 'Miss Sur 2026',
      publicSiteEnabled: true,
      publicAccent: 'gold',
      company: { businessName: 'Aurora SpA', status: 'ACTIVE', features: { hasEventProjects: true } },
    });
    db.pwFindMany.mockResolvedValue([{ id: 'w1', name: 'Camila', title: 'Ganadora', year: 2025, note: null, photoUrl: OWN_PHOTO, featured: true }]);
    const site = await getPublicPageantSite('miss-sur');
    expect(site?.pastWinners).toEqual([{ id: 'w1', name: 'Camila', title: 'Ganadora', year: 2025, note: null, photoUrl: OWN_PHOTO, featured: true }]);
    const query = db.pwFindMany.mock.calls[0]![0];
    expect(query.where).toEqual({ companyId: COMPANY, projectId: PROJECT });
    expect(Object.keys(query.select).sort()).toEqual(['featured', 'id', 'name', 'note', 'photoUrl', 'title', 'year']);
  });
});
