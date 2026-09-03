import Link from 'next/link';
import TemplateEditorClient from '@/components/documents/TemplateEditorClient';
import { DOCUMENT_TEMPLATE_VARIABLES } from '@/modules/documents/schema';
import { CANDIDATE_CONTRACT_DEFAULT_TEMPLATE } from '@/modules/candidates/contract-template-default';
import { buttonVariants } from '@/components/ui/button';

export const metadata = { title: 'Plantilla de Contrato de Candidatas' };

export default function CandidateTemplatePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Plantilla: Contrato de Imagen</h1>
        <Link href="/dashboard/candidates" className={buttonVariants({ variant: 'outline' })}>← Volver a Candidatas</Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Este es el formato estándar que se usa para generar el contrato de imagen de cada candidata. Genera el contrato desde la ficha de la
        candidata una vez guardada la plantilla.
      </p>
      <TemplateEditorClient
        type="CANDIDATE_CONTRACT"
        defaultName="Contrato de Participación en Certamen de Belleza"
        variables={DOCUMENT_TEMPLATE_VARIABLES.CANDIDATE_CONTRACT}
        suggestedBodyText={CANDIDATE_CONTRACT_DEFAULT_TEMPLATE}
      />
    </div>
  );
}
