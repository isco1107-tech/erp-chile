import { z } from 'zod';
import {
  AdapterPendingError,
  type ConfigFieldDescriptor,
  type CreateChargeInput,
  type CreateChargeResult,
  type PaymentTerminalProvider,
  type ParseWebhookInput,
  type ProviderStatus,
  type TerminalCapability,
  type TerminalPayment,
  type WebhookParseResult,
} from './types';

type ConfigShape = z.ZodObject<z.ZodRawShape>;

export interface ProviderDefinition<S extends ConfigShape> {
  id: string;
  label: string;
  description: string;
  capabilities: readonly TerminalCapability[];
  status?: ProviderStatus;
  configSchema: S;
  fields: readonly ConfigFieldDescriptor[];
  webhookSecretField?: string;
  createCharge(config: z.output<S>, input: CreateChargeInput): Promise<CreateChargeResult>;
  parseWebhook(input: Omit<ParseWebhookInput, 'config'> & { config: z.output<S> }): WebhookParseResult;
  fetchCharge(config: z.output<S>, externalId: string): Promise<TerminalPayment | null>;
}

/**
 * Arma un `PaymentTerminalProvider` a partir de una definición tipada con su
 * esquema. El resto del sistema ve la interfaz sin genéricos (config como
 * `Record<string, unknown>`); acá cada método valida la configuración con el
 * esquema del proveedor ANTES de entregársela a su lógica ya tipada, así un
 * adaptador nunca opera con una configuración a medias.
 *
 * Falla rápido (al cargar el módulo) si los descriptores de la UI y el esquema
 * Zod no hablan de las mismas claves: sería una pantalla que no guarda lo que
 * muestra.
 */
export function defineProvider<S extends ConfigShape>(definition: ProviderDefinition<S>): PaymentTerminalProvider {
  const schemaKeys = Object.keys(definition.configSchema.shape).sort();
  const fieldKeys = definition.fields.map((field) => field.key).sort();
  if (schemaKeys.join('|') !== fieldKeys.join('|')) {
    throw new Error(`Proveedor "${definition.id}": los campos de la UI no coinciden con el esquema (${fieldKeys} vs ${schemaKeys})`);
  }
  if (definition.webhookSecretField) {
    const field = definition.fields.find((candidate) => candidate.key === definition.webhookSecretField);
    if (!field || field.kind !== 'secret') {
      throw new Error(`Proveedor "${definition.id}": webhookSecretField debe ser un campo de tipo secret`);
    }
  }

  const parseConfig = (input: unknown): z.output<S> => definition.configSchema.parse(input) as z.output<S>;

  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    capabilities: definition.capabilities,
    status: definition.status ?? 'available',
    configSchema: definition.configSchema as unknown as z.ZodType<Record<string, unknown>>,
    fields: definition.fields,
    webhookSecretField: definition.webhookSecretField,
    parseConfig: (input) => parseConfig(input) as Record<string, unknown>,
    createCharge: (config, input) => definition.createCharge(parseConfig(config), input),
    parseWebhook: (input) => definition.parseWebhook({ ...input, config: parseConfig(input.config) }),
    fetchCharge: (config, externalId) => definition.fetchCharge(parseConfig(config), externalId),
  };
}

/**
 * Esqueleto de un proveedor real: implementa la interfaz completa y lanza
 * `AdapterPendingError` en cada operación. NO declara endpoints, formatos ni
 * capacidades porque nada de eso está verificado contra la documentación del
 * proveedor; se completa cuando el cliente aporte credenciales y docs.
 */
export function definePendingProvider(params: { id: string; label: string; description: string }): PaymentTerminalProvider {
  const pending = (): never => {
    throw new AdapterPendingError(params.id);
  };
  return defineProvider({
    id: params.id,
    label: params.label,
    description: params.description,
    capabilities: [],
    status: 'pending-adapter',
    configSchema: z.object({}),
    fields: [],
    createCharge: async () => pending(),
    parseWebhook: () => pending(),
    fetchCharge: async () => pending(),
  });
}
