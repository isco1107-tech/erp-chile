import { PageHeader } from '@/components/ui/PageHeader';
import LabelsClient from '@/components/inventory/LabelsClient';

export const metadata = { title: 'Etiquetas de productos' };

export default function LabelsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventario"
        title="Etiquetas con código de barras"
        description="Imprime etiquetas de góndola o de producto en hojas A4 o en rollo para impresora de etiquetas. Usan el código de barras del producto o, si no tiene, su SKU."
        className="print:hidden"
      />
      <LabelsClient />
    </div>
  );
}
