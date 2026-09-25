import Link from 'next/link';
import { FileCheck2, HandCoins, Landmark, Send, TrendingDown, Vault, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata = { title: 'Tesorería & Cobranza' };

const SECTIONS = [
  {
    href: '/dashboard/treasury/cxc',
    icon: Wallet,
    title: 'Cuentas por Cobrar',
    description: 'Facturas y boletas pendientes de cobro a clientes, morosidad y ranking de deudores.',
  },
  {
    href: '/dashboard/treasury/collections',
    icon: HandCoins,
    title: 'Cobranza',
    description: 'Antigüedad de la deuda, gestiones y promesas de pago, y recordatorios automáticos por correo.',
  },
  {
    href: '/dashboard/treasury/cxp',
    icon: TrendingDown,
    title: 'Cuentas por Pagar',
    description: 'Facturas de proveedores pendientes de pago y próximos vencimientos.',
  },
  {
    href: '/dashboard/treasury/payment-batches',
    icon: Send,
    title: 'Nóminas de pago',
    description: 'Paga a varios proveedores en una sola carga al portal de tu banco.',
  },
  {
    href: '/dashboard/treasury/banks',
    icon: Vault,
    title: 'Bancos y conciliación',
    description: 'Importa la cartola y concilia cobros y pagos contra el banco, con cuadratura automática.',
  },
  {
    href: '/dashboard/treasury/cheques',
    icon: FileCheck2,
    title: 'Cheques',
    description: 'Cartera de cheques recibidos y girados: depósitos, cobros y protestos.',
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
    <div className="space-y-6">
      <PageHeader title="Tesorería & Cobranza" description="Todo lo que entra y sale de la caja y el banco, y lo que falta por cobrar y pagar." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-lg border border-border bg-card p-5 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-hover"
          >
            <section.icon className="mb-3 size-6 text-primary" aria-hidden="true" />
            <h2 className="font-semibold group-hover:underline">{section.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
