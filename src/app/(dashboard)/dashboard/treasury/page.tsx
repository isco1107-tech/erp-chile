import Link from 'next/link';
import { Landmark, TrendingDown, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Tesorería & Cobranza' };

const SECTIONS = [
  {
    href: '/dashboard/treasury/cxc',
    icon: Wallet,
    title: 'Cuentas por Cobrar',
    description: 'Facturas y boletas pendientes de cobro a clientes, morosidad y ranking de deudores.',
  },
  {
    href: '/dashboard/treasury/cxp',
    icon: TrendingDown,
    title: 'Cuentas por Pagar',
    description: 'Facturas de proveedores pendientes de pago y próximos vencimientos.',
  },
  {
    href: '/dashboard/treasury/cashflow',
    icon: Landmark,
    title: 'Flujo de Caja',
    description: 'Ingresos y egresos reales recaudados, saldo neto y exportación de movimientos.',
  },
];

export default function TreasuryPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tesorería & Cobranza</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <section.icon className="mb-2 size-6 text-primary" />
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
