import CxPClient from '@/components/treasury/CxPClient';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { PageHeader } from '@/components/ui/PageHeader';
import { TAX_GLOSSARY } from '@/lib/chile/glossary';
import { SCREEN_PURPOSES } from '@/modules/manual/knowledge';

export const metadata = { title: 'Cuentas por Pagar' };

export default function CxPPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Cuentas por Pagar"
        titleAddon={<InfoTooltip text={TAX_GLOSSARY.cxp} />}
        description={SCREEN_PURPOSES['treasury-cxp']}
      />
      <CxPClient />
    </div>
  );
}
