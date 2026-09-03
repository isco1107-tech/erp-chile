import CxCClient from '@/components/treasury/CxCClient';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { TAX_GLOSSARY } from '@/lib/chile/glossary';

export const metadata = { title: 'Cuentas por Cobrar' };

export default function CxCPage() {
  return (
    <div>
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-bold">
        Cuentas por Cobrar
        <InfoTooltip text={TAX_GLOSSARY.cxc} />
      </h1>
      <CxCClient />
    </div>
  );
}
