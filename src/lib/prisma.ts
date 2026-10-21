import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * `pg` trata `sslmode=require|prefer|verify-ca` como `verify-full` y lo avisa
 * con un SECURITY WARNING en CADA conexión (cientos por semana en los registros
 * de Vercel, tapando los errores reales). Neon usa un certificado público
 * válido, así que pedir `verify-full` explícito no cambia el comportamiento:
 * solo silencia el aviso y deja claro que se verifica el certificado.
 */
export function normalizeSslMode(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(/([?&])sslmode=(?:require|prefer|verify-ca)(?=&|$)/, '$1sslmode=verify-full');
}

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: normalizeSslMode(process.env.DATABASE_URL),
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
