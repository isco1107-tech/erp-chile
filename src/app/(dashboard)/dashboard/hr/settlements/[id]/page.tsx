import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import PrintButton from '@/components/PrintButton';
import { can, getAuthContext } from '@/lib/auth/guards';
import { formatCurrency } from '@/lib/chile/tax';
import { pesosInWords } from '@/lib/chile/number-words';
import { terminationCause } from '@/lib/chile/settlement';
import { getSettlementDocument } from '@/modules/hr/services/employee-finance.service';

export const metadata = { title: 'Finiquito' };

function longDate(value: Date): string {
  return value.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function Item({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  if (value === 0) return null;
  return (
    <tr>
      <td className="py-1.5">{label}</td>
      <td className="py-1.5 text-right tabular-nums">{negative ? `−${formatCurrency(value)}` : formatCurrency(value)}</td>
    </tr>
  );
}

/**
 * Finiquito imprimible. Para tener poder liberatorio debe firmarse y
 * ratificarse ante un ministro de fe (art. 177 del Código del Trabajo) o
 * suscribirse electrónicamente en el portal de la Dirección del Trabajo.
 */
export default async function SettlementDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!context.features.hasPayroll || !can(context, 'payroll:read')) return null;
  const settlement = await getSettlementDocument(context.companyId, id);
  if (!settlement) notFound();
  const { employee, company } = settlement;
  const cause = terminationCause(settlement.cause);
  const place = company.comuna ?? 'Santiago';
  const earnings = settlement.severanceAmount + settlement.noticeIndemnity + settlement.vacationAmount + settlement.pendingSalary + settlement.otherEarnings;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/dashboard/hr/employees/${employee.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> {employee.fullName}
        </Link>
        <div className="flex items-center gap-3">
          {settlement.status !== 'FINAL' && <span className="text-xs font-medium text-warning">{settlement.status === 'DRAFT' ? 'Borrador' : 'Anulado'}</span>}
          <PrintButton />
        </div>
      </div>

      <article className="mx-auto max-w-3xl rounded-lg border border-border bg-card p-10 text-[15px] text-foreground shadow-card print:border-0 print:p-0 print:shadow-none">
        <h1 className="mb-8 text-center text-lg font-bold tracking-wide uppercase">Finiquito de contrato de trabajo</h1>
        <p className="leading-relaxed">
          En {place}, a ____ de ______________ de ______, entre <strong>{company.businessName}</strong>, RUT {company.rut}, representada legalmente por don(ña) ______________________________, RUT ______________, domiciliados en{' '}
          {company.address ?? '______________________'}, en adelante &ldquo;el Empleador&rdquo;; y don(ña) <strong>{employee.fullName}</strong>, RUT {employee.rut}, domiciliado(a) en {employee.address ?? '______________________'}, en adelante &ldquo;el Trabajador&rdquo;, se deja constancia de lo siguiente:
        </p>
        <ol className="mt-4 space-y-3 leading-relaxed">
          <li>
            <strong>PRIMERO.</strong> El Trabajador prestó servicios al Empleador como <strong>{employee.position}</strong> desde el {longDate(employee.hireDate)} hasta el {longDate(settlement.terminationDate)}, fecha en que terminó el contrato de trabajo por la causal del{' '}
            <strong>{cause ? `${cause.article} del Código del Trabajo: ${cause.label.toLowerCase()}` : settlement.cause}</strong>.
          </li>
          <li>
            <strong>SEGUNDO.</strong> El Trabajador declara recibir en este acto, a su entera satisfacción, la suma de <strong>{formatCurrency(settlement.totalAmount)}</strong> ({pesosInWords(settlement.totalAmount)}), según el siguiente detalle:
            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-border">
                <Item label={`Indemnización por años de servicio (${settlement.yearsOfService} año${settlement.yearsOfService === 1 ? '' : 's'})`} value={settlement.severanceAmount} />
                <Item label="Indemnización sustitutiva del aviso previo" value={settlement.noticeIndemnity} />
                <Item
                  label={`Feriado legal y proporcional (${settlement.vacationBusinessDays.toLocaleString('es-CL')} días hábiles, ${settlement.vacationCalendarDays.toLocaleString('es-CL')} días corridos)`}
                  value={settlement.vacationAmount}
                />
                <Item label="Remuneraciones pendientes" value={settlement.pendingSalary} />
                <Item label="Otros haberes" value={settlement.otherEarnings} />
                <tr className="font-medium">
                  <td className="py-1.5">Total haberes</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(earnings)}</td>
                </tr>
                <Item label="Saldo de préstamos de la empresa" value={settlement.loanBalance} negative />
                <Item label="Otros descuentos" value={settlement.otherDeductions} negative />
                <tr className="border-t border-foreground/30 font-semibold">
                  <td className="py-2">Total a pagar</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(settlement.totalAmount)}</td>
                </tr>
              </tbody>
            </table>
          </li>
          <li>
            <strong>TERCERO.</strong> El Empleador declara haber pagado íntegramente las cotizaciones previsionales, de salud y del seguro de cesantía del Trabajador por todo el período trabajado, lo que se acredita con los certificados correspondientes.
          </li>
          <li>
            <strong>CUARTO.</strong> Con el pago indicado, el Trabajador declara que el Empleador no le adeuda suma alguna por remuneraciones, gratificaciones, horas extraordinarias, feriados, indemnizaciones ni por ningún otro concepto derivado del contrato de trabajo o de su término, otorgándole el más amplio y total finiquito.
            {settlement.notes && <> Observaciones: {settlement.notes}</>}
          </li>
          <li>
            <strong>QUINTO.</strong> El presente finiquito se firma en tres ejemplares y tendrá poder liberatorio una vez ratificado ante un ministro de fe, conforme al artículo 177 del Código del Trabajo.
          </li>
        </ol>
        <footer className="mt-16 grid grid-cols-2 gap-12 text-center text-xs text-muted-foreground">
          <div className="border-t border-foreground/40 pt-2">Empleador · {company.businessName}</div>
          <div className="border-t border-foreground/40 pt-2">
            Trabajador · {employee.fullName} · RUT {employee.rut}
          </div>
        </footer>
        <div className="mt-12 border-t border-dashed border-border pt-4 text-xs text-muted-foreground">Ratificado ante: ______________________________ (ministro de fe) · Fecha: ____________</div>
      </article>
    </div>
  );
}
