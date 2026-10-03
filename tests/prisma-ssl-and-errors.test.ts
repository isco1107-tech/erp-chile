/**
 * Dos ruidos de producción: el SECURITY WARNING de `pg` por `sslmode=require`
 * y los montos que desbordan columnas Int (P2020), que llegaban al usuario
 * como "Ocurrió un error al guardar los datos".
 */
import { Prisma } from '@prisma/client';

jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }));
jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  return { ...actual, PrismaClient: class {} };
});

import { normalizeSslMode } from '@/lib/prisma';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';

describe('normalizeSslMode', () => {
  it('cambia require por verify-full sin tocar el resto de la URL', () => {
    expect(normalizeSslMode('postgresql://u:p@h/db?sslmode=require&channel_binding=require')).toBe(
      'postgresql://u:p@h/db?sslmode=verify-full&channel_binding=require'
    );
    expect(normalizeSslMode('postgresql://u:p@h/db?x=1&sslmode=prefer')).toBe('postgresql://u:p@h/db?x=1&sslmode=verify-full');
  });

  it('deja intactas las URL sin sslmode o con un modo explícito distinto', () => {
    expect(normalizeSslMode('postgresql://u:p@h/db')).toBe('postgresql://u:p@h/db');
    expect(normalizeSslMode('postgresql://u:p@h/db?sslmode=disable')).toBe('postgresql://u:p@h/db?sslmode=disable');
    expect(normalizeSslMode(undefined)).toBeUndefined();
  });
});

describe('toFriendlyErrorMessage', () => {
  it('explica el desborde de un monto en vez de un error genérico', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Value out of range for the type', { code: 'P2020', clientVersion: 'x' });
    expect(toFriendlyErrorMessage(error)).toMatch(/demasiado grande/);
  });

  it('traduce el RESTRICT de llave foránea como dependencia', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'update or delete on table "Product" violates RESTRICT setting of foreign key constraint',
      { code: 'P2039', clientVersion: 'x' }
    );
    expect(toFriendlyErrorMessage(error)).toMatch(/dependen de este dato/);
  });
});
