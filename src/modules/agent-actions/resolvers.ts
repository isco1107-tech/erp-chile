import { prisma } from '@/lib/prisma';

/**
 * El modelo de IA conoce a las personas/proyectos por nombre, no por su id
 * interno — estos helpers traducen "María Pérez" o "Certamen 2026" al id real
 * dentro de la empresa del usuario, o lanzan un error legible que el modelo
 * puede reenviarle al usuario para pedir una identificación más precisa
 * (nunca adivinan: 0 o más de 1 coincidencia es siempre un error, no un
 * "tomo el primero").
 */

export interface CandidateMatch {
  id: string;
  fullName: string;
  stageName: string | null;
}

export async function resolveCandidateByName(companyId: string, query: string): Promise<CandidateMatch> {
  const q = query.trim();
  if (!q) throw new Error('Falta el nombre de la candidata');

  const matches = await prisma.candidate.findMany({
    where: {
      companyId,
      status: { notIn: ['WITHDRAWN', 'REJECTED'] },
      OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { stageName: { contains: q, mode: 'insensitive' } }],
    },
    select: { id: true, fullName: true, stageName: true },
    take: 6,
  });

  if (matches.length === 0) throw new Error(`No encontré ninguna candidata activa que coincida con "${query}"`);
  if (matches.length > 1) {
    const names = matches.map((m) => m.stageName || m.fullName).join(', ');
    throw new Error(`Encontré varias candidatas que coinciden con "${query}": ${names}. Pide que se especifique el nombre completo.`);
  }
  return matches[0]!;
}

export interface ContactMatch {
  id: string;
  razonSocial: string;
  rut: string;
}

export async function resolveContactByQuery(companyId: string, query: string): Promise<ContactMatch> {
  const q = query.trim();
  if (!q) throw new Error('Falta el nombre o RUT del contacto');

  const matches = await prisma.contact.findMany({
    where: { companyId, OR: [{ razonSocial: { contains: q, mode: 'insensitive' } }, { rut: { contains: q } }] },
    select: { id: true, razonSocial: true, rut: true },
    take: 6,
  });

  if (matches.length === 0) throw new Error(`No encontré ningún contacto que coincida con "${query}"`);
  if (matches.length > 1) {
    const names = matches.map((m) => `${m.razonSocial} (${m.rut})`).join(', ');
    throw new Error(`Encontré varios contactos que coinciden con "${query}": ${names}. Pide que se especifique el RUT exacto.`);
  }
  return matches[0]!;
}

export interface ProjectMatch {
  id: string;
  name: string;
  code: string;
}

export async function resolveProjectByName(companyId: string, query: string): Promise<ProjectMatch> {
  const q = query.trim();
  if (!q) throw new Error('Falta el nombre del proyecto/certamen');

  const matches = await prisma.project.findMany({
    where: { companyId, OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] },
    select: { id: true, name: true, code: true },
    take: 6,
  });

  if (matches.length === 0) throw new Error(`No encontré ningún proyecto/certamen que coincida con "${query}"`);
  if (matches.length > 1) {
    const names = matches.map((m) => `${m.name} (${m.code})`).join(', ');
    throw new Error(`Encontré varios proyectos que coinciden con "${query}": ${names}. Pide que se especifique el código exacto.`);
  }
  return matches[0]!;
}

export interface UserMatch {
  id: string;
  name: string;
}

/** Persona activa del equipo de la empresa, por nombre o correo. */
export async function resolveUserByName(companyId: string, query: string): Promise<UserMatch> {
  const q = query.trim();
  if (!q) throw new Error('Falta el nombre de la persona');

  const matches = await prisma.user.findMany({
    where: { companyId, isActive: true, OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] },
    select: { id: true, name: true },
    take: 6,
  });

  if (matches.length === 0) throw new Error(`No encontré a nadie del equipo que coincida con "${query}"`);
  if (matches.length > 1) {
    throw new Error(`Encontré varias personas que coinciden con "${query}": ${matches.map((m) => m.name).join(', ')}. Pide el nombre completo.`);
  }
  return matches[0]!;
}

export interface ProductMatch {
  id: string;
  sku: string;
  name: string;
  netPrice: number;
  isExempt: boolean;
}

/**
 * Producto del catálogo por SKU o código de barras exacto (lo más preciso) y,
 * si no, por nombre. Igual que el resto: 0 o más de 1 coincidencia por nombre
 * es un error para que el modelo pida precisión, nunca "el primero".
 */
export async function resolveProductByQuery(companyId: string, query: string): Promise<ProductMatch> {
  const q = query.trim();
  if (!q) throw new Error('Falta el producto (nombre o SKU)');
  const select = { id: true, sku: true, name: true, netPrice: true, isExempt: true } as const;

  const exact = await prisma.product.findFirst({
    where: { companyId, OR: [{ sku: { equals: q, mode: 'insensitive' } }, { barcode: q }] },
    select,
  });
  if (exact) return exact;

  const matches = await prisma.product.findMany({ where: { companyId, name: { contains: q, mode: 'insensitive' } }, select, take: 6 });
  if (matches.length === 0) throw new Error(`No encontré ningún producto que coincida con "${query}"`);
  if (matches.length > 1) {
    const names = matches.map((m) => `${m.name} (SKU ${m.sku})`).join(', ');
    throw new Error(`Encontré varios productos que coinciden con "${query}": ${names}. Pide el SKU exacto.`);
  }
  return matches[0]!;
}

/** Bodega principal (la primera creada): la misma que proponen los formularios por defecto. */
export async function resolveDefaultWarehouse(companyId: string): Promise<{ id: string; name: string }> {
  const warehouse = await prisma.warehouse.findFirst({ where: { companyId }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } });
  if (!warehouse) throw new Error('La empresa todavía no tiene bodegas: crea una en Inventario antes de cotizar');
  return warehouse;
}
