import crypto from 'crypto';
import { captureMessage } from '@/lib/observability';

/**
 * Llaves de cifrado en reposo por módulo (CAF, credenciales de pasarelas, SII,
 * integraciones, mensajería), con separación de dominio: la llave es
 * `SHA-256("<dominio>:<secreto>")`, así que aunque dos módulos usen el mismo
 * secreto de origen, sus llaves son distintas.
 *
 * Cada módulo tiene su variable propia y, por compatibilidad, cae a otras
 * (hoy todas terminan en `TOTP_ENCRYPTION_KEY`). Antes la primera que existiera
 * servía para TODO, así que configurar la llave propia de un módulo dejaba
 * ilegible lo ya cifrado con la de respaldo. Ahora:
 *
 * - **Cifrar** usa siempre la primera disponible (la propia, si está).
 * - **Descifrar** prueba la propia y después cada respaldo: se puede configurar
 *   la llave propia de un módulo sin perder lo que ya estaba guardado; lo nuevo
 *   queda con la llave nueva y deja de depender de la compartida.
 *
 * En producción, usar la llave de respaldo se avisa a observabilidad una vez
 * por proceso: comprometer esa llave abriría todos los módulos a la vez.
 */

export interface DomainKeyring {
  /** Llave con que se cifra lo nuevo. Lanza si no hay ninguna configurada. */
  encryptionKey(): Buffer;
  /** Llaves con que se intenta descifrar, en orden. Lanza si no hay ninguna. */
  decryptionKeys(): Buffer[];
}

const warnedDomains = new Set<string>();

export function domainKeyring(domain: string, envNames: readonly [string, ...string[]], missingMessage: string): DomainKeyring {
  const keys = (): Buffer[] => {
    const secrets: string[] = [];
    for (const name of envNames) {
      const value = process.env[name];
      if (value && !secrets.includes(value)) secrets.push(value);
    }
    if (secrets.length === 0) throw new Error(missingMessage);
    if (process.env.NODE_ENV === 'production' && !process.env[envNames[0]] && !warnedDomains.has(domain)) {
      warnedDomains.add(domain);
      captureMessage(`cifrado: ${envNames[0]} no está configurada; ${domain} usa la llave compartida de respaldo`, 'warn', {
        module: 'seguridad',
        extra: { domain, recomendado: envNames[0] },
      });
    }
    return secrets.map((secret) => crypto.createHash('sha256').update(`${domain}:${secret}`).digest());
  };
  return {
    encryptionKey: () => keys()[0]!,
    decryptionKeys: keys,
  };
}

/**
 * Descifra probando cada llave del llavero. GCM autentica, así que una llave
 * equivocada lanza en vez de devolver basura; si ninguna sirve se relanza el
 * último error (dato alterado o llave perdida).
 */
export function decryptWithKeyring<T>(keyring: DomainKeyring, attempt: (key: Buffer) => T): T {
  let lastError: unknown = null;
  for (const key of keyring.decryptionKeys()) {
    try {
      return attempt(key);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No se pudo descifrar el dato');
}
