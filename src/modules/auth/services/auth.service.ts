import { prisma } from '@/lib/prisma';
import type { Prisma, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';

/** Estados de tenant que permiten operar. Debe coincidir con `guards.ts`. */
const OPERATIONAL_STATUSES = ['ACTIVE', 'TRIAL'];

/**
 * Mismo umbral que `verify-totp/route.ts`: 5 intentos, 15 minutos de bloqueo.
 * Sin esto la contraseña es fuerza-bruteable sin límite — bcrypt(12) frena un
 * poco (~100-200ms por intento) pero no detiene ataques paralelos ni
 * distribuidos. Confirmado en pruebas locales: 20 intentos seguidos contra
 * /api/auth/signin, cero bloqueos.
 */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export class SuspendedCompanyError extends Error {
  constructor() {
    super('La cuenta de tu empresa no se encuentra activa. Contacta a soporte');
  }
}

export class AccountLockedError extends Error {
  minutesLeft: number;

  constructor(minutesLeft: number) {
    super(`Demasiados intentos fallidos. Vuelve a intentar en ${minutesLeft} minuto(s)`);
    this.minutesLeft = minutesLeft;
  }
}

const DUMMY_HASH = '$2b$12$8M8fKdKgsaNr.D4NjEj7auzaCl4kApLh477i.TriJbHm0KTvVMwae';

/**
 * Todo el ciclo lock-de-fila → chequeo de bloqueo → `bcrypt.compare` →
 * registro de intento fallido va DENTRO de una sola transacción, igual que
 * `verify-totp/route.ts`. La primera versión de esto hacía el `bcrypt.compare`
 * y el chequeo de `loginLockedUntil` fuera del lock (solo el incremento del
 * contador estaba protegido) — una ráfaga de requests concurrentes contra el
 * mismo email pasaba el chequeo "no bloqueado" a la vez y cada una ejecutaba
 * su propio intento real de contraseña en paralelo antes de que cualquiera
 * alcanzara a escribir el lockout, así que un atacante con concurrencia
 * suficiente conseguía muchos más de `MAX_ATTEMPTS` intentos reales por
 * ventana. `bcrypt.compare` (bcryptjs, sin binding nativo) es CPU-only, así
 * que sostenerlo dentro de la transacción es seguro — el lock es por fila
 * (por email), no bloquea logins concurrentes de otras cuentas.
 */
export async function verifyCredentials(email: string, password: string) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE email = ${email} FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { email },
      include: { company: { select: { status: true } } },
    });

    // Correo inexistente o cuenta desactivada: sin nada que bloquear, pero
    // igual pasa por el `bcrypt.compare` contra un hash fijo en ambos casos —
    // mismo timing de respuesta que la rama de contraseña incorrecta, para no
    // convertir el endpoint en un oráculo de qué correos existen.
    if (!user || !user.isActive) {
      await bcrypt.compare(password, DUMMY_HASH);
      return null;
    }

    if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
      throw new AccountLockedError(Math.ceil((user.loginLockedUntil.getTime() - Date.now()) / 60000));
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      const attempts = user.failedLoginAttempts + 1;
      await tx.user.update({
        where: { id: user.id },
        data:
          attempts >= MAX_ATTEMPTS
            ? { failedLoginAttempts: 0, loginLockedUntil: new Date(Date.now() + LOCKOUT_MS) }
            : { failedLoginAttempts: attempts },
      });
      return null;
    }

    if (user.failedLoginAttempts > 0 || user.loginLockedUntil) {
      await tx.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, loginLockedUntil: null } });
    }

    // Suspender una empresa debe cortar el acceso desde el propio login, no solo
    // en el layout: antes se emitía una cookie de sesión perfectamente válida y
    // el corte ocurría recién al renderizar /dashboard. El superadmin es la
    // excepción deliberada — es quien tiene que poder entrar a reactivarla.
    if (!user.isSuperAdmin && user.company && !OPERATIONAL_STATUSES.includes(user.company.status)) {
      throw new SuspendedCompanyError();
    }

    return user;
  }, LOCKING_TX_OPTIONS);
}

export async function createUser(data: {
  email: string;
  password: string;
  name: string;
  role?: Role;
  companyId?: string;
}) {
  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      name: data.name,
      role: data.role,
      companyId: data.companyId,
    },
  });
  return user;
}
