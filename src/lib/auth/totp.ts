import crypto from 'crypto';
import { generateSecret, generateURI, verify } from 'otplib';

const ISSUER = 'Aether ERP';

export function generateTotpSecret(): string {
  return generateSecret();
}

export function buildTotpUri(secret: string, email: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret });
}

/** Tolerancia de ±30s (1 paso) para cubrir desfases de reloj razonables entre el celular y el servidor. */
export async function verifyTotpCode(secret: string, token: string): Promise<boolean> {
  const result = await verify({ secret, token, epochTolerance: 30 });
  return result.valid;
}

/**
 * Como `verifyTotpCode`, pero de UN SOLO USO: rechaza un código cuyo paso de
 * tiempo (30 s) ya se aceptó antes (`lastUsedStep`). Devuelve el paso aceptado
 * para guardarlo en `User.totpLastUsedStep`, o `null` si el código no sirve.
 * Sin esto, el mismo código valía ~90 s y quien lo veía o lo interceptaba
 * podía canjearlo de nuevo.
 */
export async function verifyTotpCodeOnce(secret: string, token: string, lastUsedStep: number | null): Promise<number | null> {
  const result = await verify({
    secret,
    token,
    epochTolerance: 30,
    ...(lastUsedStep !== null ? { afterTimeStep: lastUsedStep } : {}),
  });
  if (!result.valid) return null;
  // La verificación TOTP trae el paso aceptado; el tipo general (HOTP|TOTP) no lo declara.
  const step = (result as { timeStep?: unknown }).timeStep;
  return typeof step === 'number' ? step : null;
}

/** 10 códigos de 10 caracteres hex — suficiente entropía, cómodos de transcribir a mano si hace falta. */
export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => crypto.randomBytes(5).toString('hex'));
}
