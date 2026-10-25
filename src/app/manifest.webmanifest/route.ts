import { appManifestResponse } from '@/lib/apps/manifest';

/**
 * Manifest de Aether ERP (el panel). Vive en `/manifest.webmanifest`, la misma
 * dirección de siempre, para que las instalaciones existentes sigan
 * actualizándose. Su alcance es `/dashboard`: NO puede ser `/` porque
 * abarcaría a Bodega, Control, POS y Seller Center, y el navegador las daría por
 * instaladas con solo tener el ERP (ver `src/lib/apps/registry.ts`).
 */
export function GET(request: Request) {
  return appManifestResponse('erp', request);
}
