import { cache } from 'react';
import { cookies } from 'next/headers';
import type { Role, TenantStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { verifySessionToken, type SessionPayload } from './session';
import type { Permission } from './permissions';
import {
  DEFAULT_FEATURES,
  moduleForPermission,
  toFeatureFlags,
  type CompanyFeatureFlags,
  type FeatureKey,
} from './modules';
import { resolvePermissions } from './effective-permissions';
import { isSessionRevoked, touchSession } from './sessions';

export { resolvePermissions };

export interface AuthSession {
  id: string;
  role: Role;
  email: string;
  name: string;
  companyId: string;
  isSuperAdmin: boolean;
}

/** Sesión más el estado vivo del tenant: plan contratado y permisos efectivos. */
export interface AuthContext extends AuthSession {
  companyName: string;
  companyLogoUrl: string | null;
  companyBackgroundUrl: string | null;
  companyBrandPalette: string[];
  companyStatus: TenantStatus;
  planName: string;
  maxUsers: number;
  maxWarehouses: number;
  features: CompanyFeatureFlags;
  /** Permisos ya cruzados con los módulos que la empresa tiene contratados. */
  permissions: Permission[];
  customRoleId: string | null;
  customRoleName: string | null;
  /** Fuerza el flujo de "nueva contraseña" antes de dejar pasar a cualquier ruta del dashboard. */
  mustChangePassword: boolean;
}

export class AuthError extends Error {
  status: 401 | 403;

  constructor(message: string, status: 401 | 403) {
    super(message);
    this.status = status;
  }
}

/**
 * La empresa existe pero no puede operar (suspendida o cancelada). Se distingue
 * de `AuthError` porque la respuesta correcta no es /login ni un 403 genérico,
 * sino la pantalla /suspended que explica qué pasó.
 */
export class TenantInactiveError extends Error {
  status: TenantStatus;

  constructor(status: TenantStatus) {
    super('La cuenta de tu empresa no se encuentra activa');
    this.status = status;
  }
}

/** El plan de la empresa no incluye el módulo solicitado. */
export class ModuleNotEnabledError extends Error {
  moduleKey: FeatureKey;

  constructor(moduleKey: FeatureKey) {
    super('Módulo no incluido en el plan actual');
    this.moduleKey = moduleKey;
  }
}

const OPERATIONAL_STATUSES: TenantStatus[] = ['ACTIVE', 'TRIAL'];

async function readSessionPayload(): Promise<SessionPayload> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  if (!token) throw new AuthError('No autenticado', 401);

  let payload: SessionPayload;
  try {
    payload = await verifySessionToken(token);
  } catch {
    throw new AuthError('Sesión inválida o expirada', 401);
  }

  // Cierre por dispositivo: "Dispositivos activos" marca `revokedAt` en la
  // fila de esta sesión sin poder invalidar el JWT en sí (es sin estado), así
  // que el corte real pasa por acá.
  if (await isSessionRevoked(token)) {
    throw new AuthError('Esta sesión fue cerrada desde otro dispositivo', 401);
  }
  void touchSession(token);

  return payload;
}

/**
 * Carga el contexto completo desde la base de datos. Va envuelto en `cache()`
 * para resolverse una sola vez por request: el layout, la página y cada Server
 * Action de un mismo render comparten la lectura.
 *
 * `activeCompanyId` (módulo `hasMultiCompany`) permite que el contexto
 * resuelto sea el de una `CompanyMembership` en vez de la empresa hogar
 * (`user.companyId`) — pero SIEMPRE revalidado acá, nunca confiando en el rol
 * que venga en el JWT. Si la membresía no existe, o la empresa destino no
 * tiene `hasMultiCompany` activo, cae de vuelta a la empresa hogar en
 * silencio en vez de romper la sesión completa (un flag que un superadmin
 * apaga después no debe dejar al usuario sin poder ni siquiera entrar).
 */
const loadContext = cache(async (userId: string, activeCompanyId?: string): Promise<AuthContext> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      company: { include: { features: true } },
      customRole: { select: { id: true, name: true, permissions: true } },
    },
  });

  if (!user) throw new AuthError('Sesión inválida o expirada', 401);
  if (!user.isActive) throw new AuthError('Tu cuenta fue suspendida por el administrador', 401);
  if (!user.companyId || !user.company) throw new AuthError('Sesión sin empresa asociada', 401);

  let effectiveCompanyId = user.companyId;
  let effectiveCompany = user.company;
  let effectiveRole = user.role;
  let effectiveCustomRoleId = user.customRole?.id ?? null;
  let effectiveCustomRoleName = user.customRole?.name ?? null;
  let effectiveCustomRolePermissions = user.customRole?.permissions ?? null;

  if (activeCompanyId && activeCompanyId !== user.companyId) {
    const membership = await prisma.companyMembership.findUnique({
      where: { userId_companyId: { userId, companyId: activeCompanyId } },
      include: {
        company: { include: { features: true } },
        customRole: { select: { id: true, name: true, permissions: true } },
      },
    });
    if (membership && toFeatureFlags(membership.company.features).hasMultiCompany) {
      effectiveCompanyId = membership.companyId;
      effectiveCompany = membership.company;
      effectiveRole = membership.role;
      effectiveCustomRoleId = membership.customRole?.id ?? null;
      effectiveCustomRoleName = membership.customRole?.name ?? null;
      effectiveCustomRolePermissions = membership.customRole?.permissions ?? null;
    }
    // Si no hay membresía válida, sigue con la empresa hogar ya cargada arriba.
  }

  if (!OPERATIONAL_STATUSES.includes(effectiveCompany.status)) {
    throw new TenantInactiveError(effectiveCompany.status);
  }

  const features = toFeatureFlags(effectiveCompany.features);

  return {
    id: user.id,
    role: effectiveRole,
    email: user.email,
    name: user.name,
    companyId: effectiveCompanyId,
    isSuperAdmin: user.isSuperAdmin,
    companyName: effectiveCompany.businessName,
    companyLogoUrl: effectiveCompany.logoUrl,
    companyBackgroundUrl: effectiveCompany.backgroundUrl,
    companyBrandPalette: effectiveCompany.brandPalette,
    companyStatus: effectiveCompany.status,
    planName: effectiveCompany.planName,
    maxUsers: effectiveCompany.maxUsers,
    maxWarehouses: effectiveCompany.maxWarehouses,
    features,
    permissions: resolvePermissions({
      role: effectiveRole,
      customRolePermissions: effectiveCustomRolePermissions,
      features,
    }),
    customRoleId: effectiveCustomRoleId,
    customRoleName: effectiveCustomRoleName,
    mustChangePassword: user.mustChangePassword,
  };
});

/**
 * Contexto completo del usuario en sesión.
 *
 * A diferencia de la versión anterior de `requireAuth`, esto sí consulta la base
 * de datos en vez de confiar solo en el JWT. Es el precio de que suspender una
 * empresa o un usuario corte el acceso de inmediato: un token firmado hace 7
 * horas seguiría siendo criptográficamente válido.
 */
export async function getAuthContext(): Promise<AuthContext> {
  const payload = await readSessionPayload();
  const userId = payload.userId ?? payload.id;
  if (!userId) throw new AuthError('Sesión inválida o expirada', 401);
  const context = await loadContext(userId, payload.activeCompanyId);
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
  if (!current || (payload.sessionVersion ?? 0) !== current.sessionVersion) {
    throw new AuthError('Sesión revocada, vuelve a iniciar sesión', 401);
  }
  return context;
}

export async function requireAuth(allowedRoles?: Role[]): Promise<AuthSession> {
  const context = await getAuthContext();
  assertPasswordChangeNotPending(context);
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(context.role)) {
    throw new AuthError('No autorizado para esta acción', 403);
  }
  return context;
}

/**
 * `mustChangePassword` solo se aplicaba redirigiendo la navegación del
 * dashboard (SEG-08) — una API o Server Action invocada directamente, sin
 * pasar por ese layout, se ejecutaba igual con permisos normales mientras la
 * contraseña temporal seguía vigente. `getAuthContext()` en sí no lo exige:
 * la página `/change-password` y `completeForcedPasswordChangeAction` lo
 * llaman directamente y necesitan poder leer el flag para decidir qué hacer,
 * no que les lance una excepción.
 */
export function assertPasswordChangeNotPending(context: Pick<AuthContext, 'mustChangePassword'>): void {
  if (context.mustChangePassword) {
    throw new AuthError('Debes cambiar tu contraseña antes de continuar', 403);
  }
}

export function can(context: Pick<AuthContext, 'permissions'>, permission: Permission): boolean {
  return context.permissions.includes(permission);
}

/**
 * Guard por permiso. Prefiere esto sobre `requireAuth(roles)`: una lista de
 * roles ignora los roles personalizados que cree el cliente, mientras que el
 * permiso los cubre a todos.
 */
export async function requireAuthWithPermission(permission: Permission): Promise<AuthContext> {
  const context = await getAuthContext();
  assertPasswordChangeNotPending(context);
  if (!can(context, permission)) {
    const moduleKey = moduleForPermission(permission);
    if (moduleKey && !context.features[moduleKey]) throw new ModuleNotEnabledError(moduleKey);
    throw new AuthError('No autorizado para esta acción', 403);
  }
  return context;
}

/** Portal de plataforma. Es una bandera global, independiente de la empresa. */
export async function requireSuperAdmin(): Promise<AuthSession> {
  const payload = await readSessionPayload();
  const userId = payload.userId ?? payload.id;
  if (!userId) throw new AuthError('Sesión inválida o expirada', 401);

  // No pasa por `loadContext`: el dueño del SaaS debe poder entrar aunque la
  // empresa a la que pertenece esté suspendida.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true, name: true, companyId: true, isSuperAdmin: true, isActive: true, sessionVersion: true },
  });

  if (!user || !user.isActive || (payload.sessionVersion ?? 0) !== user.sessionVersion) throw new AuthError('Sesión inválida o expirada', 401);
  if (!user.isSuperAdmin) throw new AuthError('No autorizado para esta acción', 403);

  return {
    id: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
    companyId: user.companyId ?? '',
    isSuperAdmin: true,
  };
}

/**
 * Comprueba que la empresa esté operativa y tenga el módulo contratado.
 * Devuelve sus flags para no obligar al llamador a consultarlos de nuevo.
 */
export async function requireModule(companyId: string, moduleKey: FeatureKey): Promise<CompanyFeatureFlags> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { features: true },
  });
  if (!company) throw new AuthError('Sesión sin empresa asociada', 401);
  if (!OPERATIONAL_STATUSES.includes(company.status)) throw new TenantInactiveError(company.status);

  const features = toFeatureFlags(company.features);
  if (!features[moduleKey]) throw new ModuleNotEnabledError(moduleKey);
  return features;
}

/** Comprueba un permiso para un usuario arbitrario, resolviendo su rol efectivo. */
export async function requirePermission(userId: string, requiredPermission: Permission): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      company: { include: { features: true } },
      customRole: { select: { permissions: true } },
    },
  });
  if (!user || !user.isActive || !user.company) return false;
  if (!OPERATIONAL_STATUSES.includes(user.company.status)) return false;

  const permissions = resolvePermissions({
    role: user.role,
    customRolePermissions: user.customRole?.permissions ?? null,
    features: toFeatureFlags(user.company.features),
  });
  return permissions.includes(requiredPermission);
}

/**
 * Traduce los errores de autorización a un mensaje para el usuario, o `null` si
 * el error no es de autorización. Pensado para el `toErrorMessage` de cada
 * módulo: sin esto, un módulo revocado se reportaba como
 * "Ocurrió un error inesperado" y el cliente no sabía que era su plan.
 */
export function authErrorMessage(error: unknown): string | null {
  if (error instanceof AuthError) return error.message;
  if (error instanceof TenantInactiveError) return error.message;
  if (error instanceof ModuleNotEnabledError) {
    return 'Módulo no incluido en tu plan actual. Contacta al administrador para habilitarlo';
  }
  return null;
}

/** Flags de una empresa sin exigir que esté operativa (uso: panel superadmin). */
export async function getCompanyFeatures(companyId: string): Promise<CompanyFeatureFlags> {
  const features = await prisma.companyFeatures.findUnique({ where: { companyId } });
  return features ? toFeatureFlags(features) : { ...DEFAULT_FEATURES };
}
