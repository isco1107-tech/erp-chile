import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  candidateSelfRegistrationSchema,
  candidateStatusChangeSchema,
  candidateCreateSchema,
  ARAUCANIA_COMUNAS,
  type CandidateSelfRegistrationInput,
} from '@/modules/candidates/schema';
import {
  submitCandidateRegistration,
  updateCandidate,
  updateCandidateStatus,
  listCandidates,
  RegistrationNotFoundError,
  RegistrationNotOpenError,
  RegistrationFullError,
  BelowMinimumAgeError,
  DuplicateApplicationError,
} from '@/modules/candidates/services/candidates.service';

/**
 * Módulo de postulaciones públicas de candidatas (certamen de belleza):
 * cobertura de la lógica de negocio con más riesgo — el contrato de
 * validación del formulario público y las reglas de la auto-inscripción
 * (ventana de convocatoria, folio atómico, RUT duplicado, edad mínima, y el
 * guard de "motivo obligatorio al descartar").
 */

// ---------------------------------------------------------------------------
// candidateSelfRegistrationSchema — contrato del formulario público
// ---------------------------------------------------------------------------

function buildValidRegistration(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    rut: '12.345.678-5',
    fullName: 'Camila Andrea Fuentes Soto',
    email: 'camila.fuentes@correo.cl',
    birthDate: '2005-05-10',
    heightCm: 168,
    comuna: 'Temuco',
    direccion: 'Avenida Alemania 1234',
    ocupacion: 'Estudiante de diseño',
    motivacion:
      'Quiero postular a este certamen porque siempre he creído en la representación de mi comuna y en usar la vitrina para impulsar causas sociales que me importan de verdad.',
    causaSocial: 'Prevención del acoso escolar en liceos de la región',
    aceptaRequisitos: true,
    aceptaTratamientoDatos: true,
    aceptaBases: true,
    ...overrides,
  };
}

describe('candidateSelfRegistrationSchema — formulario público de postulación', () => {
  it('acepta un envío realista con todos los campos obligatorios correctos', () => {
    const result = candidateSelfRegistrationSchema.safeParse(buildValidRegistration());
    expect(result.success).toBe(true);
  });

  it('rechaza un RUT con dígito verificador inválido', () => {
    const result = candidateSelfRegistrationSchema.safeParse(buildValidRegistration({ rut: '12.345.678-4' }));
    expect(result.success).toBe(false);
  });

  it('rechaza una comuna que no pertenece a La Araucanía', () => {
    expect(ARAUCANIA_COMUNAS).not.toContain('Santiago');
    const result = candidateSelfRegistrationSchema.safeParse(buildValidRegistration({ comuna: 'Santiago' }));
    expect(result.success).toBe(false);
  });

  it('acepta cualquier comuna real de la lista de La Araucanía', () => {
    const result = candidateSelfRegistrationSchema.safeParse(buildValidRegistration({ comuna: 'Villarrica' }));
    expect(result.success).toBe(true);
  });

  it('exige heightCm (a diferencia de candidateCreateSchema, donde es opcional)', () => {
    const { heightCm, ...withoutHeight } = buildValidRegistration();
    void heightCm;
    const selfReg = candidateSelfRegistrationSchema.safeParse(withoutHeight);
    expect(selfReg.success).toBe(false);

    const internal = candidateCreateSchema.safeParse({
      projectId: 'proj-1',
      rut: '12.345.678-5',
      fullName: 'Ficha creada por staff',
      birthDate: '2000-01-01',
      status: 'APPLICANT',
    });
    expect(internal.success).toBe(true);
  });

  it('rechaza motivación con menos de 80 caracteres', () => {
    const result = candidateSelfRegistrationSchema.safeParse(buildValidRegistration({ motivacion: 'Muy corta.' }));
    expect(result.success).toBe(false);
  });

  it('acepta motivación de exactamente 80 caracteres', () => {
    const result = candidateSelfRegistrationSchema.safeParse(
      buildValidRegistration({ motivacion: 'x'.repeat(80) })
    );
    expect(result.success).toBe(true);
  });

  it('rechaza motivación de más de 2000 caracteres', () => {
    const result = candidateSelfRegistrationSchema.safeParse(
      buildValidRegistration({ motivacion: 'x'.repeat(2001) })
    );
    expect(result.success).toBe(false);
  });

  it('rechaza direccion y ocupacion vacías, son obligatorias en el formulario público', () => {
    expect(candidateSelfRegistrationSchema.safeParse(buildValidRegistration({ direccion: '' })).success).toBe(false);
    expect(candidateSelfRegistrationSchema.safeParse(buildValidRegistration({ ocupacion: '' })).success).toBe(false);
  });

  it('rechaza causaSocial que exceda el máximo de 1000 caracteres', () => {
    const result = candidateSelfRegistrationSchema.safeParse(
      buildValidRegistration({ causaSocial: 'x'.repeat(1001) })
    );
    expect(result.success).toBe(false);
  });

  it.each(['aceptaRequisitos', 'aceptaTratamientoDatos', 'aceptaBases'] as const)(
    'rechaza el envío si %s viene en false',
    (field) => {
      const result = candidateSelfRegistrationSchema.safeParse(buildValidRegistration({ [field]: false }));
      expect(result.success).toBe(false);
    }
  );

  it('acepta que aceptaMarketing quede en false por defecto (es opcional)', () => {
    const { aceptaMarketing, ...rest } = buildValidRegistration() as Record<string, unknown>;
    void aceptaMarketing;
    const result = candidateSelfRegistrationSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.aceptaMarketing).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// candidateStatusChangeSchema — motivo obligatorio al descartar (Zod)
// ---------------------------------------------------------------------------

describe('candidateStatusChangeSchema — motivo obligatorio al pasar a REJECTED', () => {
  it('rechaza REJECTED sin motivoDescarte', () => {
    const result = candidateStatusChangeSchema.safeParse({ status: 'REJECTED' });
    expect(result.success).toBe(false);
  });

  it('rechaza REJECTED con motivoDescarte compuesto solo de espacios', () => {
    const result = candidateStatusChangeSchema.safeParse({ status: 'REJECTED', motivoDescarte: '   ' });
    expect(result.success).toBe(false);
  });

  it('acepta REJECTED con un motivo real', () => {
    const result = candidateStatusChangeSchema.safeParse({ status: 'REJECTED', motivoDescarte: 'No cumple con la edad mínima' });
    expect(result.success).toBe(true);
  });

  it('acepta cualquier otro estado sin exigir motivo', () => {
    const result = candidateStatusChangeSchema.safeParse({ status: 'UNDER_REVIEW' });
    expect(result.success).toBe(true);
  });

  it('nunca acepta APPLICANT como estado asignable manualmente', () => {
    // 'APPLICANT' fue excluido a propósito de CANDIDATE_ASSIGNABLE_STATUSES
    // (solo se asigna al recibir la auto-inscripción pública).
    const result = candidateStatusChangeSchema.safeParse({ status: 'APPLICANT' as never });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateCandidate / updateCandidateStatus — guard de REJECTED (servicio)
// ---------------------------------------------------------------------------

describe('Guard de REJECTED en los servicios (defensa en profundidad detrás de Zod)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('updateCandidate rechaza SIEMPRE un status REJECTED, sin tocar la base de datos', async () => {
    const updateManySpy = jest.spyOn(prisma.candidate, 'updateMany');
    await expect(updateCandidate('company-1', 'cand-1', { status: 'REJECTED' })).rejects.toThrow(
      /usa el cambio de estado/
    );
    expect(updateManySpy).not.toHaveBeenCalled();
  });

  it('updateCandidateStatus rechaza REJECTED sin motivoDescarte, sin tocar la base de datos', async () => {
    const updateManySpy = jest.spyOn(prisma.candidate, 'updateMany');
    await expect(updateCandidateStatus('company-1', 'cand-1', { status: 'REJECTED', motivoDescarte: '' })).rejects.toThrow(
      /motivo del descarte/
    );
    expect(updateManySpy).not.toHaveBeenCalled();
  });

  it('updateCandidateStatus acepta REJECTED con motivo y persiste motivoDescarte', async () => {
    jest.spyOn(prisma.candidate, 'updateMany').mockResolvedValue({ count: 1 });
    jest.spyOn(prisma.candidate, 'findFirst').mockResolvedValue({
      id: 'cand-1',
      status: 'REJECTED',
      motivoDescarte: 'No cumple los requisitos de bases',
      project: { id: 'proj-1', name: 'Miss Test', code: 'MT' },
    } as never);

    const result = await updateCandidateStatus('company-1', 'cand-1', {
      status: 'REJECTED',
      motivoDescarte: 'No cumple los requisitos de bases',
    });

    expect(result.status).toBe('REJECTED');
    expect(prisma.candidate.updateMany).toHaveBeenCalledWith({
      where: { id: 'cand-1', companyId: 'company-1' },
      data: { status: 'REJECTED', motivoDescarte: 'No cumple los requisitos de bases' },
    });
  });

  it('updateCandidateStatus limpia motivoDescarte cuando el nuevo estado no es REJECTED', async () => {
    jest.spyOn(prisma.candidate, 'updateMany').mockResolvedValue({ count: 1 });
    jest.spyOn(prisma.candidate, 'findFirst').mockResolvedValue({
      id: 'cand-1',
      status: 'FINALIST',
      motivoDescarte: null,
      project: { id: 'proj-1', name: 'Miss Test', code: 'MT' },
    } as never);

    await updateCandidateStatus('company-1', 'cand-1', { status: 'FINALIST' });

    expect(prisma.candidate.updateMany).toHaveBeenCalledWith({
      where: { id: 'cand-1', companyId: 'company-1' },
      data: { status: 'FINALIST', motivoDescarte: null },
    });
  });
});

// ---------------------------------------------------------------------------
// listCandidates — rango de edad -> rango de fecha de nacimiento
// (`ageRangeToBirthDateRange`, no exportada — se prueba a través del `where`
// que efectivamente recibe `prisma.candidate.findMany`, con la fecha actual
// fija para que el cálculo sea 100% determinístico y fácil de verificar a mano).
// ---------------------------------------------------------------------------

describe('listCandidates — filtro de edad (off-by-one en el rango de fechas)', () => {
  const FIXED_NOW = new Date(2026, 5, 15); // 15 de junio de 2026, sin ambigüedad de fin de mes

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    jest.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function captureWhere() {
    let capturedWhere: Prisma.CandidateWhereInput | undefined;
    jest.spyOn(prisma.candidate, 'findMany').mockImplementation(((args: { where: Prisma.CandidateWhereInput }) => {
      capturedWhere = args.where;
      return Promise.resolve([]);
    }) as never);
    jest.spyOn(prisma.candidate, 'count').mockResolvedValue(0);
    jest.spyOn(prisma, '$transaction').mockImplementation(((arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      throw new Error('se esperaba $transaction en modo arreglo');
    }) as never);
    return () => capturedWhere;
  }

  it('edad mínima 18 -> nacida como muy tarde el mismo día de hace 18 años', async () => {
    const getWhere = captureWhere();
    await listCandidates('company-1', { minAge: 18 });
    const birthDate = getWhere()?.birthDate as unknown as { gte?: Date; lte?: Date };
    expect(birthDate.gte).toBeUndefined();
    expect(birthDate.lte?.getFullYear()).toBe(2008);
    expect(birthDate.lte?.getMonth()).toBe(5);
    expect(birthDate.lte?.getDate()).toBe(15);
  });

  it('edad máxima 30 -> nacida como muy pronto un día después de hace 31 años', async () => {
    const getWhere = captureWhere();
    await listCandidates('company-1', { maxAge: 30 });
    const birthDate = getWhere()?.birthDate as unknown as { gte?: Date; lte?: Date };
    expect(birthDate.lte).toBeUndefined();
    expect(birthDate.gte?.getFullYear()).toBe(1995);
    expect(birthDate.gte?.getMonth()).toBe(5);
    expect(birthDate.gte?.getDate()).toBe(16);
  });

  it('rango 18-30 combina ambos límites en el mismo filtro', async () => {
    const getWhere = captureWhere();
    await listCandidates('company-1', { minAge: 18, maxAge: 30 });
    const birthDate = getWhere()?.birthDate as unknown as { gte?: Date; lte?: Date };
    expect(birthDate.gte?.getFullYear()).toBe(1995);
    expect(birthDate.lte?.getFullYear()).toBe(2008);
  });

  it('sin filtros de edad no agrega la clave birthDate al where', async () => {
    const getWhere = captureWhere();
    await listCandidates('company-1', {});
    expect(getWhere()?.birthDate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// submitCandidateRegistration — auto-inscripción pública
// ---------------------------------------------------------------------------

function buildProjectRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'proj-1',
    companyId: 'company-1',
    code: 'tmc',
    registrationStatus: 'OPEN',
    registrationOpensAt: null,
    registrationClosesAt: null,
    minCandidateAge: 18,
    maxCandidates: null,
    ...overrides,
  };
}

function buildRegistrationInput(overrides: Partial<Record<string, unknown>> = {}): CandidateSelfRegistrationInput {
  return {
    rut: '12.345.678-5',
    fullName: 'Camila Andrea Fuentes Soto',
    email: 'camila.fuentes@correo.cl',
    birthDate: new Date(2005, 4, 10),
    heightCm: 168,
    comuna: 'Temuco',
    direccion: 'Avenida Alemania 1234',
    ocupacion: 'Estudiante de diseño',
    motivacion:
      'Quiero postular a este certamen porque siempre he creído en la representación de mi comuna y en usar la vitrina para impulsar causas sociales que me importan de verdad.',
    causaSocial: 'Prevención del acoso escolar en liceos de la región',
    aceptaRequisitos: true,
    aceptaTratamientoDatos: true,
    aceptaBases: true,
    aceptaMarketing: false,
    ...overrides,
  } as CandidateSelfRegistrationInput;
}

describe('submitCandidateRegistration — auto-inscripción pública por token', () => {
  const FIXED_NOW = new Date(2026, 5, 15);

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    jest.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('lanza RegistrationNotFoundError si el token no corresponde a ningún proyecto', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(null);
    await expect(submitCandidateRegistration('token-invalido', buildRegistrationInput(), [], {})).rejects.toBeInstanceOf(
      RegistrationNotFoundError
    );
  });

  it('lanza RegistrationNotOpenError si la convocatoria está en borrador (no OPEN)', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(buildProjectRecord({ registrationStatus: 'DRAFT' }) as never);
    await expect(submitCandidateRegistration('token-x', buildRegistrationInput(), [], {})).rejects.toBeInstanceOf(
      RegistrationNotOpenError
    );
  });

  it('lanza RegistrationNotOpenError si todavía no llega la fecha de apertura', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(
      buildProjectRecord({ registrationOpensAt: new Date(2026, 5, 20) }) as never
    );
    await expect(submitCandidateRegistration('token-x', buildRegistrationInput(), [], {})).rejects.toBeInstanceOf(
      RegistrationNotOpenError
    );
  });

  it('lanza RegistrationNotOpenError si el plazo ya cerró', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(
      buildProjectRecord({ registrationClosesAt: new Date(2026, 5, 1) }) as never
    );
    await expect(submitCandidateRegistration('token-x', buildRegistrationInput(), [], {})).rejects.toBeInstanceOf(
      RegistrationNotOpenError
    );
  });

  it('lanza RegistrationNotOpenError cuando ya se alcanzó el cupo máximo (cupo lleno)', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(buildProjectRecord({ maxCandidates: 2 }) as never);
    jest.spyOn(prisma.candidate, 'count').mockResolvedValue(2);
    await expect(submitCandidateRegistration('token-x', buildRegistrationInput(), [], {})).rejects.toBeInstanceOf(
      RegistrationNotOpenError
    );
  });

  it('NO bloquea por cupo cuando hay vacantes disponibles', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(buildProjectRecord({ maxCandidates: 5 }) as never);
    jest.spyOn(prisma.candidate, 'count').mockResolvedValue(3);
    jest.spyOn(prisma.candidate, 'findFirst').mockResolvedValue(null);
    jest.spyOn(prisma, '$transaction').mockImplementation((async (cb: (tx: unknown) => unknown) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'proj-1' }]),
        candidate: { create: jest.fn().mockResolvedValue({ id: 'cand-new' }), count: jest.fn().mockResolvedValue(3) },
        internalDocumentSequence: { upsert: jest.fn().mockResolvedValue({ currentFolio: 1 }) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      return cb(tx);
    }) as never);

    await expect(submitCandidateRegistration('token-x', buildRegistrationInput(), [], {})).resolves.toBeTruthy();
  });

  it('SÍ bloquea por cupo dentro de la transacción aunque el chequeo previo no lo haya detectado (condición de carrera)', async () => {
    // Simula el caso real que motiva el lock: el chequeo rápido de
    // `evaluateRegistrationWindow` (afuera de la transacción) vio 3/5 cupos,
    // pero para cuando esta postulación entra a la transacción, otra
    // postulación simultánea ya ocupó los cupos restantes.
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(buildProjectRecord({ maxCandidates: 5 }) as never);
    jest.spyOn(prisma.candidate, 'count').mockResolvedValue(3);
    jest.spyOn(prisma.candidate, 'findFirst').mockResolvedValue(null);
    const createMock = jest.fn();
    jest.spyOn(prisma, '$transaction').mockImplementation((async (cb: (tx: unknown) => unknown) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'proj-1' }]),
        candidate: { create: createMock, count: jest.fn().mockResolvedValue(5) },
        internalDocumentSequence: { upsert: jest.fn().mockResolvedValue({ currentFolio: 1 }) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      return cb(tx);
    }) as never);

    await expect(submitCandidateRegistration('token-x', buildRegistrationInput(), [], {})).rejects.toBeInstanceOf(
      RegistrationFullError
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it('lanza BelowMinimumAgeError si la postulante no cumple la edad mínima del proyecto', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(buildProjectRecord({ minCandidateAge: 18 }) as never);
    // 2026-06-15 menos fecha de nacimiento 2010-01-01 = 16 años.
    await expect(
      submitCandidateRegistration('token-x', buildRegistrationInput({ birthDate: new Date(2010, 0, 1) }), [], {})
    ).rejects.toBeInstanceOf(BelowMinimumAgeError);
  });

  it('NO bloquea por edad a alguien que cumplió años justo hoy', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(buildProjectRecord({ minCandidateAge: 18 }) as never);
    jest.spyOn(prisma.candidate, 'findFirst').mockResolvedValue(null);
    jest.spyOn(prisma, '$transaction').mockImplementation((async (cb: (tx: unknown) => unknown) => {
      const tx = {
        internalDocumentSequence: { upsert: jest.fn().mockResolvedValue({ currentFolio: 1 }) },
        candidate: { create: jest.fn().mockResolvedValue({ id: 'cand-new' }) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      return cb(tx);
    }) as never);

    // Cumple 18 exactamente hoy (15 de junio de 2026): nació el 15 de junio de 2008.
    await expect(
      submitCandidateRegistration('token-x', buildRegistrationInput({ birthDate: new Date(2008, 5, 15) }), [], {})
    ).resolves.toBeTruthy();
  });

  it('lanza DuplicateApplicationError cuando ya existe una postulación con el mismo RUT (chequeo temprano)', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(buildProjectRecord() as never);
    jest.spyOn(prisma.candidate, 'findFirst').mockResolvedValue({ id: 'cand-existing' } as never);
    await expect(submitCandidateRegistration('token-x', buildRegistrationInput(), [], {})).rejects.toBeInstanceOf(
      DuplicateApplicationError
    );
  });

  it('lanza DuplicateApplicationError si el índice único de la base rechaza un envío simultáneo (P2002)', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(buildProjectRecord() as never);
    // El chequeo temprano no ve nada (otra postulación con el mismo RUT se
    // creó justo entre este SELECT y el INSERT dentro de la transacción).
    jest.spyOn(prisma.candidate, 'findFirst').mockResolvedValue(null);
    jest.spyOn(prisma, '$transaction').mockImplementation((async () => {
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.9.1',
      });
    }) as never);

    await expect(submitCandidateRegistration('token-x', buildRegistrationInput(), [], {})).rejects.toBeInstanceOf(
      DuplicateApplicationError
    );
  });

  it('propaga cualquier otro error de la transacción sin disfrazarlo de duplicado', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(buildProjectRecord() as never);
    jest.spyOn(prisma.candidate, 'findFirst').mockResolvedValue(null);
    jest.spyOn(prisma, '$transaction').mockImplementation((async () => {
      throw new Error('la base de datos no responde');
    }) as never);

    await expect(submitCandidateRegistration('token-x', buildRegistrationInput(), [], {})).rejects.toThrow(
      'la base de datos no responde'
    );
  });

  it('genera el folio con el formato {CODE}-{año}-{correlativo de 4 dígitos} usando el código del proyecto en mayúsculas', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(buildProjectRecord({ code: 'tmc' }) as never);
    jest.spyOn(prisma.candidate, 'findFirst').mockResolvedValue(null);

    const upsertMock = jest.fn().mockResolvedValue({ currentFolio: 43 });
    const createMock = jest.fn().mockImplementation((args: { data: { folio: string } }) =>
      Promise.resolve({ id: 'cand-new', folio: args.data.folio })
    );
    jest.spyOn(prisma, '$transaction').mockImplementation((async (cb: (tx: unknown) => unknown) => {
      const tx = {
        internalDocumentSequence: { upsert: upsertMock },
        candidate: { create: createMock },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      return cb(tx);
    }) as never);

    const { folio } = await submitCandidateRegistration('token-x', buildRegistrationInput(), [], {});

    expect(folio).toBe('TMC-2026-0043');
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId_kind: { companyId: 'company-1', kind: 'CANDIDATE_APPLICATION' } },
        update: { currentFolio: { increment: 1 } },
        create: { companyId: 'company-1', kind: 'CANDIDATE_APPLICATION', currentFolio: 1 },
      })
    );
  });

  it('resuelve companyId/projectId SIEMPRE desde el token, nunca desde el formulario', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(buildProjectRecord({ companyId: 'company-real', id: 'proj-real' }) as never);
    jest.spyOn(prisma.candidate, 'findFirst').mockResolvedValue(null);

    let capturedCreateArgs: { data: Record<string, unknown> } | undefined;
    jest.spyOn(prisma, '$transaction').mockImplementation((async (cb: (tx: unknown) => unknown) => {
      const tx = {
        internalDocumentSequence: { upsert: jest.fn().mockResolvedValue({ currentFolio: 1 }) },
        candidate: {
          create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
            capturedCreateArgs = args;
            return Promise.resolve({ id: 'cand-new' });
          }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      return cb(tx);
    }) as never);

    // El input trae (maliciosamente o por error) un companyId/projectId ajeno
    // que la firma de la función ni siquiera acepta como parámetro — solo se
    // puede colar si el llamador ignorara el contrato de tipos.
    await submitCandidateRegistration('token-x', buildRegistrationInput(), [], {});

    expect(capturedCreateArgs?.data.companyId).toBe('company-real');
    expect(capturedCreateArgs?.data.projectId).toBe('proj-real');
    expect(capturedCreateArgs?.data.status).toBe('APPLICANT');
  });
});
