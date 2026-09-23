export type CompanySiiApiConfig = {
  enabled: boolean;
  baseUrl: string | null;
  apiKey: string | null;
  apiSecret: string | null;
};

export function buildSiiApiUrl(baseUrl: string | null, path: string): string {
  const normalizedBase = (baseUrl ?? '').trim().replace(/\\+$/, '');
  if (!normalizedBase) {
    throw new Error('Falta la URL base de la API del SII');
  }

  const normalizedPath = path.trim();
  if (!normalizedPath) {
    throw new Error('Falta el endpoint de la API del SII');
  }

  const cleanPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;

  return `${normalizedBase.replace(/\/+$/, '')}${cleanPath}`;
}

export function buildSiiApiHeaders(apiKey: string | null, apiSecret: string | null): Record<string, string> {
  const key = (apiKey ?? '').trim();
  const secret = (apiSecret ?? '').trim();

  if (!key) {
    throw new Error('Falta la API Key de la empresa');
  }

  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${key}`,
    'X-API-Key': key,
    ...(secret ? { 'X-API-Secret': secret } : {}),
  };
}

export async function getCompanySiiApiConfig(companyId: string): Promise<CompanySiiApiConfig | null> {
  const { prisma } = await import('@/lib/prisma');
  const { decryptSiiCredential } = await import('./crypto');
  const settings = await prisma.companySettings.findUnique({
    where: { companyId },
    select: {
      siiApiEnabled: true,
      siiApiBaseUrl: true,
      siiApiKey: true,
      siiApiSecret: true,
    },
  });

  if (!settings) return null;

  return {
    enabled: Boolean(settings.siiApiEnabled),
    baseUrl: settings.siiApiBaseUrl ?? null,
    apiKey: settings.siiApiKey ? decryptSiiCredential(settings.siiApiKey) : null,
    apiSecret: settings.siiApiSecret ? decryptSiiCredential(settings.siiApiSecret) : null,
  };
}

export async function pingSiiApi(companyId: string, endpoint = '/status'): Promise<{ ok: boolean; status: number; data?: unknown }> {
  const config = await getCompanySiiApiConfig(companyId);
  if (!config || !config.enabled || !config.baseUrl || !config.apiKey) {
    throw new Error('La empresa no tiene la API del SII configurada o activada');
  }

  const url = buildSiiApiUrl(config.baseUrl, endpoint);
  const headers = buildSiiApiHeaders(config.apiKey, config.apiSecret);

  const response = await fetch(url, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  const payload = await response.text();
  let data: unknown = payload;
  try {
    data = payload ? JSON.parse(payload) : null;
  } catch {
    // JSON opcional; si no lo responde, lo dejamos como texto
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}
