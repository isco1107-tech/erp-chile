import { definePendingProvider } from '../define';

/**
 * ESQUELETO: implementa la interfaz de `PaymentTerminalProvider` y lanza
 * `AdapterPendingError` en cada operación. No declara endpoints ni formatos
 * porque no están verificados contra la documentación del proveedor; se
 * completa cuando el cliente aporte credenciales y documentación oficial.
 */
export const mercadopagoProvider = definePendingProvider({
  id: 'mercadopago',
  label: 'Mercado Pago',
  description: 'Adaptador pendiente: requiere credenciales y documentación del proveedor.',
});
