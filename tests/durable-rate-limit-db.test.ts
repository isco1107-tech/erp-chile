/**
 * Límite de tasa compartido contra PostgreSQL REAL (mismas reglas que
 * `tests/hermes-link-db.test.ts`: solo corre contra una base local cuyo nombre
 * termina en `_test`).
 *
 *   WAREHOUSE_TEST_DATABASE_URL=postgresql://postgres:test@localhost:5432/erp_test \
 *     npx jest tests/durable-rate-limit-db.test.ts
 *
 * Lo que protege: el conteo es atómico aunque lleguen muchas solicitudes a la
 * vez (nunca deja pasar más de `limit`), la ventana vencida se reinicia, la
 * consulta sin registrar no consume cupo y en la base no queda el dato (IP,
 * correo), solo su SHA-256.
 */
import type { PrismaClient } from '@prisma/client';

const TEST_URL = process.env.WAREHOUSE_TEST_DATABASE_URL;

function isSafeTestDatabase(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname) && /_test$/.test(parsed.pathname.replace(/^\//, ''));
  } catch {
    return false;
  }
}

const describeDb = isSafeTestDatabase(TEST_URL) ? describe : describe.skip;

describeDb('límite de tasa compartido contra PostgreSQL', () => {
  jest.setTimeout(60_000);

  let prisma: PrismaClient;
  let limiter: typeof import('@/lib/security/durable-rate-limit');
  const suffix = Math.random().toString(36).slice(2, 8);

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    ({ prisma } = await import('@/lib/prisma'));
    limiter = await import('@/lib/security/durable-rate-limit');
  });

  afterAll(async () => {
    await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: `t-${suffix}` } } });
    await prisma.$disconnect();
  });

  it('20 solicitudes simultáneas con tope 5: pasan exactamente 5', async () => {
    const config = { prefix: `t-${suffix}-burst`, limit: 5, windowMs: 60_000 };
    const results = await Promise.all(Array.from({ length: 20 }, () => limiter.hitDurableRateLimit('203.0.113.7', config)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    const blocked = results.find((r) => !r.allowed);
    expect(blocked?.retryAfterMs).toBeGreaterThan(Date.now());
  });

  it('una ventana vencida se reinicia', async () => {
    const config = { prefix: `t-${suffix}-window`, limit: 1, windowMs: 300 };
    expect((await limiter.hitDurableRateLimit('a@b.cl', config)).allowed).toBe(true);
    expect((await limiter.hitDurableRateLimit('a@b.cl', config)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect((await limiter.hitDurableRateLimit('a@b.cl', config)).allowed).toBe(true);
  });

  it('consultar sin registrar no consume cupo', async () => {
    const config = { prefix: `t-${suffix}-peek`, limit: 2, windowMs: 60_000 };
    for (let i = 0; i < 5; i += 1) expect((await limiter.peekDurableRateLimit('x', config)).allowed).toBe(true);
    await limiter.hitDurableRateLimit('x', config);
    await limiter.hitDurableRateLimit('x', config);
    expect((await limiter.peekDurableRateLimit('x', config)).allowed).toBe(false);
  });

  it('en la base no queda el identificador, solo su huella', async () => {
    const config = { prefix: `t-${suffix}-privacy`, limit: 3, windowMs: 60_000 };
    await limiter.hitDurableRateLimit('persona@correo.cl', config);
    const rows = await prisma.rateLimitBucket.findMany({ where: { key: { startsWith: config.prefix } } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).not.toContain('persona');
    expect(rows[0]!.key).toMatch(new RegExp(`^${config.prefix}:[0-9a-f]{40}$`));
  });

  it('login: un correo sin cuenta se bloquea igual que una cuenta real (no revela quién existe)', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const { verifyCredentials, AccountLockedError } = await import('@/modules/auth/services/auth.service');
    const realEmail = `real-${suffix}@empresa.test`;
    const ghostEmail = `nadie-${suffix}@empresa.test`;
    const company = await prisma.company.create({ data: { rut: `76${suffix}-1`, businessName: `Empresa ${suffix}`, status: 'ACTIVE' } });
    await prisma.user.create({ data: { email: realEmail, name: 'Real', passwordHash: await bcrypt.hash('Correcta-123', 4), companyId: company.id } });

    const outcomes = async (email: string) => {
      const results: string[] = [];
      for (let i = 0; i < 6; i += 1) {
        try {
          results.push((await verifyCredentials(email, 'incorrecta')) === null ? 'invalid' : 'ok');
        } catch (error) {
          results.push(error instanceof AccountLockedError ? 'locked' : 'error');
        }
      }
      return results;
    };

    const real = await outcomes(realEmail);
    const ghost = await outcomes(ghostEmail);
    expect(real).toEqual(['invalid', 'invalid', 'invalid', 'invalid', 'invalid', 'locked']);
    expect(ghost).toEqual(real);

    await prisma.user.deleteMany({ where: { email: realEmail } });
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: 'login-unknown-email:' } } });
  });

  it('confirmaciones a una dirección escrita por un visitante: máximo 2 al día por empresa', async () => {
    const email = `Victima-${suffix}@correo.test`;
    expect(await limiter.allowVisitorConfirmationEmail(`co-${suffix}`, email)).toBe(true);
    expect(await limiter.allowVisitorConfirmationEmail(`co-${suffix}`, email.toLowerCase())).toBe(true);
    expect(await limiter.allowVisitorConfirmationEmail(`co-${suffix}`, email)).toBe(false);
    expect(await limiter.allowVisitorConfirmationEmail(`otra-${suffix}`, email)).toBe(true);
    await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: 'visitor-confirmation-email:' } } });
  });
});
