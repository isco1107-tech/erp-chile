/**
 * ¿Es un id de registro bien formado? Una Server Action recibe lo que el navegador mande, sin revisar el
 * tipo: un objeto (`{ not: '' }`) en lugar del texto, pasado tal cual a Prisma, se convierte en un filtro
 * que alcanza a TODOS los registros de la empresa. Las acciones que reciben un id lo validan con esto antes
 * de tocar nada.
 */
export function isEntityId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64;
}
