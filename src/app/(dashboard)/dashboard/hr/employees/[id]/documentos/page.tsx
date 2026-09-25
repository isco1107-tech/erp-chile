import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import PrintButton from '@/components/PrintButton';
import { can, getAuthContext } from '@/lib/auth/guards';
import { formatCurrency } from '@/lib/chile/tax';
import { AFP_LABELS } from '@/lib/chile/payroll';
import { pesosInWords } from '@/lib/chile/number-words';
import { cn } from '@/lib/utils';
import { CONTRACT_TYPE_LABELS, periodLabel } from '@/modules/hr/schema';
import { getEmployeeDocumentData, type EmployeeDocumentData } from '@/modules/hr/services/employee-finance.service';

export const metadata = { title: 'Documentos del trabajador' };

type DocType = 'contrato' | 'antiguedad' | 'renta';

const TITLES: Record<DocType, string> = {
  contrato: 'Contrato de trabajo',
  antiguedad: 'Certificado de antigüedad laboral',
  renta: 'Certificado de remuneraciones',
};

function longDate(value: Date): string {
  return value.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function tenureText(start: Date, end: Date): string {
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() - (end.getUTCDate() < start.getUTCDate() ? 1 : 0);
  const years = Math.floor(Math.max(0, months) / 12);
  const rest = Math.max(0, months) % 12;
  return [years ? `${years} año${years === 1 ? '' : 's'}` : '', rest ? `${rest} mes${rest === 1 ? '' : 'es'}` : ''].filter(Boolean).join(' y ') || 'menos de un mes';
}

function Signatures({ left, right }: { left: string; right: string }) {
  return (
    <footer className="mt-16 grid grid-cols-2 gap-12 text-center text-xs text-muted-foreground">
      <div className="border-t border-foreground/40 pt-2">{left}</div>
      <div className="border-t border-foreground/40 pt-2">{right}</div>
    </footer>
  );
}

function Contract({ data, place, today }: { data: EmployeeDocumentData; place: string; today: Date }) {
  const { employee, company } = data;
  const clauses: Array<[string, React.ReactNode]> = [
    [
      'Naturaleza de los servicios',
      <>
        El Trabajador se obliga a desempeñar el cargo de <strong>{employee.position}</strong>
        {employee.department ? ` en el área de ${employee.department}` : ''}, realizando las labores propias de dicho cargo y las demás que le encomiende el Empleador relacionadas con él. Los servicios se prestarán en {company.address ? `${company.address}${company.comuna ? `, comuna de ${company.comuna}` : ''}` : '______________________'}, sin perjuicio de otros lugares que el Empleador determine dentro de la misma ciudad.
      </>,
    ],
    [
      'Jornada de trabajo',
      <>
        La jornada ordinaria será de <strong>{employee.weeklyHours} horas semanales</strong>, distribuidas de la siguiente forma: ______________________________________. El tiempo de colación, de al menos media hora, no se considera trabajado. Las horas extraordinarias solo se trabajarán cuando se pacten por escrito y se pagarán con el recargo legal del 50%.
      </>,
    ],
    [
      'Remuneración',
      <>
        El Empleador pagará al Trabajador un sueldo base mensual de <strong>{formatCurrency(employee.baseSalary)}</strong> ({pesosInWords(employee.baseSalary)}), por mes vencido, a más tardar el último día hábil de cada mes
        {employee.bankAccountNumber ? `, mediante depósito en su cuenta ${employee.bankAccountType ?? ''} N° ${employee.bankAccountNumber}${employee.bankName ? ` del ${employee.bankName}` : ''}` : ''}.
        {employee.gratificationMode === 'ART_50'
          ? ' Además, se pagará mensualmente una gratificación legal equivalente al 25% de lo devengado en el mes, con el tope anual de 4,75 ingresos mínimos mensuales (art. 50 del Código del Trabajo).'
          : ' Las partes dejan constancia del régimen de gratificación aplicable conforme a los artículos 46 y siguientes del Código del Trabajo.'}
        {employee.mealAllowance > 0 && ` Asignación de colación de ${formatCurrency(employee.mealAllowance)} mensuales.`}
        {employee.transportAllowance > 0 && ` Asignación de movilización de ${formatCurrency(employee.transportAllowance)} mensuales.`}
        {(employee.mealAllowance > 0 || employee.transportAllowance > 0) && ' Estas asignaciones no son imponibles ni tributables.'}
      </>,
    ],
    [
      'Descuentos',
      'De las remuneraciones se descontarán los impuestos, las cotizaciones de seguridad social y demás descuentos que establece la ley, y los que el Trabajador autorice por escrito.',
    ],
    [
      'Previsión',
      <>
        El Trabajador declara estar afiliado a la AFP <strong>{AFP_LABELS[employee.afp]}</strong> y a {employee.healthInsurance === 'ISAPRE' ? <>la Isapre <strong>{employee.isapreName ?? '__________'}</strong></> : <strong>FONASA</strong>}.
      </>,
    ],
    [
      'Duración',
      employee.contractType === 'INDEFINIDO'
        ? 'El presente contrato es de duración indefinida.'
        : employee.contractType === 'PLAZO_FIJO'
          ? 'El presente contrato es a plazo fijo y durará hasta el ____ de ______________ de ______. La prestación de servicios después de su vencimiento, o su segunda renovación, lo transforman en indefinido (art. 159 N°4).'
          : 'El presente contrato durará hasta la conclusión del trabajo o servicio que le dio origen: ________________________________________.',
    ],
    ['Inicio de la relación laboral', <>El Trabajador ingresó a prestar servicios el <strong>{longDate(employee.hireDate)}</strong>.</>],
    [
      'Obligaciones',
      'El Trabajador se obliga a cumplir las instrucciones del Empleador, el Reglamento Interno de Orden, Higiene y Seguridad —del que declara recibir un ejemplar— y a guardar reserva de la información confidencial de la empresa a la que tenga acceso.',
    ],
    ['Ejemplares', 'El presente contrato se firma en dos ejemplares, quedando uno en poder de cada parte. El Trabajador declara recibir el suyo en este acto.'],
  ];
  const ordinals = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO', 'SEXTO', 'SÉPTIMO', 'OCTAVO', 'NOVENO', 'DÉCIMO'];
  return (
    <>
      <p className="leading-relaxed">
        En {place}, a {longDate(today)}, entre <strong>{company.businessName}</strong>, RUT {company.rut}
        {company.giro ? `, giro ${company.giro}` : ''}, representada legalmente por don(ña) ______________________________, RUT ______________, ambos domiciliados en {company.address ?? '______________________'}
        {company.comuna ? `, comuna de ${company.comuna}` : ''}, en adelante &ldquo;el Empleador&rdquo;; y don(ña) <strong>{employee.fullName}</strong>, RUT {employee.rut}, de nacionalidad {employee.nationality ?? '____________'}
        {employee.birthDate ? `, nacido(a) el ${longDate(employee.birthDate)}` : ''}, domiciliado(a) en {employee.address ?? '______________________'}, en adelante &ldquo;el Trabajador&rdquo;, se ha convenido el siguiente contrato de trabajo ({CONTRACT_TYPE_LABELS[employee.contractType].toLowerCase()}):
      </p>
      <ol className="mt-4 space-y-3">
        {clauses.map(([title, body], index) => (
          <li key={title} className="leading-relaxed">
            <strong>{ordinals[index]}. {title}.</strong> {body}
          </li>
        ))}
      </ol>
      <Signatures left={`Empleador · ${company.businessName}`} right={`Trabajador · ${employee.fullName} · RUT ${employee.rut}`} />
    </>
  );
}

function Seniority({ data, place, today, includeSalary }: { data: EmployeeDocumentData; place: string; today: Date; includeSalary: boolean }) {
  const { employee, company } = data;
  const terminated = employee.status === 'TERMINATED' && employee.terminationDate;
  return (
    <>
      <p className="leading-relaxed">
        <strong>{company.businessName}</strong>, RUT {company.rut}, certifica que don(ña) <strong>{employee.fullName}</strong>, RUT {employee.rut},{' '}
        {terminated ? (
          <>
            se desempeñó en esta empresa entre el {longDate(employee.hireDate)} y el {longDate(employee.terminationDate!)} ({tenureText(employee.hireDate, employee.terminationDate!)}), en el cargo de <strong>{employee.position}</strong>.
          </>
        ) : (
          <>
            se desempeña en esta empresa desde el {longDate(employee.hireDate)}, con una antigüedad de {tenureText(employee.hireDate, today)} a la fecha, en el cargo de <strong>{employee.position}</strong>, con contrato {CONTRACT_TYPE_LABELS[employee.contractType].toLowerCase()}
            {includeSalary ? (
              <>
                {' '}y un sueldo base mensual de {formatCurrency(employee.baseSalary)} ({pesosInWords(employee.baseSalary)})
              </>
            ) : null}
            .
          </>
        )}
      </p>
      <p className="mt-4 leading-relaxed">Se extiende el presente certificado a petición del interesado, para los fines que estime convenientes.</p>
      <p className="mt-6">
        {place}, {longDate(today)}.
      </p>
      <footer className="mt-20 flex justify-center text-center text-xs text-muted-foreground">
        <div className="w-72 border-t border-foreground/40 pt-2">
          {company.businessName}
          <br />
          Firma y timbre
        </div>
      </footer>
    </>
  );
}

function AnnualIncome({ data, year, today, place }: { data: EmployeeDocumentData; year: number; today: Date; place: string }) {
  const { employee, company, payslips } = data;
  const totals = payslips.reduce(
    (acc, slip) => ({
      taxable: acc.taxable + slip.taxableIncome,
      contributions: acc.contributions + slip.pensionAmount + slip.healthAmount + slip.unemploymentEmployee,
      taxBase: acc.taxBase + slip.taxBase,
      tax: acc.tax + slip.incomeTax,
      net: acc.net + slip.netPay,
    }),
    { taxable: 0, contributions: 0, taxBase: 0, tax: 0, net: 0 }
  );
  return (
    <>
      <p className="leading-relaxed">
        <strong>{company.businessName}</strong>, RUT {company.rut}, certifica que a don(ña) <strong>{employee.fullName}</strong>, RUT {employee.rut}, se le pagaron durante el año {year} las siguientes remuneraciones, y se le retuvieron los impuestos que se indican:
      </p>
      {payslips.length === 0 ? (
        <p className="mt-6 rounded-md bg-muted px-4 py-3 text-sm">No hay liquidaciones cerradas en {year}.</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 font-medium">Mes</th>
              <th className="py-2 text-right font-medium">Renta imponible</th>
              <th className="py-2 text-right font-medium">Cotizaciones</th>
              <th className="py-2 text-right font-medium">Renta tributable</th>
              <th className="py-2 text-right font-medium">Impuesto retenido</th>
              <th className="py-2 text-right font-medium">Líquido pagado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {payslips.map((slip) => (
              <tr key={slip.month}>
                <td className="py-1.5">{periodLabel(year, slip.month)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatCurrency(slip.taxableIncome)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatCurrency(slip.pensionAmount + slip.healthAmount + slip.unemploymentEmployee)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatCurrency(slip.taxBase)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatCurrency(slip.incomeTax)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatCurrency(slip.netPay)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-foreground/30 font-semibold">
            <tr>
              <td className="py-2">Total {year}</td>
              <td className="py-2 text-right tabular-nums">{formatCurrency(totals.taxable)}</td>
              <td className="py-2 text-right tabular-nums">{formatCurrency(totals.contributions)}</td>
              <td className="py-2 text-right tabular-nums">{formatCurrency(totals.taxBase)}</td>
              <td className="py-2 text-right tabular-nums">{formatCurrency(totals.tax)}</td>
              <td className="py-2 text-right tabular-nums">{formatCurrency(totals.net)}</td>
            </tr>
          </tfoot>
        </table>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Montos históricos, sin actualizar. Para la Operación Renta, el certificado oficial (N°6, asociado a la DJ 1887) aplica los factores de actualización que publica el SII.
      </p>
      <p className="mt-6">
        {place}, {longDate(today)}.
      </p>
      <footer className="mt-20 flex justify-center text-center text-xs text-muted-foreground">
        <div className="w-72 border-t border-foreground/40 pt-2">
          {company.businessName}
          <br />
          Firma y timbre
        </div>
      </footer>
    </>
  );
}

export default async function EmployeeDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string; year?: string; sueldo?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const context = await getAuthContext();
  if (!context.features.hasPayroll || !can(context, 'payroll:read')) return null;
  const type: DocType = query.tipo === 'antiguedad' || query.tipo === 'renta' ? query.tipo : 'contrato';
  const today = new Date();
  const currentYear = Number(today.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }).slice(0, 4));
  const year = /^\d{4}$/.test(query.year ?? '') ? Number(query.year) : type === 'renta' ? currentYear - 1 : currentYear;
  const data = await getEmployeeDocumentData(context.companyId, id, year);
  if (!data) notFound();
  const place = data.company.comuna ?? data.company.ciudad ?? 'Santiago';
  const includeSalary = query.sueldo === '1';

  const base = `/dashboard/hr/employees/${id}/documentos`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/dashboard/hr/employees/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> {data.employee.fullName}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Documento" className="inline-flex rounded-md bg-muted p-0.5">
            {(Object.keys(TITLES) as DocType[]).map((key) => (
              <Link
                key={key}
                role="tab"
                aria-selected={type === key}
                href={`${base}?tipo=${key}`}
                className={cn('rounded px-3 py-1 text-xs font-medium', type === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {TITLES[key]}
              </Link>
            ))}
          </div>
          {type === 'renta' && (
            <div className="flex gap-1 text-xs">
              {[currentYear - 2, currentYear - 1, currentYear].map((value) => (
                <Link key={value} href={`${base}?tipo=renta&year=${value}`} className={cn('rounded border px-2 py-1', value === year ? 'border-primary bg-accent' : 'border-border')}>
                  {value}
                </Link>
              ))}
            </div>
          )}
          {type === 'antiguedad' && data.employee.status === 'ACTIVE' && (
            <Link href={`${base}?tipo=antiguedad${includeSalary ? '' : '&sueldo=1'}`} className="text-xs text-muted-foreground underline">
              {includeSalary ? 'Sin sueldo' : 'Incluir sueldo'}
            </Link>
          )}
          <PrintButton />
        </div>
      </div>

      <article className="mx-auto max-w-3xl rounded-lg border border-border bg-card p-10 text-[15px] text-foreground shadow-card print:border-0 print:p-0 print:shadow-none">
        <h1 className="mb-8 text-center text-lg font-bold tracking-wide uppercase">
          {TITLES[type]}
          {type === 'renta' ? ` ${year}` : ''}
        </h1>
        {type === 'contrato' && <Contract data={data} place={place} today={today} />}
        {type === 'antiguedad' && <Seniority data={data} place={place} today={today} includeSalary={includeSalary} />}
        {type === 'renta' && <AnnualIncome data={data} year={year} today={today} place={place} />}
      </article>
    </div>
  );
}
