import { z } from 'zod';
import { validateRut } from '@/lib/chile/rut';
import { AFP_INSTITUTIONS } from '@/lib/chile/payroll';

export const CONTRACT_TYPES = ['INDEFINIDO', 'PLAZO_FIJO', 'POR_OBRA'] as const;
export const CONTRACT_TYPE_LABELS: Record<(typeof CONTRACT_TYPES)[number], string> = {
  INDEFINIDO: 'Indefinido',
  PLAZO_FIJO: 'Plazo fijo',
  POR_OBRA: 'Por obra o faena',
};

export const HEALTH_INSURANCES = ['FONASA', 'ISAPRE'] as const;
export const GRATIFICATION_MODES = ['ART_50', 'NONE'] as const;
export const GRATIFICATION_MODE_LABELS: Record<(typeof GRATIFICATION_MODES)[number], string> = {
  ART_50: 'Art. 50 (25% con tope 4,75 IMM)',
  NONE: 'Sin gratificación mensual',
};

export const LEAVE_TYPES = ['VACATION', 'SICK_LEAVE', 'PERSONAL', 'UNPAID'] as const;
export const LEAVE_TYPE_LABELS: Record<(typeof LEAVE_TYPES)[number], string> = {
  VACATION: 'Vacaciones',
  SICK_LEAVE: 'Licencia médica',
  PERSONAL: 'Permiso con goce',
  UNPAID: 'Permiso sin goce',
};

export const LEAVE_STATUS_LABELS: Record<'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED', string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Anulada',
};

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export function periodLabel(year: number, month: number): string {
  return `${MONTHS[month - 1] ?? month} ${year}`;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const clp = (label: string) => z.number({ error: `${label}: ingresa un monto` }).int(`${label} debe ser un número entero`).min(0, `${label} no puede ser negativo`);

export const employeeSchema = z
  .object({
    rut: z.string().trim().refine(validateRut, 'El RUT del trabajador no es válido'),
    fullName: z.string().trim().min(3, 'Ingresa el nombre completo').max(160),
    email: z.string().trim().email('Correo inválido').optional().or(z.literal('').transform(() => undefined)),
    phone: optionalText(40),
    birthDate: z.coerce.date().optional(),
    address: optionalText(240),
    position: z.string().trim().min(2, 'Indica el cargo').max(120),
    department: optionalText(120),
    hireDate: z.coerce.date({ error: 'Indica la fecha de ingreso' }),
    contractType: z.enum(CONTRACT_TYPES),
    weeklyHours: z.number().int().min(1, 'La jornada debe ser de al menos 1 hora').max(45, 'La jornada ordinaria no puede superar 45 horas'),
    baseSalary: clp('El sueldo base').refine((value) => value > 0, 'El sueldo base debe ser mayor a cero'),
    gratificationMode: z.enum(GRATIFICATION_MODES),
    mealAllowance: clp('La colación'),
    transportAllowance: clp('La movilización'),
    afp: z.enum(AFP_INSTITUTIONS),
    healthInsurance: z.enum(HEALTH_INSURANCES),
    isapreName: optionalText(80),
    isaprePlanUf: z.number().min(0).max(100).optional(),
    bankName: optionalText(80),
    bankAccountType: optionalText(40),
    bankAccountNumber: optionalText(40),
    notes: optionalText(2000),
  })
  .refine((data) => data.healthInsurance !== 'ISAPRE' || (data.isaprePlanUf !== undefined && data.isaprePlanUf > 0), {
    message: 'Indica el valor del plan de Isapre en UF',
    path: ['isaprePlanUf'],
  });

export const terminateEmployeeSchema = z.object({
  terminationDate: z.coerce.date({ error: 'Indica la fecha de término' }),
});

const bpsField = (max: number) => z.number().int().min(0).max(max);

export const payrollPeriodSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  ufValue: z.number({ error: 'Ingresa el valor de la UF' }).positive('Ingresa el valor de la UF del mes'),
  utmValue: z.number({ error: 'Ingresa el valor de la UTM' }).int().positive('Ingresa el valor de la UTM del mes'),
  minimumWage: z.number().int().positive('Ingresa el ingreso mínimo mensual'),
  taxableCapUf: z.number().positive(),
  unemploymentCapUf: z.number().positive(),
  sisRateBps: bpsField(1000),
  mutualRateBps: bpsField(1000),
  employerPensionRateBps: bpsField(2000),
  afpCommissionBps: z.object(Object.fromEntries(AFP_INSTITUTIONS.map((afp) => [afp, bpsField(1000)])) as Record<(typeof AFP_INSTITUTIONS)[number], z.ZodNumber>),
});

export const payslipVariablesSchema = z.object({
  rows: z
    .array(
      z.object({
        employeeId: z.string().min(1),
        workedDays: z.number().int().min(0).max(30),
        overtimeHours: z.number().min(0).max(200),
        bonuses: clp('Los bonos'),
        advances: clp('Los anticipos'),
        otherDeductions: clp('Otros descuentos'),
      })
    )
    .max(2000),
});

export const leaveRequestSchema = z
  .object({
    employeeId: z.string().min(1, 'Elige al trabajador'),
    type: z.enum(LEAVE_TYPES),
    startDate: z.coerce.date({ error: 'Indica desde cuándo' }),
    endDate: z.coerce.date({ error: 'Indica hasta cuándo' }),
    businessDays: z.number().int().min(0).max(365).optional(),
    reason: optionalText(500),
  })
  .refine((data) => data.endDate >= data.startDate, { message: 'La fecha de término debe ser igual o posterior al inicio', path: ['endDate'] });

export const leaveReviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  notes: optionalText(500),
});

export type EmployeeInput = z.infer<typeof employeeSchema>;
export type PayrollPeriodInput = z.infer<typeof payrollPeriodSchema>;
export type PayslipVariablesInput = z.infer<typeof payslipVariablesSchema>;
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;
export type LeaveReviewInput = z.infer<typeof leaveReviewSchema>;
