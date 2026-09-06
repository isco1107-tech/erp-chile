'use client';

import { Button } from '@/components/ui/button';
import { Compass } from 'lucide-react';
import { REOPEN_ONBOARDING_EVENT } from './OnboardingWizard';

/**
 * Único punto de entrada para volver a ver la guía de configuración inicial
 * — el wizard (montado en el layout del dashboard) solo se auto-abre una vez
 * mientras la empresa esté "vacía"; este botón lo reabre a mano sin importar
 * eso, disparando un evento simple en vez de levantar el estado hasta acá
 * (el wizard vive en un layout distinto, fuera del árbol de esta página).
 */
export default function ReopenOnboardingButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.dispatchEvent(new Event(REOPEN_ONBOARDING_EVENT))}>
      <Compass /> Ver guía de configuración
    </Button>
  );
}
