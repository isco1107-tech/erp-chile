import { z } from 'zod';
import { validateRut } from '@/lib/chile/rut';
import { MODULE_KEYS, type FeatureKey } from '@/lib/auth/modules';
import { passwordPolicySchema } from '@/lib/auth/password-policy';

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

/** Planes de referencia: precargan flags y límites al crear una empresa. */
export const PLAN_PRESETS = {
  Starter: {
    maxUsers: 3,
    maxWarehouses: 1,
    features: {
      hasInventory: true,
      hasPmpCosting: true,
      hasDteBilling: false,
      hasPurchases: false,
      hasTreasury: false,
      hasAdvancedReports: false,
      hasMultipleWarehouses: false,
      hasPos: false,
      hasAccounting: false,
      hasCrm: false,
      hasEventProjects: false,
      hasSponsorships: false,
      hasFeeDocuments: false,
      hasCandidates: false,
      hasOrgChart: false,
      hasLiveProduction: false,
      hasJudging: false,
      // Apagados por defecto en todos los planes, mismo criterio que hasCrm:
      // ningún preset activa un módulo nuevo, el superadmin lo prende a mano.
      hasMultiCompany: false,
      hasBudgets: false,
      hasPromissoryNotes: false,
      hasInstallmentPlans: false,
      hasTicketing: false,
      hasPublicVoting: false,
      hasIntelligence: false,
      hasSalesPipeline: false,
      hasPayroll: false,
      hasFixedAssets: false,
      hasExpenseReports: false,
    },
  },
  Profesional: {
    maxUsers: 10,
    maxWarehouses: 3,
    features: {
      hasInventory: true,
      hasPmpCosting: true,
      hasDteBilling: true,
      hasPurchases: true,
      hasTreasury: false,
      hasAdvancedReports: false,
      hasMultipleWarehouses: true,
      hasPos: true,
      hasAccounting: false,
      hasCrm: false,
      hasEventProjects: false,
      hasSponsorships: false,
      hasFeeDocuments: false,
      hasCandidates: false,
      hasOrgChart: false,
      hasLiveProduction: false,
      hasJudging: false,
      // Apagados por defecto en todos los planes, mismo criterio que hasCrm:
      // ningún preset activa un módulo nuevo, el superadmin lo prende a mano.
      hasMultiCompany: false,
      hasBudgets: false,
      hasPromissoryNotes: false,
      hasInstallmentPlans: false,
      hasTicketing: false,
      hasPublicVoting: false,
      hasIntelligence: false,
      hasSalesPipeline: false,
      hasPayroll: false,
      hasFixedAssets: false,
      hasExpenseReports: false,
    },
  },
  Enterprise: {
    maxUsers: 50,
    maxWarehouses: 20,
    features: {
      hasInventory: true,
      hasPmpCosting: true,
      hasDteBilling: true,
      hasPurchases: true,
      hasTreasury: true,
      hasAdvancedReports: true,
      hasMultipleWarehouses: true,
      hasPos: true,
      hasAccounting: true,
      // Apagado por defecto incluso en el plan más alto: es un módulo nuevo
      // que ninguna empresa debe recibir activado hasta que el superadmin lo
      // prenda a propósito (ver comentario en CompanyFeatures.hasCrm).
      hasCrm: false,
      hasEventProjects: false,
      hasSponsorships: false,
      hasFeeDocuments: false,
      hasCandidates: false,
      hasOrgChart: false,
      hasLiveProduction: false,
      hasJudging: false,
      // Apagados por defecto en todos los planes, mismo criterio que hasCrm:
      // ningún preset activa un módulo nuevo, el superadmin lo prende a mano.
      hasMultiCompany: false,
      hasBudgets: false,
      hasPromissoryNotes: false,
      hasInstallmentPlans: false,
      hasTicketing: false,
      hasPublicVoting: false,
      hasIntelligence: false,
      hasSalesPipeline: false,
      hasPayroll: false,
      hasFixedAssets: false,
      hasExpenseReports: false,
    },
  },
} as const satisfies Record<string, { maxUsers: number; maxWarehouses: number; features: Record<FeatureKey, boolean> }>;

export const PLAN_NAMES = Object.keys(PLAN_PRESETS) as Array<keyof typeof PLAN_PRESETS>;

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
  adminPassword: passwordPolicySchema,
});

export type CompanyCreateInput = z.infer<typeof companyCreateSchema>;

export const companyPlanUpdateSchema = z.object({
  planName: z.string().min(1, 'Seleccione un plan'),
  maxUsers: z.number().int().min(1, 'Debe permitir al menos 1 usuario'),
  maxWarehouses: z.number().int().min(1, 'Debe permitir al menos 1 bodega'),
  features: companyFeaturesSchema,
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
