import { sniffImageType } from '@/lib/security/file-signature';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';

/**
 * Módulo de postulaciones públicas de candidatas (certamen de belleza):
 * cobertura de las piezas de seguridad que protegen el único endpoint de
 * este ERP que acepta datos de internet sin sesión.
 */

describe('sniffImageType — detección de imagen por magic bytes', () => {
  it('reconoce un JPEG por su firma FF D8 FF, sin importar el resto de bytes', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    expect(sniffImageType(bytes)).toBe('image/jpeg');
  });

  it('reconoce un PNG por su firma de 8 bytes', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    expect(sniffImageType(bytes)).toBe('image/png');
  });

  it('devuelve null para un archivo que no es ni JPEG ni PNG (ej. un PDF disfrazado)', () => {
    const pdfMagic = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
    expect(sniffImageType(pdfMagic)).toBeNull();
  });

  it('devuelve null para un archivo vacío', () => {
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
  });

  it('devuelve null cuando hay menos bytes que la firma completa, en vez de lanzar', () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
  });

  it('no se deja engañar por un GIF con extensión .jpg falsificada', () => {
    const gifMagic = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
    expect(sniffImageType(gifMagic)).toBeNull();
  });

  it('exige que los primeros bytes coincidan exactamente (un byte corrido no cuenta)', () => {
    // Firma JPEG desplazada un byte — no debe reconocerse como JPEG.
    const bytes = new Uint8Array([0x00, 0xff, 0xd8, 0xff]);
    expect(sniffImageType(bytes)).toBeNull();
  });
});

describe('isAllowedBlobUrl — allowlist contra SSRF en URLs de archivo', () => {
  it('acepta una URL real de Vercel Blob (subdominio .public.blob.vercel-storage.com)', () => {
    expect(isAllowedBlobUrl('https://abc123xyz.public.blob.vercel-storage.com/candidatas/foto-rostro.jpg')).toBe(true);
  });

  it('rechaza http:// aunque el resto del dominio sea válido', () => {
    expect(isAllowedBlobUrl('http://abc123xyz.public.blob.vercel-storage.com/foto.jpg')).toBe(false);
  });

  it('rechaza un intento de SSRF hacia metadata interna (IP de enlace local)', () => {
    expect(isAllowedBlobUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isAllowedBlobUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
  });

  it('rechaza un dominio que solo imita el sufijo permitido dentro de la ruta o como subdominio de otro host', () => {
    expect(isAllowedBlobUrl('https://evil.com/public.blob.vercel-storage.com/x')).toBe(false);
    expect(isAllowedBlobUrl('https://abc.public.blob.vercel-storage.com.evil.com/x')).toBe(false);
  });

  it('rechaza otros dominios de storage legítimos pero no autorizados', () => {
    expect(isAllowedBlobUrl('https://mi-bucket.s3.amazonaws.com/foto.jpg')).toBe(false);
    expect(isAllowedBlobUrl('https://drive.google.com/file/d/xyz')).toBe(false);
  });

  it('rechaza strings que no son URLs válidas en vez de lanzar una excepción', () => {
    expect(isAllowedBlobUrl('no-es-una-url')).toBe(false);
    expect(isAllowedBlobUrl('')).toBe(false);
    expect(isAllowedBlobUrl('javascript:alert(1)')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RBAC de campos sensibles: `redactSensitiveFields` (no exportada — el
// archivo que la contiene es `'use server'`, así que no puede exportar una
// función síncrona sin romper la convención de Next.js de que un módulo
// `'use server'` solo exporte Server Actions asíncronas). Se prueba en su
// lugar a través de las Server Actions que la usan, con la sesión y el
// servicio de datos mockeados.
//
// Se usa `jest.doMock` + `require()` síncrono (en vez de `jest.mock` +
// `import` estático) a propósito: así el orden de mockeo es explícito línea
// por línea y no depende de que el transformador hoistee `jest.mock` por
// encima de los imports (comportamiento de babel-jest que ts-jest no
// garantiza igual).
// ---------------------------------------------------------------------------

type CandidatesServiceModule = typeof import('../src/modules/candidates/services/candidates.service');
type CandidatesActionsModule = typeof import('../src/modules/candidates/actions/candidates.actions');

describe('Redacción de campos sensibles en las Server Actions de candidatas', () => {
  const SESSION = { id: 'user-1', companyId: 'company-1', email: 'staff@empresa.cl', role: 'ADMIN' };

  const FULL_CANDIDATE = {
    id: 'cand-1',
    companyId: 'company-1',
    projectId: 'proj-1',
    rut: '12.345.678-5',
    rutClean: '123456785',
    fullName: 'Candidata de Prueba',
    email: 'candidata@correo.cl',
    phone: '+56911112222',
    direccion: 'Calle Falsa 123, Temuco',
    instagram: '@candidata',
    guardianName: 'Madre de Prueba',
    guardianRut: '11.111.111-1',
    emergencyContactName: 'Contacto Emergencia',
    emergencyContactPhone: '+56933334444',
    ipOrigen: '190.12.34.56',
    userAgent: 'Mozilla/5.0',
    photoUrl: 'https://x.public.blob.vercel-storage.com/foto.jpg',
    employerName: 'Empresa Empleadora SpA',
    employerRut: '76.543.210-9',
    employerAddress: 'Av. Alemania 456, Temuco',
    status: 'APPLICANT',
    project: { id: 'proj-1', name: 'Miss Test 2027', code: 'MT' },
  } as unknown as import('../src/modules/candidates/services/candidates.service').CandidateWithProject;

  const SENSITIVE_FIELDS = [
    'rut',
    'email',
    'phone',
    'direccion',
    'instagram',
    'guardianName',
    'guardianRut',
    'emergencyContactName',
    'emergencyContactPhone',
    'ipOrigen',
    'userAgent',
    'photoUrl',
    'employerName',
    'employerRut',
    'employerAddress',
  ] as const;

  let mockRequireAuthWithPermission: jest.Mock;
  let mockCan: jest.Mock;
  let candidatesService: CandidatesServiceModule;
  let listCandidatesAction: CandidatesActionsModule['listCandidatesAction'];
  let getCandidateAction: CandidatesActionsModule['getCandidateAction'];
  let createCandidateAction: CandidatesActionsModule['createCandidateAction'];

  beforeEach(() => {
    jest.resetModules();

    mockRequireAuthWithPermission = jest.fn().mockResolvedValue(SESSION);
    mockCan = jest.fn();

    jest.doMock('next/cache', () => ({ revalidatePath: jest.fn() }));
    jest.doMock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
    jest.doMock('@/lib/auth/guards', () => ({
      requireAuthWithPermission: (...args: unknown[]) => mockRequireAuthWithPermission(...args),
      can: (...args: unknown[]) => mockCan(...args),
      authErrorMessage: () => null,
    }));
    jest.doMock('../src/modules/candidates/services/candidates.service', () => ({
      listCandidates: jest.fn(),
      getCandidate: jest.fn(),
      createCandidate: jest.fn(),
    }));

    // Se requieren DESPUÉS de registrar los mocks de arriba, en el mismo
    // orden síncrono — así no hay ambigüedad sobre qué versión del módulo
    // (real o mockeada) queda cacheada quando `candidates.actions.ts` hace
    // sus propios `require()` internos de esas mismas rutas.
    candidatesService = require('../src/modules/candidates/services/candidates.service');
    const actions: CandidatesActionsModule = require('../src/modules/candidates/actions/candidates.actions');
    listCandidatesAction = actions.listCandidatesAction;
    getCandidateAction = actions.getCandidateAction;
    createCandidateAction = actions.createCandidateAction;
  });

  afterEach(() => {
    jest.dontMock('next/cache');
    jest.dontMock('@/lib/auth/audit');
    jest.dontMock('@/lib/auth/guards');
    jest.dontMock('../src/modules/candidates/services/candidates.service');
  });

  it('getCandidateAction enmascara todos los campos sensibles sin el permiso candidates:sensitive', async () => {
    mockCan.mockReturnValue(false);
    jest.mocked(candidatesService.getCandidate).mockResolvedValue(FULL_CANDIDATE);

    const result = await getCandidateAction('cand-1');

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.data.rut).toBe('••••••••');
    for (const field of SENSITIVE_FIELDS) {
      if (field === 'rut') continue;
      expect((result.data as unknown as Record<string, unknown>)[field]).toBeNull();
    }
    // Los campos no sensibles se conservan intactos.
    expect(result.data.fullName).toBe('Candidata de Prueba');
    expect(result.data.status).toBe('APPLICANT');
  });

  it('getCandidateAction deja todos los campos intactos con candidates:sensitive', async () => {
    mockCan.mockReturnValue(true);
    jest.mocked(candidatesService.getCandidate).mockResolvedValue(FULL_CANDIDATE);

    const result = await getCandidateAction('cand-1');

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.data.rut).toBe('12.345.678-5');
    expect(result.data.email).toBe('candidata@correo.cl');
    expect(result.data.photoUrl).toBe('https://x.public.blob.vercel-storage.com/foto.jpg');
    expect(result.data.employerName).toBe('Empresa Empleadora SpA');
    expect(result.data.employerRut).toBe('76.543.210-9');
  });

  it('listCandidatesAction redacta cada elemento del listado, no solo el primero', async () => {
    mockCan.mockReturnValue(false);
    const second = { ...FULL_CANDIDATE, id: 'cand-2', email: 'otra@correo.cl' };
    jest.mocked(candidatesService.listCandidates).mockResolvedValue({
      items: [FULL_CANDIDATE, second],
      total: 2,
      page: 1,
      pageSize: 25,
    });

    const result = await listCandidatesAction({});

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.data.items).toHaveLength(2);
    expect(result.data.items[0]?.email).toBeNull();
    expect(result.data.items[1]?.email).toBeNull();
  });

  it('createCandidateAction también redacta la ficha recién creada en la respuesta', async () => {
    mockCan.mockReturnValue(false);
    jest.mocked(candidatesService.createCandidate).mockResolvedValue(FULL_CANDIDATE);

    const result = await createCandidateAction({
      projectId: 'proj-1',
      rut: '12.345.678-5',
      fullName: 'Candidata de Prueba',
      birthDate: '2000-01-01',
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.data.rut).toBe('••••••••');
    expect(result.data.guardianRut).toBeNull();
  });
});
