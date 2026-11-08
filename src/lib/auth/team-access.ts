import type { Role } from '@prisma/client';
import type { CompanyFeatureFlags } from './modules';
import { resolvePermissions } from './effective-permissions';
import { excessPermissions, PERMISSION_LABELS, type Permission } from './permissions';

/**
 * Regla de equipo (endurecimiento 2026-11): quien no es Dueño nunca puede
 * dejar a otra persona con un permiso que él mismo no tiene, ni administrar
 * (cambiar rol, suspender, eliminar, reiniciar la contraseña, cambiar el rol
 * personalizado) a alguien que ya tiene permisos que él no tiene.
 *
 * Sin esto, un Administrador podía crear o convertir a alguien en Contador
 * —rol que tiene `accounting:close_period` y `payroll:close`, que la matriz le
 * niega al Administrador a propósito— y conocer su contraseña temporal; o
 * alguien con `settings:users` por un rol personalizado limitado podía quitarle
 * el rol personalizado a un colega, subirlo a Administrador y reiniciarle la
 * contraseña. Puro y sin Prisma para poder probarlo.
 */

export interface TeamActor {
  role: Role;
  permissions: readonly Permission[];
  features: CompanyFeatureFlags;
}

export interface MemberAccess {
  role: Role;
  /** Permisos del rol personalizado asignado, o `null` si usa el rol base. */
  customRolePermissions: string[] | null;
}

/** Permisos efectivos de `member` que `actor` no tiene (vacío para un Dueño). */
export function uncoveredPermissions(actor: TeamActor, member: MemberAccess): Permission[] {
  if (actor.role === 'OWNER') return [];
  const effective = resolvePermissions({ ...member, features: actor.features });
  return excessPermissions(effective, actor.permissions);
}

function labelList(permissions: Permission[]): string {
  return permissions.map((permission) => PERMISSION_LABELS[permission] ?? permission).join(', ');
}

/** Mensaje de rechazo si `actor` no puede dejar a alguien con `member`, o `null`. */
export function grantProblem(actor: TeamActor, member: MemberAccess): string | null {
  const missing = uncoveredPermissions(actor, member);
  if (missing.length === 0) return null;
  return `No puedes otorgar permisos que tú no tienes (${labelList(missing)}). Pídeselo a un Dueño de la empresa.`;
}

/** Mensaje de rechazo si `actor` no puede administrar a quien hoy tiene `member`, o `null`. */
export function manageProblem(actor: TeamActor, member: MemberAccess): string | null {
  const missing = uncoveredPermissions(actor, member);
  if (missing.length === 0) return null;
  return `Esta persona tiene permisos que tú no tienes (${labelList(missing)}): solo un Dueño de la empresa puede administrarla.`;
}
