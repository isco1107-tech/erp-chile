import { z } from 'zod';
import { validateRut } from '@/lib/chile/rut';
import { MODULE_KEYS, type FeatureKey } from '@/lib/auth/modules';
import { passwordPolicySchema } from '@/lib/auth/password-policy';
import { PACKAGES, PACKAGE_NAMES, packageFeatureFlags, type PackageName } from '@/lib/pricing/catalog';

export const TENANT_STATUSES = ['ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED'] as const;

export const TENANT_STATUS_LABELS: Record<(typeof TENANT_STATUSES)[number], string> = {
  ACTIVE: 'Activa',
  TRIAL: 'Prueba',
  SUSPENDED: 'Suspendida',
  CANCELLED: 'Cancelada',
};

export const TENANT_STATUS_BADGE_CLASS: Record<(typeof TENANT_STATUSES)[number], string> = {
  ACTIVE: 'bg-green-600/10 text-green-600',
  TRIAL: 'bg-blue-600/10 text-blue-600',
  SUSPENDED: 'bg-amber-600/10 text-amber-600',
  CANCELLED: 'bg-destructive/10 text-destructive',
};

/**
 * Planes de referencia: precargan flags y límites al crear una empresa. Salen
 * del catálogo comercial (`src/lib/pricing/catalog.ts`), que es la fuente de
 * los paquetes y sus precios en UF. Ningún módulo fuera del paquete se activa:
 * el superadmin lo prende a mano.
 */
export const PLAN_PRESETS = Object.fromEntries(
  PACKAGE_NAMES.map((name) => [
    name,
    {
      maxUsers: PACKAGES[name].maxUsers,
      maxWarehouses: PACKAGES[name].maxWarehouses,
      features: packageFeatureFlags(name),
    },
  ])
) as Record<PackageName, { maxUsers: number; maxWarehouses: number; features: Record<FeatureKey, boolean> }>;

export const PLAN_NAMES: readonly PackageName[] = PACKAGE_NAMES;

const featureShape = MODULE_KEYS.reduce<Record<string, z.ZodBoolean>>((shape, key) => {
  shape[key] = z.boolean();
  return shape;
}, {});

export const companyFeaturesSchema = z.object(featureShape) as z.ZodType<Record<FeatureKey, boolean>>;

export const companyCreateSchema = z.object({
  rut: z.string().refine(validateRut, 'El RUT de la empresa no es válido'),
  businessName: z.string().min(1, 'Ingrese la razón social'),
  email: z.string().email('Correo de la empresa inválido').optional().or(z.literal('')),
  planName: z.string().min(1, 'Seleccione un plan'),
  maxUsers: z.number().int().min(1, 'Debe permitir al menos 1 usuario'),
  maxWarehouses: z.number().int().min(1, 'Debe permitir al menos 1 bodega'),
  status: z.enum(TENANT_STATUSES, 'Selecciona un estado de cuenta'),
  features: companyFeaturesSchema,
  // Primer usuario administrador del tenant. Sin él la empresa nace inaccesible.
  adminName: z.string().min(1, 'Ingrese el nombre del administrador'),
  adminEmail: z.string().email('Correo del administrador inválido'),
  // Opcional solo porque un correo que ya tiene cuenta se vincula con su
  // contraseña actual; para una cuenta nueva `createTenant` la exige.
  adminPassword: passwordPolicySchema.optional().or(z.literal('').transform(() => undefined)),
});

export type CompanyCreateInput = z.infer<typeof companyCreateSchema>;

export const companyPlanUpdateSchema = z.object({
  planName: z.string().min(1, 'Seleccione un plan'),
  maxUsers: z.number().int().min(1, 'Debe permitir al menos 1 usuario'),
  maxWarehouses: z.number().int().min(1, 'Debe permitir al menos 1 bodega'),
  features: companyFeaturesSchema,
  /** Pantallas del menú apagadas para la empresa (se sanean contra el registro al guardar). */
  disabledNavItems: z.array(z.string().max(80)).max(300).optional(),
});

export type CompanyPlanUpdateInput = z.infer<typeof companyPlanUpdateSchema>;

export const companyStatusSchema = z.object({
  status: z.enum(TENANT_STATUSES, 'Selecciona un estado de cuenta'),
});

/** Confirmación del borrado permanente de un tenant: solo el código TOTP de 6 dígitos del propio superadmin. */
export const deleteTenantSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Debe ser un código de 6 dígitos'),
});

export type DeleteTenantInput = z.infer<typeof deleteTenantSchema>;
