import { decryptPaymentCredential, encryptPaymentCredential } from '../crypto';
import { genericWebhookProvider } from './providers/generic-webhook';
import { getnetProvider } from './providers/getnet';
import { manualProvider } from './providers/manual';
import { mercadopagoProvider } from './providers/mercadopago';
import { sumupProvider } from './providers/sumup';
import { transbankPosProvider } from './providers/transbank-pos';
import {
  UnknownTerminalProviderError,
  type ConfigFieldDescriptor,
  type PaymentTerminalProvider,
  type ProviderStatus,
  type TerminalCapability,
} from './types';

/**
 * Registro de proveedores de terminal de pago. Agregar uno nuevo es crear su
 * archivo en `providers/` con `defineProvider` y sumarlo a `BUILT_IN`; la
 * pantalla de configuración se genera sola desde `describeProviderForUi`.
 */

const providers = new Map<string, PaymentTerminalProvider>();

export function registerTerminalProvider(provider: PaymentTerminalProvider): void {
  if (providers.has(provider.id)) throw new Error(`Proveedor de terminal duplicado: "${provider.id}"`);
  providers.set(provider.id, provider);
}

const BUILT_IN: readonly PaymentTerminalProvider[] = [
  manualProvider,
  genericWebhookProvider,
  transbankPosProvider,
  getnetProvider,
  sumupProvider,
  mercadopagoProvider,
];
for (const provider of BUILT_IN) registerTerminalProvider(provider);

export function getTerminalProvider(id: string): PaymentTerminalProvider {
  const provider = providers.get(id);
  if (!provider) throw new UnknownTerminalProviderError(id);
  return provider;
}

export function hasTerminalProvider(id: string): boolean {
  return providers.has(id);
}

export function listTerminalProviders(): PaymentTerminalProvider[] {
  return [...providers.values()];
}

export function secretFieldKeys(provider: PaymentTerminalProvider): string[] {
  return provider.fields.filter((field) => field.kind === 'secret').map((field) => field.key);
}

export interface ProviderUiDescription {
  id: string;
  label: string;
  description: string;
  capabilities: readonly TerminalCapability[];
  status: ProviderStatus;
  fields: readonly ConfigFieldDescriptor[];
}

/** Lo que necesita la pantalla de configuración para dibujar el formulario del proveedor. */
export function describeProviderForUi(id: string): ProviderUiDescription {
  const provider = getTerminalProvider(id);
  return {
    id: provider.id,
    label: provider.label,
    description: provider.description,
    capabilities: provider.capabilities,
    status: provider.status,
    fields: provider.fields,
  };
}

// ---------------------------------------------------------------------------
// Persistencia de la configuración por empresa (sin tocar la base de datos).
// El servicio guarda `publicConfig` (JSON) y `encryptedSecrets` (JSON de
// clave -> "iv.tag.cifrado") donde corresponda; acá solo se parte y se une.
// ---------------------------------------------------------------------------

export interface StoredProviderConfig {
  providerId: string;
  publicConfig: Record<string, unknown>;
  /** Clave del campo secreto -> valor cifrado con `encryptPaymentCredential`. */
  encryptedSecrets: Record<string, string>;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/**
 * Valida la configuración que llegó de la pantalla y la separa en parte
 * pública + secretos cifrados. Un secreto en blanco conserva el ya guardado
 * (`existing`), para poder editar el resto sin volver a escribir la clave.
 * Lanza `ZodError` si la configuración no cumple el esquema del proveedor.
 */
export function prepareConfigForStorage(
  providerId: string,
  input: Record<string, unknown>,
  existing?: StoredProviderConfig | null
): StoredProviderConfig {
  const provider = getTerminalProvider(providerId);
  const secretKeys = new Set(secretFieldKeys(provider));
  const previous = existing && existing.providerId === providerId ? existing.encryptedSecrets : {};

  const candidate: Record<string, unknown> = { ...input };
  for (const key of secretKeys) {
    if (isBlank(candidate[key]) && previous[key]) candidate[key] = decryptPaymentCredential(previous[key]);
  }

  const parsed = provider.parseConfig(candidate);

  const publicConfig: Record<string, unknown> = {};
  const encryptedSecrets: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value === undefined) continue;
    if (secretKeys.has(key)) {
      // Secreto nuevo: se cifra de nuevo. En blanco: se conserva el cifrado anterior tal cual.
      const keepPrevious = isBlank(input[key]) && Boolean(previous[key]);
      encryptedSecrets[key] = keepPrevious ? previous[key] : encryptPaymentCredential(String(value));
    } else {
      publicConfig[key] = value;
    }
  }
  return { providerId, publicConfig, encryptedSecrets };
}

/** Une y descifra lo guardado en la configuración completa que consumen los adaptadores. */
export function resolveProviderConfig(stored: StoredProviderConfig): Record<string, unknown> {
  const provider = getTerminalProvider(stored.providerId);
  const secrets: Record<string, unknown> = {};
  for (const [key, cipher] of Object.entries(stored.encryptedSecrets)) {
    secrets[key] = decryptPaymentCredential(cipher);
  }
  return provider.parseConfig({ ...stored.publicConfig, ...secrets });
}

/** Secreto que firma los avisos del proveedor (descifrado), o null si no usa o no tiene. */
export function getWebhookSecret(stored: StoredProviderConfig): string | null {
  const provider = getTerminalProvider(stored.providerId);
  const field = provider.webhookSecretField;
  const cipher = field ? stored.encryptedSecrets[field] : undefined;
  return cipher ? decryptPaymentCredential(cipher) : null;
}

/** Vista segura para la pantalla: nunca devuelve secretos, solo si están puestos. */
export function maskStoredConfig(stored: StoredProviderConfig): {
  providerId: string;
  values: Record<string, unknown>;
  secretsSet: Record<string, boolean>;
} {
  const provider = getTerminalProvider(stored.providerId);
  const secretsSet: Record<string, boolean> = {};
  for (const key of secretFieldKeys(provider)) secretsSet[key] = Boolean(stored.encryptedSecrets[key]);
  return { providerId: stored.providerId, values: { ...stored.publicConfig }, secretsSet };
}
