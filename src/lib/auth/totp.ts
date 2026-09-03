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

/** 10 códigos de 10 caracteres hex — suficiente entropía, cómodos de transcribir a mano si hace falta. */
export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => crypto.randomBytes(5).toString('hex'));
}
