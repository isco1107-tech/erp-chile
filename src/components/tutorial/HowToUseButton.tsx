'use client';

import { usePathname } from 'next/navigation';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getModuleKeyForPath } from './tutorial-routes';
import { TUTORIAL_CONTENT } from './tutorial-content';
import { TUTORIAL_REOPEN_EVENT } from './ModuleTutorial';

/**
 * Botón "Cómo usar" del header del dashboard: reabre a mano el tutorial del
 * módulo en el que estás, sin importar si ya lo viste antes. Se autooculta en
 * cualquier ruta sin tutorial registrado (ej. Configuración > Perfil, Manual
 * de Usuario) — un solo mount en el layout, ninguna página necesita
 * importarlo.
 */
export default function HowToUseButton() {
  const pathname = usePathname();
  const moduleKey = getModuleKeyForPath(pathname);
  if (!moduleKey || !TUTORIAL_CONTENT[moduleKey]) return null;

  function handleClick() {
    window.dispatchEvent(new CustomEvent(TUTORIAL_REOPEN_EVENT, { detail: { moduleKey } }));
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="gap-1.5 text-muted-foreground"
      data-tutorial="module-help-button"
      onClick={handleClick}
    >
      <HelpCircle className="size-4" />
      <span className="hidden sm:inline">Cómo usar</span>
    </Button>
  );
}
