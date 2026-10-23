import { z } from 'zod';
import { validateRut } from '@/lib/chile/rut';
import { MODULE_KEYS, type FeatureKey } from '@/lib/auth/modules';
import { passwordPolicySchema } from '@/lib/auth/password-policy';
import { MAX_WAREHOUSES, PLAN_NAMES } from '@/lib/pricing/presets';
import { MAX_WEB_SITES_CEILING } from '@/lib/web-sites/constants';

/** Tope de sitios web de la empresa: opcional para no obligar a los llamadores anteriores; sin valor no se toca. */
const maxWebSites = z.number().int().min(1, 'Debe permitir al menos 1 sitio web').max(MAX_WEB_SITES_CEILING, `El máximo de sitios web es ${MAX_WEB_SITES_CEILING}`).optional();

export const TENANT_STATUSES = ['ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED'] as const;

const featureShape = MODULE_KEYS.reduce<Record<string, z.ZodBoolean>>((shape, key) => {
  shape[key] = z.boolean();
  return shape;
}, {});

export const companyFeaturesSchema = z.object(featureShape) as z.ZodType<Record<FeatureKey, boolean>>;

export const companyCreateSchema = z.object({
  rut: z.string().refine(validateRut, 'El RUT de la empresa no es válido'),
  businessName: z.string().min(1, 'Ingrese la razón social'),
  email: z.string().email('Correo de la empresa inválido').optional().or(z.literal('')),
  // Al crear solo se ofrecen los planes vigentes. Al editar (más abajo) se
  // acepta cualquier nombre: las empresas con un plan anterior lo conservan.
  planName: z.string().refine((name) => PLAN_NAMES.includes(name), 'Selecciona uno de los planes disponibles'),
  maxUsers: z.number().int().min(1, 'Debe permitir al menos 1 usuario'),
  maxWarehouses: z.number().int().min(1, 'Debe permitir al menos 1 bodega').max(MAX_WAREHOUSES, `El máximo de bodegas es ${MAX_WAREHOUSES}`),
  maxWebSites,
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
  maxWarehouses: z.number().int().min(1, 'Debe permitir al menos 1 bodega').max(MAX_WAREHOUSES, `El máximo de bodegas es ${MAX_WAREHOUSES}`),
  maxWebSites,
  features: companyFeaturesSchema,
  /** Pantallas del menú apagadas para la empresa (se sanean contra el registro al guardar). */
  disabledNavItems: z.array(z.string().max(80)).max(300).optional(),
});

export type CompanyPlanUpdateInput = z.infer<typeof companyPlanUpdateSchema>;

/** Confirmación del borrado permanente de un tenant: solo el código TOTP de 6 dígitos del propio superadmin. */
export const deleteTenantSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Debe ser un código de 6 dígitos'),
});

export type DeleteTenantInput = z.infer<typeof deleteTenantSchema>;
