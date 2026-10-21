import { z } from 'zod';

/** Remitente y API key de Brevo. Sin `apiKey` solo se cambia el remitente de una cuenta ya conectada. */
export const brevoConfigSchema = z.object({
  apiKey: z.string().trim().min(20, 'La API key de Brevo parece incompleta').max(300, 'API key demasiado larga').optional(),
  fromName: z.string().trim().min(1, 'Escribe el nombre que verán quienes reciban tus correos').max(80, 'Nombre demasiado largo'),
  fromAddress: z.string().trim().toLowerCase().email('Correo remitente inválido').max(200, 'Correo demasiado largo'),
});

/** Token de ZapSign. Sin `token` solo se cambia el modo (producción / sandbox) de una cuenta ya conectada. */
export const zapsignConfigSchema = z.object({
  token: z.string().trim().min(10, 'El token de ZapSign parece incompleto').max(300, 'Token demasiado largo').optional(),
  sandbox: z.boolean(),
});
