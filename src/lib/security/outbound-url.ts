import dns from 'dns';

/**
 * Validación de destino para URLs que el servidor va a `fetch()` por cuenta
 * propia, sin que un humano las abra en su navegador (acciones CALL_WEBHOOK
 * del motor de automatizaciones). Sin esto, cualquier usuario con permiso
 * `automation:manage` podría apuntar una regla a `http://169.254.169.254/...`
 * o a un servicio interno de la VPC y usar este servidor como oráculo SSRF —
 * mismo riesgo que documenta `src/lib/security/blob-url.ts` para descargas.
 *
 * Dos capas, ninguna perfecta por separado:
 * 1. `isSafeOutboundWebhookUrl` — chequeo estático (protocolo, IP literal
 *    prohibida) que corre al GUARDAR la regla, para rechazar el caso obvio
 *    de inmediato en el formulario.
 * 2. `assertResolvesToPublicAddress` — resuelve el DNS al momento de
 *    EJECUTAR el webhook y valida la IP resuelta. Esto es una defensa
 *    contra "DNS rebinding" (un hostname público que hoy resuelve a algo
 *    externo y mañana a `127.0.0.1`), no una prueba de que el mismo
 *    hostname no pueda resolver distinto un milisegundo después de
 *    validado — hay una ventana TOCTOU inherente a usar `fetch()` sin
 *    control de socket a bajo nivel. Es la misma limitación aceptada por la
 *    mayoría de mitigaciones SSRF basadas en `fetch`; para cerrarla del
 *    todo haría falta un agente HTTP que fije la IP verificada al conectar.
 */

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain', '0.0.0.0']);

export function isSafeOutboundWebhookUrl(raw: string): { ok: true } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'No es una URL válida' };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'El webhook debe usar https://' };
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return { ok: false, reason: 'No se permite apuntar a un host interno' };
  }

  if (isIpLiteral(hostname) && isPrivateOrReservedIp(hostname)) {
    return { ok: false, reason: 'No se permite apuntar a una IP privada o reservada' };
  }

  return { ok: true };
}

/** Lanza si el hostname resuelve a una dirección privada/reservada. Se llama justo antes de cada `fetch()` de un webhook, nunca solo al guardar la regla. */
export async function assertResolvesToPublicAddress(hostname: string): Promise<void> {
  if (isIpLiteral(hostname)) {
    if (isPrivateOrReservedIp(hostname)) throw new Error('El host resuelve a una dirección privada o reservada');
    return;
  }

  const addresses = await dns.promises.lookup(hostname, { all: true });
  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new Error(`El host "${hostname}" resuelve a una dirección privada o reservada (${address})`);
    }
  }
}

function isIpLiteral(hostname: string): boolean {
  return /^[0-9.]+$/.test(hostname) || hostname.includes(':');
}

function isPrivateOrReservedIp(address: string): boolean {
  if (address.includes(':')) return isPrivateOrReservedIpv6(address);

  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true; // no parseable → tratar como no seguro

  const [a, b] = parts;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local, incluye 169.254.169.254 (metadata de nube)
  if (a === 0) return true; // "esta red"
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT compartido
  return false;
}

function isPrivateOrReservedIpv6(address: string): boolean {
  // `URL.hostname` serializa un host IPv6 entre corchetes (`[::1]`) — hay que
  // quitarlos antes de comparar contra la forma canónica de la dirección.
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === '::1') return true; // loopback
  if (normalized === '::') return true;

  if (normalized.startsWith('::ffff:')) {
    // Nunca queda en forma dotted-decimal: Node normaliza el literal IPv4
    // dentro de un host IPv6 a 2 grupos hexadecimales (`::ffff:169.254.169.254`
    // se serializa como `::ffff:a9fe:a9fe`, nunca con puntos). Pasar ese sufijo
    // tal cual a `isPrivateOrReservedIp` (que espera "a.b.c.d") lo dejaba pasar
    // siempre — un bypass real de la IP de metadata de la nube. Hay que
    // reconstruir los 4 octetos desde los 2 grupos hex antes de comparar.
    const ipv4 = ipv4FromMappedIpv6Suffix(normalized.slice('::ffff:'.length));
    if (!ipv4) return true; // forma irreconocible → fail-closed, no fail-open
    return isPrivateOrReservedIp(ipv4);
  }

  if (normalized.startsWith('fe80:') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true; // link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local (fc00::/7)
  return false;
}

/** Acepta tanto la forma dotted-decimal (`::ffff:169.254.169.254`) como la forma de 2 grupos hex (`::ffff:a9fe:a9fe`) en la que Node realmente serializa el host de una URL. `null` si no matchea ninguna. */
function ipv4FromMappedIpv6Suffix(suffix: string): string | null {
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(suffix)) return suffix;

  const match = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(suffix);
  if (!match) return null;
  const hi = parseInt(match[1], 16);
  const lo = parseInt(match[2], 16);
  if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi > 0xffff || lo > 0xffff) return null;
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}
