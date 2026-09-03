import type { Role } from '@prisma/client';
import { ALL_PERMISSIONS, isPermission, permissionsForRole, type Permission } from './permissions';
import { moduleForPermission, type CompanyFeatureFlags } from './modules';

/**
 * Resolución de permisos efectivos: rol base o rol personalizado, recortado por
 * los módulos que la empresa tiene contratados.
 *
 * Vive en un archivo propio y sin dependencias de servidor para que sea
 * testeable: es la pieza que decide todo el control de acceso del producto, y
 * enterrarla junto a Prisma la dejaba fuera del alcance de los tests.
 */

export interface ResolvePermissionsInput {
  role: Role;
  /** Lista del `CustomRole` asignado, o `null` si usa el rol base. */
  customRolePermissions: string[] | null;
  features: CompanyFeatureFlags;
}

export function resolvePermissions(input: ResolvePermissionsInput): Permission[] {
  const { role, customRolePermissions, features } = input;

  let granted: Permission[];
  if (role === 'OWNER') {
    // El dueño nunca queda fuera de su propia cuenta por un rol mal configurado.
    granted = [...ALL_PERMISSIONS];
  } else if (customRolePermissions) {
    // Las claves desconocidas se descartan: un permiso renombrado o eliminado no
    // debe convertirse en un acceso fantasma.
    granted = customRolePermissions.filter(isPermission);
  } else {
    granted = permissionsForRole(role);
  }

  return filterByFeatures(granted, features);
}

/**
 * Descarta los permisos cuyo módulo no está contratado. Los permisos
 * transversales (contactos, configuración, auditoría) no pertenecen a ningún
 * módulo y siempre pasan.
 */
export function filterByFeatures(permissions: Permission[], features: CompanyFeatureFlags): Permission[] {
  return permissions.filter((permission) => {
    const moduleKey = moduleForPermission(permission);
    return moduleKey ? features[moduleKey] : true;
  });
}

/**
 * Limpia una lista de permisos venida del cliente antes de persistirla en un
 * rol personalizado: descarta claves desconocidas, duplicados y permisos de
 * módulos no contratados. El formulario ya solo ofrece lo permitido, pero un
 * payload fabricado no debe poder ampliar el plan.
 */
export function sanitizePermissions(permissions: string[], features: CompanyFeatureFlags): Permission[] {
  const valid = Array.from(new Set(permissions.filter(isPermission)));
  return filterByFeatures(valid, features);
}
