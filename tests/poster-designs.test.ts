/**
 * Diseños de afiche guardados (estudio de afiches del certamen).
 *
 * Reglas que estos tests protegen:
 *  - permisos: listar con `projects:read`; guardar y borrar con `projects:write`;
 *  - multi-tenant: toda consulta lleva `companyId` y `projectId` de la sesión; no se
 *    escribe en un certamen ajeno ni se usa una imagen subida por otra empresa;
 *  - validación: nombre y personalización pasan por el esquema al guardar y al leer
 *    (un registro alterado en la base no llega al renderizador).
 *
 * Prisma: se espía el cliente real; cualquier consulta sin simular lanza.
 */

jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));
jest.mock('@/lib/email/mailer', () => ({ getAppUrl: () => 'https://app.test' }));
jest.mock('@/lib/security/blob-url', () => ({ ...jest.requireActual('@/lib/security/blob-url'), isAllowedBlobUrl: jest.fn(() => true) }));
jest.mock('@/lib/auth/guards', () => ({ ...jest.requireActual('@/lib/auth/guards'), requireAuthWithPermission: jest.fn() }));

import { createAuditLog } from '@/lib/auth/audit';
import { AuthError, requireAuthWithPermission } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { EMPTY_OVERRIDES, MAX_POSTER_DESIGNS } from '@/lib/posters/overrides';
import * as actions from '@/modules/projects/actions/poster-designs.actions';
import { posterImagesProblem } from '@/modules/projects/services/poster.service';

type Delegate = Record<string, (...args: unknown[]) => unknown>;
const delegateOf = (model: string) => (prisma as unknown as Record<string, Delegate>)[model]!;
function spy(model: string, method: string): jest.Mock {
  return jest.spyOn(delegateOf(model), method).mockImplementation(() => {
    throw new Error(`Consulta no prevista: ${model}.${method}`);
  }) as unknown as jest.Mock;
}

const COMPANY = 'co_1';
const PROJECT = 'pr_1';
const OWN_LOGO = `https://x.public.blob.vercel-storage.com/pageant-posters/${COMPANY}/${PROJECT}-1-abc.png`;
const OTHER_LOGO = `https://x.public.blob.vercel-storage.com/pageant-posters/co_2/${PROJECT}-1-abc.png`;
const COVER = `https://x.public.blob.vercel-storage.com/pageant-covers/${COMPANY}/${PROJECT}-1.jpg`;

const VALID = { name: '  Casting   sábado ', piece: 'convocatoria', style: 'gala', format: 'feed', overrides: { texts: { eyebrow: 'Último llamado' }, logoUrl: OWN_LOGO } };
const ROW = { id: 'd1', name: 'Casting sábado', piece: 'convocatoria', style: 'gala', format: 'feed', accent: null, candidateId: null, qr: null, overrides: { texts: { eyebrow: 'Último llamado' }, hidden: [], sponsorLogos: [], titleScale: 1, logoUrl: OWN_LOGO }, updatedAt: new Date('2026-10-01T12:00:00Z') };

let db: Record<'find' | 'findFirst' | 'create' | 'count' | 'updateMany' | 'deleteMany' | 'project', jest.Mock>;
const auth = requireAuthWithPermission as jest.Mock;

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  db = {
    find: spy('posterDesign', 'findMany'),
    findFirst: spy('posterDesign', 'findFirst'),
    create: spy('posterDesign', 'create'),
    count: spy('posterDesign', 'count'),
    updateMany: spy('posterDesign', 'updateMany'),
    deleteMany: spy('posterDesign', 'deleteMany'),
    project: spy('project', 'findFirst'),
  };
  auth.mockResolvedValue({ id: 'u1', email: 'a@b.cl', companyId: COMPANY });
});

describe('posterImagesProblem', () => {
  it('acepta solo imágenes subidas por la propia empresa desde el estudio', () => {
    expect(posterImagesProblem(COMPANY, { ...EMPTY_OVERRIDES, logoUrl: OWN_LOGO, sponsorLogos: [OWN_LOGO] })).toBeNull();
    expect(posterImagesProblem(COMPANY, { ...EMPTY_OVERRIDES, logoUrl: OTHER_LOGO })).not.toBeNull();
    expect(posterImagesProblem(COMPANY, { ...EMPTY_OVERRIDES, sponsorLogos: [OWN_LOGO, COVER] })).not.toBeNull();
  });
});

describe('listPosterDesignsAction', () => {
  it('lista los de este certamen y empresa, con projects:read', async () => {
    db.find.mockResolvedValue([ROW]);
    const result = await actions.listPosterDesignsAction(PROJECT);
    expect(auth).toHaveBeenCalledWith('projects:read');
    expect(db.find.mock.calls[0]![0].where).toEqual({ companyId: COMPANY, projectId: PROJECT });
    expect(result.success && result.data).toEqual([{ id: 'd1', name: 'Casting sábado', updatedAt: '2026-10-01T12:00:00.000Z', request: expect.objectContaining({ piece: 'convocatoria', overrides: expect.objectContaining({ logoUrl: OWN_LOGO }) }) }]);
  });

  it('un registro alterado que ya no cumple las reglas se descarta, no llega al estudio', async () => {
    db.find.mockResolvedValue([ROW, { ...ROW, id: 'd2', piece: 'inventada' }, { ...ROW, id: 'd3', overrides: { texts: { headline: 'x'.repeat(500) } } }]);
    const result = await actions.listPosterDesignsAction(PROJECT);
    expect(result.success && result.data.map((d) => d.id)).toEqual(['d1']);
  });
});

describe('savePosterDesignAction', () => {
  it('crea con projects:write, en el certamen de la empresa, y audita', async () => {
    db.project.mockResolvedValue({ id: PROJECT });
    db.count.mockResolvedValue(3);
    db.create.mockResolvedValue(ROW);
    const result = await actions.savePosterDesignAction(PROJECT, VALID, null);
    expect(auth).toHaveBeenCalledWith('projects:write');
    expect(result.success).toBe(true);
    expect(db.project.mock.calls[0]![0].where).toEqual({ id: PROJECT, companyId: COMPANY });
    const data = db.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ companyId: COMPANY, projectId: PROJECT, createdById: 'u1', name: 'Casting sábado', piece: 'convocatoria' });
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entity: 'PosterDesign', companyId: COMPANY }));
  });

  it('actualiza solo un diseño de este certamen y empresa', async () => {
    db.updateMany.mockResolvedValue({ count: 1 });
    db.findFirst.mockResolvedValue(ROW);
    const result = await actions.savePosterDesignAction(PROJECT, VALID, 'd1');
    expect(result.success).toBe(true);
    expect(db.updateMany.mock.calls[0]![0].where).toEqual({ id: 'd1', companyId: COMPANY, projectId: PROJECT });
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE' }));
  });

  it('un diseño ajeno no se toca', async () => {
    db.updateMany.mockResolvedValue({ count: 0 });
    expect(await actions.savePosterDesignAction(PROJECT, VALID, 'ajeno')).toEqual({ success: false, error: 'Diseño no encontrado' });
  });

  it('un certamen ajeno no recibe diseños', async () => {
    db.project.mockResolvedValue(null);
    expect(await actions.savePosterDesignAction('otro', VALID, null)).toEqual({ success: false, error: 'Certamen no encontrado' });
    expect(db.create).not.toHaveBeenCalled();
  });

  it('rechaza imágenes de otra empresa antes de escribir', async () => {
    const result = await actions.savePosterDesignAction(PROJECT, { ...VALID, overrides: { logoUrl: OTHER_LOGO } }, null);
    expect(result).toEqual({ success: false, error: 'Las imágenes del afiche deben subirse desde el estudio de afiches' });
    expect(db.project).not.toHaveBeenCalled();
  });

  it('valida nombre y personalización', async () => {
    expect(await actions.savePosterDesignAction(PROJECT, { ...VALID, name: '   ' }, null)).toEqual({ success: false, error: 'Ponle un nombre al diseño' });
    expect((await actions.savePosterDesignAction(PROJECT, { ...VALID, piece: 'inventada' }, null)).success).toBe(false);
  });

  it(`tope de ${MAX_POSTER_DESIGNS} diseños por certamen`, async () => {
    db.project.mockResolvedValue({ id: PROJECT });
    db.count.mockResolvedValue(MAX_POSTER_DESIGNS);
    const result = await actions.savePosterDesignAction(PROJECT, VALID, null);
    expect(result.success).toBe(false);
    expect(db.create).not.toHaveBeenCalled();
  });

  it('sin permiso de escritura, el mensaje de auth', async () => {
    auth.mockRejectedValue(new AuthError('No tienes permiso', 403));
    expect(await actions.savePosterDesignAction(PROJECT, VALID, null)).toEqual({ success: false, error: 'No tienes permiso' });
  });
});

describe('deletePosterDesignAction', () => {
  it('borra solo uno de este certamen y empresa, y audita', async () => {
    db.deleteMany.mockResolvedValue({ count: 1 });
    const result = await actions.deletePosterDesignAction(PROJECT, 'd1');
    expect(result.success).toBe(true);
    expect(auth).toHaveBeenCalledWith('projects:write');
    expect(db.deleteMany.mock.calls[0]![0].where).toEqual({ id: 'd1', companyId: COMPANY, projectId: PROJECT });
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE', entity: 'PosterDesign' }));
  });

  it('uno ajeno: no encontrado', async () => {
    db.deleteMany.mockResolvedValue({ count: 0 });
    expect(await actions.deletePosterDesignAction(PROJECT, 'ajeno')).toEqual({ success: false, error: 'Diseño no encontrado' });
  });
});
