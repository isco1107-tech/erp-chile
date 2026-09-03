'use client';

import { Button } from '@/components/ui/button';

export default function PrintButton() {
  return (
    <Button type="button" className="print:hidden" onClick={() => window.print()}>
      Imprimir / Exportar PDF
    </Button>
  );
}
