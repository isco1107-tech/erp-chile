/**
 * Matching de IPv4 exacta o rango CIDR contra la lista blanca de una
 * empresa. Solo IPv4: si el request llega por IPv6 (posible en Vercel según
 * cómo se conecte el cliente) y la lista está activa, se trata como no
 * permitido — más seguro que dejarlo pasar en silencio, aunque signifique
 * que un usuario legítimo por IPv6 quede bloqueado hasta que agregue su
 * rango. No hay soporte de rangos IPv6 hoy.
 */

function parseIPv4(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = (value << 8) | n;
  }
  return value >>> 0;
}

/** `null` si la entrada no es una IPv4 exacta ni un CIDR bien formado (exactamente `ip/prefijo`, sin segmentos extra). */
function parseEntry(entry: string): { ip: number; prefix: number } | null {
  const trimmed = entry.trim();
  const parts = trimmed.split('/');
  if (parts.length === 1) {
    const ip = parseIPv4(parts[0]!);
    return ip === null ? null : { ip, prefix: 32 };
  }
  if (parts.length !== 2) return null; // ej. "1.2.3.4/24/8" — rechazada, no se ignora el resto en silencio.
  const [rangeIp, prefixStr] = parts;
  const ip = parseIPv4(rangeIp!);
  const prefix = Number(prefixStr);
  if (ip === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  return { ip, prefix };
}

function matchesEntry(ipValue: number, entry: string): boolean {
  const parsed = parseEntry(entry);
  if (!parsed) return false;
  if (parsed.prefix === 0) return true;
  const mask = (0xffffffff << (32 - parsed.prefix)) >>> 0;
  return (ipValue & mask) === (parsed.ip & mask);
}

export function isIpAllowed(ip: string | null, allowlist: string[]): boolean {
  if (!ip) return false;
  const ipValue = parseIPv4(ip);
  if (ipValue === null) return false; // IPv6 u otro formato no soportado.
  return allowlist.some((entry) => matchesEntry(ipValue, entry));
}

/**
 * Confiable específicamente en Vercel: la documentación de la plataforma
 * garantiza que sobreescribe `x-forwarded-for` y no reenvía IPs externas
 * ("this restriction is in place to prevent IP spoofing") — un cliente no
 * puede inyectar su propio valor salvo que la cuenta tenga contratado
 * "Trusted Proxy" (feature Enterprise, no aplica hoy). Si el proyecto migra
 * a otro hosting o habilita un proxy propio delante de Vercel, esta
 * garantía deja de sostenerse y hay que revisar esto de nuevo.
 */
export function extractClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || null;
}

export function isValidIpAllowlistEntry(entry: string): boolean {
  return parseEntry(entry) !== null;
}
