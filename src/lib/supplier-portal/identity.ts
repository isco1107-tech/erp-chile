import { z } from 'zod';

/** Chilean mobile numbers may be written locally; other countries must include +country. */
export function normalizeSellerPhone(value: string): string | null {
  const raw = value.trim();
  if (!/^\+?[\d\s().-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  if (/^9\d{8}$/.test(digits)) return `+56${digits}`;
  if (/^569\d{8}$/.test(digits)) return `+${digits}`;
  if (raw.startsWith('+') && /^[1-9]\d{7,14}$/.test(digits))
    return `+${digits}`;
  return null;
}
export const sellerPhoneSchema = z
  .string()
  .trim()
  .max(30)
  .transform((value, ctx) => {
    const phone = normalizeSellerPhone(value);
    if (!phone) {
      ctx.addIssue({
        code: 'custom',
        message: 'Escribe un celular válido, por ejemplo +56 9 1234 5678',
      });
      return z.NEVER;
    }
    return phone;
  });
export const sellerEmailSchema = z
  .string()
  .trim()
  .max(254)
  .email('Escribe un correo válido')
  .transform((value) => value.toLowerCase());
export const sellerIdentifierSchema = z.union(
  [sellerEmailSchema, sellerPhoneSchema],
  { error: 'Escribe un correo o celular válido con código de país' },
);
export const sellerInvitationSchema = z.union(
  [
    z
      .object({
        name: z
          .string()
          .trim()
          .min(2, 'Escribe el nombre de la persona')
          .max(120),
        email: sellerEmailSchema,
      })
      .strict(),
    z
      .object({
        name: z
          .string()
          .trim()
          .min(2, 'Escribe el nombre de la persona')
          .max(120),
        phone: sellerPhoneSchema,
      })
      .strict(),
  ],
  {
    error: 'Completa el nombre y un correo o celular válido para la invitación',
  },
);
export type SellerInvitationInput = z.infer<typeof sellerInvitationSchema>;
export interface SellerInvitationDelivery {
  membershipId: string;
  delivery: 'sent' | 'logged' | 'failed' | 'whatsapp';
  whatsappUrl?: string;
}
export function sellerDeliveryMessage(
  status: SellerInvitationDelivery['delivery'],
): string {
  if (status === 'sent')
    return 'Invitación enviada por correo. La persona debe activar su acceso y crear su contraseña.';
  if (status === 'whatsapp')
    return 'Invitación creada. Compártela por WhatsApp para que la persona active su acceso.';
  if (status === 'logged')
    return 'Invitación creada, pero este servidor no tiene el envío de correos configurado. Puedes reenviarla desde la ficha cuando esté disponible.';
  return 'Invitación creada, pero el correo no pudo enviarse. Reintenta desde la ficha del seller.';
}
