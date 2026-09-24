import { permanentRedirect } from 'next/navigation';

/**
 * La landing cinematográfica se revisó aquí y hoy es la de `/`. La ruta se
 * mantiene para que los enlaces que ya se compartieron no queden rotos.
 */
export default function LandingV2Page() {
  permanentRedirect('/');
}
