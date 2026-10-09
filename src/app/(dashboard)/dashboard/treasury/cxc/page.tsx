import CxCClient from '@/components/treasury/CxCClient';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { PageHeader } from '@/components/ui/PageHeader';
import { TAX_GLOSSARY } from '@/lib/chile/glossary';
import { SCREEN_PURPOSES } from '@/modules/manual/knowledge';

export const metadata = { title: 'Cuentas por Cobrar' };

export default function CxCPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Cuentas por Cobrar"
        titleAddon={<InfoTooltip text={TAX_GLOSSARY.cxc} />}
        description={SCREEN_PURPOSES['treasury-cxc']}
      />
      <CxCClient />
    </div>
  );
}
