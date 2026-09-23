import { moveStageSchema, opportunityCreateSchema } from '@/modules/crm/schema';
import { expenseItemSchema, expenseReviewSchema } from '@/modules/expenses/schema';
import { fixedAssetSchema } from '@/modules/fixed-assets/schema';
import { employeeSchema, leaveRequestSchema, payrollPeriodSchema } from '@/modules/hr/schema';
import { REFERENCE_AFP_COMMISSION_BPS, REFERENCE_PAYROLL_PARAMETERS } from '@/lib/chile/payroll';

/**
 * Reglas de negocio que viven en la validación (Zod): son la primera línea
 * de defensa y las mismas se aplican en cliente y servidor.
 */

describe('CRM', () => {
  it('una oportunidad necesita cliente o nombre de prospecto', () => {
    expect(opportunityCreateSchema.safeParse({ title: 'Renovación', amount: 100 }).success).toBe(false);
    expect(opportunityCreateSchema.safeParse({ title: 'Renovación', amount: 100, prospectName: 'Ferretería Sur' }).success).toBe(true);
  });

  it('perder un negocio exige motivo', () => {
    expect(moveStageSchema.safeParse({ stage: 'LOST' }).success).toBe(false);
    expect(moveStageSchema.safeParse({ stage: 'LOST', lostReason: 'Precio' }).success).toBe(true);
    expect(moveStageSchema.safeParse({ stage: 'WON' }).success).toBe(true);
  });

  it('el monto es CLP entero y no negativo', () => {
    expect(opportunityCreateSchema.safeParse({ title: 'X', amount: 10.5, prospectName: 'A' }).success).toBe(false);
    expect(opportunityCreateSchema.safeParse({ title: 'X', amount: -1, prospectName: 'A' }).success).toBe(false);
  });
});

describe('Rendición de gastos', () => {
  it('rechazar exige explicar el motivo', () => {
    expect(expenseReviewSchema.safeParse({ decision: 'REJECTED' }).success).toBe(false);
    expect(expenseReviewSchema.safeParse({ decision: 'REJECTED', notes: 'Falta la boleta' }).success).toBe(true);
    expect(expenseReviewSchema.safeParse({ decision: 'APPROVED' }).success).toBe(true);
  });

  it('valida el RUT del comercio solo si viene', () => {
    const base = { expenseDate: '2026-09-01', category: 'Transporte', description: 'Taxi', documentType: 'BOLETA', amount: 5000 };
    expect(expenseItemSchema.safeParse(base).success).toBe(true);
    expect(expenseItemSchema.safeParse({ ...base, supplierRut: '11.111.111-2' }).success).toBe(false);
    expect(expenseItemSchema.safeParse({ ...base, supplierRut: '' }).success).toBe(true);
  });
});

describe('Activo fijo', () => {
  const base = { code: 'AF-1', name: 'Notebook', category: 'Equipos', acquisitionDate: '2026-01-10', acquisitionCost: 1_000_000, residualValue: 1, usefulLifeMonths: 72, method: 'LINEAL' };

  it('el residual debe ser menor que el costo', () => {
    expect(fixedAssetSchema.safeParse({ ...base, residualValue: 1_000_000 }).success).toBe(false);
  });

  it('exige al menos un año de vida útil, salvo lo que no se deprecia', () => {
    expect(fixedAssetSchema.safeParse({ ...base, usefulLifeMonths: 6 }).success).toBe(false);
    expect(fixedAssetSchema.safeParse({ ...base, usefulLifeMonths: 0, method: 'SIN_DEPRECIACION' }).success).toBe(true);
  });
});

describe('Personas y remuneraciones', () => {
  const employee = {
    rut: '11.111.111-1',
    fullName: 'Ana Pérez Soto',
    position: 'Vendedora',
    hireDate: '2025-03-01',
    contractType: 'INDEFINIDO',
    weeklyHours: 42,
    baseSalary: 700_000,
    gratificationMode: 'ART_50',
    mealAllowance: 0,
    transportAllowance: 0,
    afp: 'MODELO',
    healthInsurance: 'FONASA',
  };

  it('acepta una ficha válida', () => {
    expect(employeeSchema.safeParse(employee).success).toBe(true);
  });

  it('rechaza un RUT inválido', () => {
    expect(employeeSchema.safeParse({ ...employee, rut: '11.111.111-2' }).success).toBe(false);
  });

  it('con Isapre exige el plan en UF', () => {
    expect(employeeSchema.safeParse({ ...employee, healthInsurance: 'ISAPRE' }).success).toBe(false);
    expect(employeeSchema.safeParse({ ...employee, healthInsurance: 'ISAPRE', isaprePlanUf: 3.2 }).success).toBe(true);
  });

  it('la jornada ordinaria no supera 45 horas', () => {
    expect(employeeSchema.safeParse({ ...employee, weeklyHours: 48 }).success).toBe(false);
  });

  it('un período exige UF y UTM del mes', () => {
    const period = { year: 2026, month: 9, ...REFERENCE_PAYROLL_PARAMETERS, afpCommissionBps: { ...REFERENCE_AFP_COMMISSION_BPS } };
    expect(payrollPeriodSchema.safeParse({ ...period, ufValue: 0, utmValue: 0 }).success).toBe(false);
    expect(payrollPeriodSchema.safeParse({ ...period, ufValue: 39_850.12, utmValue: 69_542 }).success).toBe(true);
  });

  it('una solicitud no puede terminar antes de empezar', () => {
    expect(leaveRequestSchema.safeParse({ employeeId: 'x', type: 'VACATION', startDate: '2026-10-10', endDate: '2026-10-01' }).success).toBe(false);
  });
});
