/**
 * Gancho de observabilidad de Next.js (`instrumentation.ts`).
 *
 * `onRequestError` lo llama el servidor de Next ante CUALQUIER excepción no
 * controlada del lado servidor: renderizado de un Server Component, un Route
 * Handler, una Server Action o el proxy. Es la única forma de enterarse de los
 * errores que hoy solo aparecían como una pantalla "Algo salió mal" para el
 * usuario y nada en ninguna parte para el equipo.
 *
 * Ubicado en `src/` (no en la raíz) porque el proyecto usa carpeta `src`.
 * Ver `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`.
 */
import type { Instrumentation } from 'next';

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // Import dinámico: `instrumentation.ts` se carga también en el runtime Edge,
  // donde el módulo de observabilidad no debe evaluarse en el arranque.
  const { captureExceptionAndFlush } = await import('@/lib/observability');

  // `err` viene tipado como `unknown` a propósito; puede no ser un Error si
  // React lo procesó al renderizar un Server Component. El `digest` es el
  // identificador que el usuario ve en pantalla, así que es la única forma de
  // cruzar "el cliente reportó el error abc123" con el stack real.
  const digest = typeof err === 'object' && err !== null && 'digest' in err ? String(err.digest) : undefined;

  await captureExceptionAndFlush(err, {
    module: `next:${context.routeType}`,
    extra: {
      digest,
      path: request.path,
      method: request.method,
      routePath: context.routePath,
      routerKind: context.routerKind,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
      // Las cabeceras van completas al redactor: `cookie` y `authorization`
      // salen censuradas por nombre de clave (ver lib/observability/redact.ts).
      headers: request.headers,
    },
  });
};
