import { appManifestResponse } from '@/lib/apps/manifest';

/** Manifest de la app «bodega»: su identidad, alcance e íconos salen de `src/lib/apps/registry.ts`. */
export function GET(request: Request) {
  return appManifestResponse('bodega', request);
}
