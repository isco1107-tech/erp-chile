'use client';

import { useEffect } from 'react';
import { captureCampaignVisit } from '@/lib/marketing/attribution-browser';

/**
 * Anota de qué campaña llegó la visita (marketing propio de Aether, ADR 0015).
 * No dibuja nada; va en las páginas públicas de Aether que reciben enlaces de
 * campañas (portada, `/empresas` y las páginas de cada módulo).
 */
export default function CampaignAttributionTracker() {
  useEffect(() => {
    captureCampaignVisit();
  }, []);
  return null;
}
