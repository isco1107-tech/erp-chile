import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    // Techo bajo a propósito: cada instancia serverless de Vercel crea su
    // propio pool, y aunque DATABASE_URL ya apunta al endpoint pooled de Neon
    // (PgBouncer), sin límite explícito `pg` abre hasta 10 conexiones por
    // instancia por defecto — con varias instancias concurrentes eso agota
    // igual el cupo de conexiones del compute. 5 alcanza sobrado para el
    // tráfico por instancia de una función serverless.
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['query', 'warn', 'error'],
  });
}

export const prisma = global.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== 'production') global.prisma = prisma;
