import { z } from 'zod';

// Repite el catálogo de `src/modules/treasury/schema.ts` (`PAYMENT_METHOD_TYPES`)
// en vez de importarlo cruzado entre módulos — mismo criterio que
// `src/modules/payment-plans/schema.ts` y `src/modules/promissory-notes/schema.ts`.
export const PAYMENT_METHOD_TYPES = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'CHEQUE', 'OTRO'] as const;

export const PAYMENT_METHOD_TYPE_LABELS: Record<(typeof PAYMENT_METHOD_TYPES)[number], string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA_DEBITO: 'Tarjeta de débito',
  TARJETA_CREDITO: 'Tarjeta de crédito',
  CHEQUE: 'Cheque',
  OTRO: 'Otro',
};

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

export type SponsorshipTierKey = (typeof SPONSORSHIP_TIERS)[number];

// ---------------------------------------------------------------------------
// Categorías: las fijas (enum `SponsorshipTier`) + las propias de cada certamen
// (`SponsorshipCategory`). Un contrato, plan o negocio lleva UNA de las dos.
// ---------------------------------------------------------------------------

/** Lo mínimo que hace falta para nombrar la categoría de un registro. */
export interface SponsorshipCategoryRef {
  tier?: SponsorshipTierKey | null;
  category?: { name: string } | null;
}

/** Nombre a mostrar: el de la categoría propia si la hay, si no el de la fija. */
export function sponsorshipCategoryLabel(ref: SponsorshipCategoryRef): string {
  if (ref.category?.name) return ref.category.name;
  if (ref.tier) return SPONSORSHIP_TIER_LABELS[ref.tier];
  return 'Sin categoría';
}

export function isSponsorshipTier(value: unknown): value is SponsorshipTierKey {
  return typeof value === 'string' && (SPONSORSHIP_TIERS as readonly string[]).includes(value);
}

/** Valor de un `<select>` que mezcla fijas y propias: `tier:GOLD` o `cat:<id>`. */
export function encodeCategoryChoice(choice: { tier?: string | null; categoryId?: string | null }): string {
  if (choice.categoryId) return `cat:${choice.categoryId}`;
  if (choice.tier) return `tier:${choice.tier}`;
  return '';
}

export function decodeCategoryChoice(value: string): { tier?: SponsorshipTierKey; categoryId?: string } {
  if (value.startsWith('cat:') && value.length > 4) return { categoryId: value.slice(4) };
  if (value.startsWith('tier:')) {
    const tier = value.slice(5);
    if (isSponsorshipTier(tier)) return { tier };
  }
  return {};
}

/** Exactamente una de las dos: la fija o la propia del certamen. */
export function hasExactlyOneCategory(value: { tier?: unknown; categoryId?: unknown }): boolean {
  return Boolean(value.tier) !== Boolean(value.categoryId);
}

export const CATEGORY_REQUIRED_MESSAGE = 'Elige la categoría del auspicio';

export const SPONSORSHIP_CATEGORY_NAME_MAX = 60;

const categoryNameSchema = z
  .string()
  .trim()
  .min(2, 'Ponle un nombre de al menos 2 letras a la categoría')
  .max(SPONSORSHIP_CATEGORY_NAME_MAX, `El nombre no puede pasar de ${SPONSORSHIP_CATEGORY_NAME_MAX} caracteres`);

export const sponsorshipCategoryCreateSchema = z.object({
  projectId: z.string().min(1, 'Seleccione un certamen'),
  name: categoryNameSchema,
});

export const sponsorshipCategoryRenameSchema = z.object({ name: categoryNameSchema });

/** Compara sin tildes ni mayúsculas: "Vestuario" y "vestuário" son la misma categoría. */
export function normalizeCategoryName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** ¿El nombre choca con una categoría fija? (ej. "Gold", "Cobre", "Media Partner"). */
export function collidesWithFixedCategory(name: string): boolean {
  const wanted = normalizeCategoryName(name);
  return SPONSORSHIP_TIERS.some((tier) => normalizeCategoryName(SPONSORSHIP_TIER_LABELS[tier]) === wanted);
}

export interface SponsorGroupInput {
  tier?: SponsorshipTierKey | null;
  category?: { id: string; name: string; order: number } | null;
  name: string;
}

/**
 * Auspiciadores agrupados por categoría para el sitio público: primero las
 * fijas (de mayor a menor nivel, en el orden del catálogo), después las propias
 * del certamen en el orden en que se crearon. Un grupo sin marcas no aparece y
 * una marca repetida en una categoría se muestra una sola vez.
 */
export function groupSponsorsByCategory(rows: SponsorGroupInput[]): Array<{ key: string; label: string; names: string[] }> {
  const namesOf = (subset: SponsorGroupInput[]) =>
    [...new Set(subset.map((r) => r.name))].sort((a, b) => a.localeCompare(b, 'es-CL'));

  const fixed = SPONSORSHIP_TIERS.map((tier) => ({
    key: tier as string,
    label: SPONSORSHIP_TIER_LABELS[tier],
    names: namesOf(rows.filter((r) => !r.category && r.tier === tier)),
  }));

  const custom = new Map<string, { name: string; order: number }>();
  for (const r of rows) if (r.category) custom.set(r.category.id, r.category);
  const customGroups = [...custom.entries()]
    .sort(([, a], [, b]) => a.order - b.order || a.name.localeCompare(b.name, 'es-CL'))
    .map(([id, category]) => ({
      key: `cat:${id}`,
      label: category.name,
      names: namesOf(rows.filter((r) => r.category?.id === id)),
    }));

  return [...fixed, ...customGroups].filter((group) => group.names.length > 0);
}

export const SPONSORSHIP_STATUSES = ['PROPOSAL', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const;

/**
 * Si un cambio de estado de contrato convierte a la marca en sponsor aceptado
 * (dispara el correo de bienvenida): pasar a `CONFIRMED` desde una propuesta,
 * desde cancelado o al crear el contrato ya confirmado. Pasar de
 * `COMPLETED` a `CONFIRMED` no es una aceptación nueva.
 */
export function isSponsorAcceptance(
  previous: (typeof SPONSORSHIP_STATUSES)[number] | null,
  next: (typeof SPONSORSHIP_STATUSES)[number]
): boolean {
  return next === 'CONFIRMED' && previous !== 'CONFIRMED' && previous !== 'COMPLETED';
}

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
  tier: z.enum(SPONSORSHIP_TIERS).optional(),
  categoryId: z.string().min(1).optional(),
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
export const sponsorshipContractCreateSchema = sponsorshipContractShape
  .refine((data) => hasExactlyOneCategory(data), { message: CATEGORY_REQUIRED_MESSAGE, path: ['tier'] })
  .refine((data) => data.isBarter || data.cashAmount > 0, {
    message: 'Ingresa un monto en efectivo, o marca el contrato como canje/barter',
    path: ['cashAmount'],
  });

// En la edición la categoría puede omitirse (no se toca); si viene, es una sola.
export const sponsorshipContractUpdateSchema = sponsorshipContractShape
  .partial()
  .refine((data) => (data.tier === undefined && data.categoryId === undefined) || hasExactlyOneCategory(data), {
    message: CATEGORY_REQUIRED_MESSAGE,
    path: ['tier'],
  });

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
  // Solo se usa para el `Payment` de tesorería que genera el incremento del
  // cobro (ver `updateSponsorshipPayment`); el contrato en sí no guarda medio
  // de pago. Default a TRANSFERENCIA: es el medio más común para un aporte de marca.
  method: z.enum(PAYMENT_METHOD_TYPES).default('TRANSFERENCIA'),
});

export type SponsorshipPaymentInput = z.infer<typeof sponsorshipPaymentSchema>;

// ---------------------------------------------------------------------------
// Tarifario de auspicios (SponsorshipPackage)
// ---------------------------------------------------------------------------

const sponsorshipPackageShape = z.object({
  projectId: z.string().min(1, 'Seleccione un certamen'),
  tier: z.enum(SPONSORSHIP_TIERS).optional(),
  categoryId: z.string().min(1).optional(),
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

export const sponsorshipPackageSchema = sponsorshipPackageShape.refine((data) => hasExactlyOneCategory(data), {
  message: 'Elige el nivel del plan',
  path: ['tier'],
});

export const sponsorshipPackageUpdateSchema = sponsorshipPackageShape
  .omit({ projectId: true })
  .refine((data) => hasExactlyOneCategory(data), { message: 'Elige el nivel del plan', path: ['tier'] });

export type SponsorshipPackageInput = z.infer<typeof sponsorshipPackageSchema>;
export type SponsorshipPackageUpdateInput = z.infer<typeof sponsorshipPackageUpdateSchema>;
