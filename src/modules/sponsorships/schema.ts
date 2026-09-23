import { z } from 'zod';

export const SPONSORSHIP_TIERS = [
  'TITULAR_MAIN_SPONSOR',
  'GOLD',
  'SILVER',
  'COPPER',
  'BRONZE',
  'OFFICIAL_SPONSOR',
  'MEDIA_PARTNER',
  'CANJE_BARTER',
] as const;

export const SPONSORSHIP_TIER_LABELS: Record<(typeof SPONSORSHIP_TIERS)[number], string> = {
  TITULAR_MAIN_SPONSOR: 'Auspiciador Principal',
  GOLD: 'Gold',
  SILVER: 'Silver',
  COPPER: 'Cobre',
  BRONZE: 'Bronce',
  OFFICIAL_SPONSOR: 'Auspiciador Oficial',
  MEDIA_PARTNER: 'Media Partner',
  CANJE_BARTER: 'Canje/Barter',
};

export const SPONSORSHIP_STATUSES = ['PROPOSAL', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const;

export const SPONSORSHIP_STATUS_LABELS: Record<(typeof SPONSORSHIP_STATUSES)[number], string> = {
  PROPOSAL: 'Propuesta',
  CONFIRMED: 'Confirmado',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

/**
 * `isBarter`/`status` usan `.default()` a propósito: al envolver este schema en
 * `.partial()` para el update, Zod NO aplica el default sobre un campo
 * omitido (queda `undefined`, que Prisma ignora en el `data` del update) —
 * solo se activa en la creación, que es donde se necesita el valor por
 * omisión.
 */
const sponsorshipContractShape = z.object({
  projectId: z.string().min(1, 'Seleccione un proyecto'),
  contactId: z.string().min(1, 'Seleccione una marca'),
  tier: z.enum(SPONSORSHIP_TIERS, 'Selecciona un tier de auspicio'),
  isBarter: z.boolean().default(false),
  cashAmount: z.number().int('El monto debe ser un número entero').nonnegative('El monto no puede ser negativo').default(0),
  barterValuation: z
    .number()
    .int('La valorización debe ser un número entero')
    .nonnegative('La valorización no puede ser negativa')
    .default(0),
  barterDescription: z.string().optional(),
  status: z.enum(SPONSORSHIP_STATUSES).default('PROPOSAL'),
  notes: z.string().optional(),
});

// Repetido server-side a propósito: la UI ya impide guardar un contrato sin
// aporte monetario ni de canje, pero el schema es lo único que corre también
// si se llama la Server Action directo (sin pasar por el form). Va sobre el
// `.object()` base, no sobre el `.partial()` de abajo: en la actualización un
// contrato ya creado puede editarse sin tocar `cashAmount`/`isBarter`.
export const sponsorshipContractCreateSchema = sponsorshipContractShape.refine(
  (data) => data.isBarter || data.cashAmount > 0,
  { message: 'Ingresa un monto en efectivo, o marca el contrato como canje/barter', path: ['cashAmount'] }
);

export const sponsorshipContractUpdateSchema = sponsorshipContractShape.partial();

export type SponsorshipContractCreateInput = z.infer<typeof sponsorshipContractCreateSchema>;
export type SponsorshipContractUpdateInput = z.infer<typeof sponsorshipContractUpdateSchema>;

export const SPONSORSHIP_DELIVERABLE_TYPES = ['MENCION', 'BACKSTAGE', 'PAUTA', 'OTRO'] as const;

export const SPONSORSHIP_DELIVERABLE_TYPE_LABELS: Record<(typeof SPONSORSHIP_DELIVERABLE_TYPES)[number], string> = {
  MENCION: 'Mención',
  BACKSTAGE: 'Backstage',
  PAUTA: 'Pauta',
  OTRO: 'Otro',
};

export const deliverableCreateSchema = z.object({
  title: z.string().min(1, 'El título del entregable es obligatorio'),
  type: z.enum(SPONSORSHIP_DELIVERABLE_TYPES).default('OTRO'),
  dueDate: z.coerce.date().nullable().optional(),
  proofUrl: z.string().optional(),
});

export type DeliverableCreateInput = z.infer<typeof deliverableCreateSchema>;

export const sponsorshipPaymentSchema = z.object({
  paidAmount: z.number().int('El monto debe ser un número entero').nonnegative('El monto no puede ser negativo'),
  notes: z.string().optional(),
});

export type SponsorshipPaymentInput = z.infer<typeof sponsorshipPaymentSchema>;

// ---------------------------------------------------------------------------
// Tarifario de auspicios (SponsorshipPackage)
// ---------------------------------------------------------------------------

export const sponsorshipPackageSchema = z.object({
  projectId: z.string().min(1, 'Seleccione un certamen'),
  tier: z.enum(SPONSORSHIP_TIERS, 'Selecciona el nivel del plan'),
  name: z.string().trim().min(2, 'Ponle un nombre al plan').max(120),
  price: z.number().int('El precio debe ser un número entero').min(0, 'El precio no puede ser negativo').max(100_000_000_000),
  maxSlots: z.number().int().min(1, 'Los cupos deben ser al menos 1').max(1000).nullable().optional(),
  /** Un beneficio por línea; cada uno se convierte en entregable al firmar. */
  benefits: z.array(z.string().trim().min(1).max(200)).max(40).default([]),
  description: z.string().trim().max(2000).optional(),
  isPublic: z.boolean().default(true),
  showPricePublic: z.boolean().default(false),
  order: z.number().int().min(0).max(1000).default(0),
});

export const sponsorshipPackageUpdateSchema = sponsorshipPackageSchema.omit({ projectId: true });

export type SponsorshipPackageInput = z.infer<typeof sponsorshipPackageSchema>;
export type SponsorshipPackageUpdateInput = z.infer<typeof sponsorshipPackageUpdateSchema>;
