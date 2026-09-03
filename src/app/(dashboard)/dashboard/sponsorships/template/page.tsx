import Link from 'next/link';
import TemplateEditorClient from '@/components/documents/TemplateEditorClient';
import { DOCUMENT_TEMPLATE_VARIABLES } from '@/modules/documents/schema';
import { buttonVariants } from '@/components/ui/button';

export const metadata = { title: 'Plantilla de Carta de Compromiso' };

export default function SponsorshipTemplatePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Plantilla: Carta de Compromiso</h1>
        <Link href="/dashboard/sponsorships" className={buttonVariants({ variant: 'outline' })}>← Volver a Auspicios</Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Este es el formato estándar que se usa para generar la carta de compromiso de cada contrato de auspicio. Genera la carta desde la ficha del
        contrato una vez guardada la plantilla.
      </p>
      <TemplateEditorClient type="SPONSOR_COMMITMENT_LETTER" defaultName="Carta de Compromiso" variables={DOCUMENT_TEMPLATE_VARIABLES.SPONSOR_COMMITMENT_LETTER} />
    </div>
  );
}
