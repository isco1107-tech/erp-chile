import { definePendingProvider } from '../define';

/**
 * ESQUELETO: implementa la interfaz de `PaymentTerminalProvider` y lanza
 * `AdapterPendingError` en cada operación. No declara endpoints ni formatos
 * porque no están verificados contra la documentación del proveedor; se
 * completa cuando el cliente aporte credenciales y documentación oficial.
 */
export const getnetProvider = definePendingProvider({
  id: 'getnet',
  label: 'Getnet',
  description: 'Adaptador pendiente: requiere credenciales y documentación del proveedor.',
});
