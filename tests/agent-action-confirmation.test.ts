import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { consumePendingActionJti, recordPendingActionResult } from '@/modules/agent-actions/token';

/**
 * Regresión de OP-07 (auditoría de arquitectura): la marca de "este jti ya
 * fue confirmado" tenía que dejar de vivir en un `Map` en memoria de proceso
 * — bajo Vercel cada instancia serverless tiene su propia memoria, así que
 * el mismo token de confirmación se podía reusar en otra instancia y
 * ejecutar dos veces una acción que escribe en la base (ej. un plan de pago
 * duplicado).
 *
 * `consumePendingActionJti` ahora inserta una fila en `AgentActionConfirmation`
 * (constraint única `companyId+jti`). Acá se simula la base compartida entre
 * instancias con un `Set` propio del test (nunca `globalThis`, que es
 * justamente el mecanismo que fallaba) y se demuestra que:
 *
 *   1. El primer consumo de un jti tiene éxito.
 *   2. Un segundo consumo del MISMO jti — incluso "desde otra instancia" sin
 *      ningún estado de proceso compartido — es rechazado, porque la
 *      detección ahora vive en la base y no en memoria.
 *
 * Contra el código anterior (`git stash`) este archivo directamente no
 * compila: `consumePendingActionJti` era síncrona y devolvía `boolean`, sin
 * `companyId` ni `actionType` — la firma nueva es la que hace posible
 * distinguir el tenant y guardar el resultado real de la ejecución.
 */

describe('consumePendingActionJti — un solo uso por jti, entre instancias', () => {
  const COMPANY_ID = 'cmp_1';
  const JTI = 'jti-fijo-para-el-test';

  /**
   * Simula la tabla `AgentActionConfirmation` en Neon: un solo store,
   * consultado por TODAS las "instancias" (a diferencia de `globalThis`, que
   * en producción es un store distinto por instancia serverless).
   */
  let filasEnLaBaseCompartida: Set<string>;

  beforeEach(() => {
    filasEnLaBaseCompartida = new Set();

    jest.spyOn(prisma.agentActionConfirmation, 'create').mockImplementation((async (args: {
      data: { companyId: string; jti: string };
    }) => {
      const key = `${args.data.companyId}::${args.data.jti}`;
      if (filasEnLaBaseCompartida.has(key)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`companyId`,`jti`)', {
          code: 'P2002',
          clientVersion: '7.9.1',
        });
      }
      filasEnLaBaseCompartida.add(key);
      return { id: `conf_${key}` };
    }) as never);

    jest.spyOn(prisma.agentActionConfirmation, 'updateMany').mockResolvedValue({ count: 1 } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('consume el jti la primera vez', async () => {
    const confirmationId = await consumePendingActionJti(COMPANY_ID, JTI, 'CREATE_PAYMENT_PLAN');
    expect(confirmationId).toBe(`conf_${COMPANY_ID}::${JTI}`);
  });

  it('rechaza el mismo jti confirmado "desde otra instancia" (sin memoria de proceso compartida)', async () => {
    // "Instancia A": confirma primero, contra la base compartida.
    const primeraInstancia = await consumePendingActionJti(COMPANY_ID, JTI, 'CREATE_PAYMENT_PLAN');
    expect(primeraInstancia).not.toBeNull();

    // "Instancia B": ningún estado de proceso en común con la instancia A —
    // no se reusa ningún Map ni variable local, solo la misma base mockeada.
    // Con el código anterior (Map en `globalThis`), esta llamada en un
    // proceso *distinto* habría tenido su propio Map vacío y habría
    // devuelto `true` incorrectamente, ejecutando la acción dos veces.
    const segundaInstancia = await consumePendingActionJti(COMPANY_ID, JTI, 'CREATE_PAYMENT_PLAN');
    expect(segundaInstancia).toBeNull();
  });

  it('jamás mezcla el jti de una empresa con el de otra', async () => {
    const empresaA = await consumePendingActionJti('cmp_a', JTI, 'CREATE_PAYMENT_PLAN');
    const empresaB = await consumePendingActionJti('cmp_b', JTI, 'CREATE_PAYMENT_PLAN');
    expect(empresaA).not.toBeNull();
    expect(empresaB).not.toBeNull();
  });

  it('registra el resultado real de la ejecución en la misma fila', async () => {
    const confirmationId = await consumePendingActionJti(COMPANY_ID, JTI, 'CREATE_PAYMENT_PLAN');
    expect(confirmationId).not.toBeNull();

    await recordPendingActionResult(COMPANY_ID, confirmationId as string, 'SUCCEEDED', 'Plan de pago creado');

    expect(prisma.agentActionConfirmation.updateMany).toHaveBeenCalledWith({
      where: { id: confirmationId, companyId: COMPANY_ID },
      data: { status: 'SUCCEEDED', resultSummary: 'Plan de pago creado' },
    });
  });
});
