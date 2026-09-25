import type { Employee, Payslip, PayrollPeriod } from '@prisma/client';
import { formatCurrency } from '@/lib/chile/tax';
import { AFP_LABELS } from '@/lib/chile/payroll';
import { CONTRACT_TYPE_LABELS, periodLabel } from '@/modules/hr/schema';

function Line({ label, value, strong, muted }: { label: string; value: number; strong?: boolean; muted?: boolean }) {
  if (value === 0 && !strong) return null;
  return (
    <div className={`flex justify-between gap-4 py-1 text-sm ${strong ? 'font-semibold text-foreground' : muted ? 'text-muted-foreground' : 'text-foreground'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{formatCurrency(value)}</span>
    </div>
  );
}

export interface PayslipDocumentData extends Payslip {
  employee: Omit<Employee, 'portalTokenHash'>;
  period: PayrollPeriod;
  company: { businessName: string; rut: string; address: string | null; comuna: string | null; logoUrl: string | null };
}

/**
 * Liquidación de sueldo imprimible. Se lee de la foto guardada en `Payslip`,
 * nunca se recalcula: lo que se imprime es exactamente lo que se pagó. La usan
 * el panel y el portal del trabajador.
 */
export function PayslipDocument({ slip }: { slip: PayslipDocumentData }) {
  const { employee, period, company } = slip;
  const legalHealth = Math.round(slip.taxableIncome * 0.07);
  return (
    <article className="mx-auto max-w-3xl rounded-lg border border-border bg-card p-8 shadow-card print:border-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="text-lg font-semibold text-foreground">{company.businessName}</p>
          <p className="text-sm text-muted-foreground">RUT {company.rut}</p>
          {company.address && (
            <p className="text-sm text-muted-foreground">
              {company.address}
              {company.comuna ? `, ${company.comuna}` : ''}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Liquidación de sueldo</p>
          <p className="text-lg font-semibold text-foreground">{periodLabel(period.year, period.month)}</p>
          {period.status !== 'CLOSED' && <p className="text-xs font-medium text-warning">Borrador: período sin cerrar</p>}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-x-6 gap-y-1 border-b border-border py-4 text-sm">
        <p>
          <span className="text-muted-foreground">Trabajador: </span>
          {employee.fullName}
        </p>
        <p>
          <span className="text-muted-foreground">RUT: </span>
          {employee.rut}
        </p>
        <p>
          <span className="text-muted-foreground">Cargo: </span>
          {employee.position}
        </p>
        <p>
          <span className="text-muted-foreground">Contrato: </span>
          {CONTRACT_TYPE_LABELS[employee.contractType]}
        </p>
        <p>
          <span className="text-muted-foreground">AFP: </span>
          {AFP_LABELS[employee.afp]}
        </p>
        <p>
          <span className="text-muted-foreground">Salud: </span>
          {employee.healthInsurance === 'ISAPRE' ? `${employee.isapreName ?? 'Isapre'}${employee.isaprePlanUf ? ` (${employee.isaprePlanUf} UF)` : ''}` : 'Fonasa'}
        </p>
        <p>
          <span className="text-muted-foreground">Días trabajados: </span>
          {slip.workedDays}
        </p>
        <p>
          <span className="text-muted-foreground">Sueldo base pactado: </span>
          {formatCurrency(employee.baseSalary)}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-8 py-4 md:grid-cols-2">
        <section>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Haberes</h2>
          <Line label="Sueldo base" value={slip.baseSalary} />
          <Line label={`Horas extra (${slip.overtimeHours.toLocaleString('es-CL')} h)`} value={slip.overtimeAmount} />
          <Line label="Bonos" value={slip.bonuses} />
          <Line label="Gratificación legal" value={slip.gratification} />
          <Line label="Total imponible" value={slip.taxableIncome} strong />
          <Line label="Colación" value={slip.mealAllowance} />
          <Line label="Movilización" value={slip.transportAllowance} />
          <Line label="Total haberes" value={slip.taxableIncome + slip.mealAllowance + slip.transportAllowance} strong />
        </section>
        <section>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Descuentos</h2>
          <Line label={`AFP ${AFP_LABELS[employee.afp]}`} value={slip.pensionAmount} />
          <Line label={employee.healthInsurance === 'ISAPRE' ? 'Isapre' : 'Fonasa 7%'} value={slip.healthAmount} />
          <Line label="Seguro de cesantía" value={slip.unemploymentEmployee} />
          <Line label="Impuesto único" value={slip.incomeTax} />
          <Line label="Anticipos" value={slip.advances} />
          <Line label="Otros descuentos" value={slip.otherDeductions} />
          <Line label="Cuota préstamo empresa" value={slip.loanDeduction} />
          <Line label="Total descuentos" value={slip.totalDeductions} strong />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Base tributable {formatCurrency(slip.taxBase)} · UTM {formatCurrency(period.utmValue)}
            {employee.healthInsurance === 'ISAPRE' && slip.healthAmount > legalHealth && ' · el adicional de Isapre sobre el 7% no rebaja impuesto'}
          </p>
        </section>
      </div>

      <div className="flex items-center justify-between rounded-md bg-accent px-4 py-3">
        <span className="text-sm font-semibold text-accent-foreground">Líquido a pagar</span>
        <span className="text-2xl font-bold tabular-nums text-foreground">{formatCurrency(slip.netPay)}</span>
      </div>

      <section className="mt-4 text-xs text-muted-foreground">
        <p>
          Aportes del empleador (no se descuentan al trabajador): SIS {formatCurrency(slip.employerSis)} · Cesantía {formatCurrency(slip.employerUnemployment)} · Mutual{' '}
          {formatCurrency(slip.employerMutual)} · Aporte previsional {formatCurrency(slip.employerPension)} · Costo total empresa {formatCurrency(slip.employerCost)}
        </p>
        {employee.bankName && (
          <p className="mt-1">
            Pago por transferencia a {employee.bankName}
            {employee.bankAccountType ? `, ${employee.bankAccountType}` : ''}
            {employee.bankAccountNumber ? ` N° ${employee.bankAccountNumber}` : ''}.
          </p>
        )}
      </section>

      <footer className="mt-12 grid grid-cols-2 gap-10 text-center text-xs text-muted-foreground">
        <div className="border-t border-border pt-2">Firma empleador</div>
        <div className="border-t border-border pt-2">
          Recibí conforme · {employee.fullName}
        </div>
      </footer>
    </article>
  );
}
