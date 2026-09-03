import CxPClient from '@/components/treasury/CxPClient';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { TAX_GLOSSARY } from '@/lib/chile/glossary';

export const metadata = { title: 'Cuentas por Pagar' };

export default function CxPPage() {
  return (
    <div>
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-bold">
        Cuentas por Pagar
        <InfoTooltip text={TAX_GLOSSARY.cxp} />
      </h1>
      <CxPClient />
    </div>
  );
}
