import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { OWNER_EMAIL } from './support';

/**
 * Acceso directo a la base de pruebas, solo para ARMAR datos que no tienen pantalla ni API pública
 * (un proveedor, el código de su portal) y para leer el resultado de lo que hizo la app. La base es la
 * efímera del CI o la propia de quien corre las pruebas en local (ver e2e/README.md): nunca la de producción.
 */
let client: PrismaClient | null = null;

export function db(): PrismaClient {
  if (!client) {
    if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL para las pruebas que arman datos (ver e2e/README.md)');
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }), log: ['error'] });
  }
  return client;
}

/** Empresa y usuario dueño que crea `prisma/seed.ts` (el mismo con el que inician sesión las pruebas). */
export async function owner(): Promise<{ id: string; companyId: string; name: string }> {
  const user = await db().user.findFirstOrThrow({ where: { email: OWNER_EMAIL }, select: { id: true, companyId: true, name: true } });
  if (!user.companyId) throw new Error('El usuario de pruebas no tiene empresa');
  return { id: user.id, companyId: user.companyId, name: user.name };
}

/** Proveedor de la empresa de pruebas; se crea una vez y las corridas siguientes lo reutilizan. */
export async function ensureSupplier(razonSocial: string, rutBody: string): Promise<{ id: string; name: string }> {
  const { companyId } = await owner();
  const rutClean = rutBody.replace(/\D/g, '') + 'K';
  const existing = await db().contact.findFirst({ where: { companyId, rutClean }, select: { id: true, isSupplier: true } });
  if (existing) {
    if (!existing.isSupplier) await db().contact.update({ where: { id: existing.id }, data: { isSupplier: true } });
    return { id: existing.id, name: razonSocial };
  }
  const created = await db().contact.create({ data: { companyId, razonSocial, rut: `${rutBody}-K`, rutClean, isSupplier: true, isCustomer: false } });
  return { id: created.id, name: razonSocial };
}

/** Segunda bodega de la empresa de pruebas, para comprobar que los registros no se mezclan. */
export async function ensureWarehouse(name: string, code: string): Promise<{ id: string; name: string }> {
  const { companyId } = await owner();
  const existing = await db().warehouse.findFirst({ where: { companyId, code }, select: { id: true } });
  if (existing) return { id: existing.id, name };
  const created = await db().warehouse.create({ data: { companyId, name, code } });
  return { id: created.id, name };
}
