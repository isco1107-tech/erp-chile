import { z } from 'zod';
import type { Permission } from '@/lib/auth/permissions';
import { formatCurrency } from '@/lib/chile/tax';
import { contactCreateSchema } from '@/modules/contacts/schema';
import { createContact } from '@/modules/contacts/services/contacts.service';
import { candidateCreateSchema, attendanceCreateSchema } from '@/modules/candidates/schema';
import { createCandidate } from '@/modules/candidates/services/candidates.service';
import { addAttendance } from '@/modules/candidates/services/attendance.service';
import { PAYMENT_PLAN_CLIENT_TYPES, PAYMENT_PLAN_FREQUENCIES, paymentPlanCreateSchema } from '@/modules/payment-plans/schema';
import { createPaymentPlan } from '@/modules/payment-plans/services/payment-plans.service';
import { resolveCandidateByName, resolveContactByQuery, resolveProjectByName } from './resolvers';

/**
 * Acciones que el asistente puede PROPONER (nunca ejecutar directo — ver
 * `src/app/api/ai/manual-assistant/route.ts`). Cada entrada reusa el mismo
 * schema Zod y el mismo `service` que ya usa el formulario real del módulo
 * — el asistente nunca escribe en la base con una query propia, solo llama
 * exactamente lo que llamaría un Server Action normal.
 *
 * Agregar una acción nueva de cualquier módulo es solo agregar una entrada
 * acá: no hay que tocar el endpoint, el widget, ni la lógica de
 * permisos/confirmación, que son genéricas.
 */
export interface AgentActionResolved {
  payload: Record<string, unknown>;
  summary: string;
}

export interface AgentAction {
  type: string;
  /** Para el `FunctionDeclaration` de Gemini. */
  description: string;
  parametersJsonSchema: Record<string, unknown>;
  requiredPermission: Permission;
  /** Valida/traduce los argumentos crudos del modelo (nombres → ids reales) y arma el resumen de confirmación. Lanza con un mensaje legible si algo no calza. */
  resolve(companyId: string, rawArgs: Record<string, unknown>): Promise<AgentActionResolved>;
  /** Ejecuta de verdad — solo se llama después de confirmar. */
  execute(companyId: string, payload: Record<string, unknown>): Promise<{ message: string; entityId: string }>;
}

function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Datos inválidos';
}

const CREATE_CONTACT: AgentAction = {
  type: 'CREATE_CONTACT',
  description: 'Crea un contacto nuevo (cliente y/o proveedor).',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      rut: { type: 'string', description: 'RUT chileno, con o sin puntos/guión' },
      razonSocial: { type: 'string', description: 'Nombre o razón social' },
      isCustomer: { type: 'boolean', description: 'Es cliente' },
      isSupplier: { type: 'boolean', description: 'Es proveedor' },
      email: { type: 'string' },
      phone: { type: 'string' },
    },
    required: ['rut', 'razonSocial'],
  },
  requiredPermission: 'contacts:write',
  async resolve(_companyId, rawArgs) {
    const parsed = contactCreateSchema.safeParse(rawArgs);
    if (!parsed.success) throw new Error(firstIssueMessage(parsed.error));
    const tags = [parsed.data.isCustomer && 'cliente', parsed.data.isSupplier && 'proveedor'].filter(Boolean).join(' y ');
    return {
      payload: parsed.data,
      summary: `Crear contacto "${parsed.data.razonSocial}" (RUT ${parsed.data.rut})${tags ? ` — ${tags}` : ''}.`,
    };
  },
  async execute(companyId, payload) {
    const parsed = contactCreateSchema.parse(payload);
    const contact = await createContact(companyId, parsed);
    return { message: `Contacto "${contact.razonSocial}" creado correctamente.`, entityId: contact.id };
  },
};

const CREATE_CANDIDATE: AgentAction = {
  type: 'CREATE_CANDIDATE',
  description: 'Crea la ficha de una candidata nueva en un proyecto/certamen existente.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      projectName: { type: 'string', description: 'Nombre o código del proyecto/certamen al que pertenece' },
      rut: { type: 'string' },
      fullName: { type: 'string' },
      stageName: { type: 'string' },
      birthDate: { type: 'string', description: 'Fecha de nacimiento, formato ISO YYYY-MM-DD' },
      email: { type: 'string' },
      phone: { type: 'string' },
    },
    required: ['projectName', 'rut', 'fullName', 'birthDate'],
  },
  requiredPermission: 'candidates:write',
  async resolve(companyId, rawArgs) {
    const { projectName, ...rest } = rawArgs as Record<string, unknown>;
    const project = await resolveProjectByName(companyId, String(projectName ?? ''));
    const parsed = candidateCreateSchema.safeParse({ ...rest, projectId: project.id });
    if (!parsed.success) throw new Error(firstIssueMessage(parsed.error));
    return {
      payload: parsed.data,
      summary: `Crear candidata "${parsed.data.fullName}" (RUT ${parsed.data.rut}) en el proyecto "${project.name}".`,
    };
  },
  async execute(companyId, payload) {
    const parsed = candidateCreateSchema.parse(payload);
    const candidate = await createCandidate(companyId, parsed);
    return { message: `Candidata "${candidate.fullName}" creada correctamente.`, entityId: candidate.id };
  },
};

const MARK_CANDIDATE_ATTENDANCE: AgentAction = {
  type: 'MARK_CANDIDATE_ATTENDANCE',
  description: 'Registra la asistencia de una candidata a una actividad puntual (taller, ensayo, pasarela, oratoria, evento).',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      candidateName: { type: 'string', description: 'Nombre o nombre artístico de la candidata' },
      activityType: { type: 'string', enum: ['PASARELA', 'ORATORIA', 'ENSAYO', 'TALLER', 'EVENTO', 'OTRO'] },
      activityDate: { type: 'string', description: 'Fecha de la actividad, formato ISO YYYY-MM-DD' },
      attended: { type: 'boolean', description: 'Si asistió (true) o faltó (false). Por defecto true.' },
      notes: { type: 'string' },
    },
    required: ['candidateName', 'activityType', 'activityDate'],
  },
  requiredPermission: 'candidates:write',
  async resolve(companyId, rawArgs) {
    const { candidateName, ...rest } = rawArgs as Record<string, unknown>;
    const candidate = await resolveCandidateByName(companyId, String(candidateName ?? ''));
    const parsed = attendanceCreateSchema.safeParse(rest);
    if (!parsed.success) throw new Error(firstIssueMessage(parsed.error));
    const who = candidate.stageName || candidate.fullName;
    const asistio = parsed.data.attended ? 'asistió' : 'no asistió';
    return {
      payload: { candidateId: candidate.id, ...parsed.data },
      summary: `Registrar que ${who} ${asistio} a ${parsed.data.activityType} el ${parsed.data.activityDate.toLocaleDateString('es-CL')}.`,
    };
  },
  async execute(companyId, payload) {
    const { candidateId, ...rest } = payload as { candidateId: string } & Record<string, unknown>;
    const parsed = attendanceCreateSchema.parse(rest);
    const attendance = await addAttendance(companyId, candidateId, parsed);
    return { message: 'Asistencia registrada correctamente.', entityId: attendance.id };
  },
};

const CREATE_PAYMENT_PLAN: AgentAction = {
  type: 'CREATE_PAYMENT_PLAN',
  description: 'Crea un plan de pago en cuotas para un sponsor o una candidata que ya existen en el sistema.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      clientType: { type: 'string', enum: [...PAYMENT_PLAN_CLIENT_TYPES] },
      clientName: { type: 'string', description: 'Nombre de la candidata, o razón social/RUT del sponsor' },
      totalAmount: { type: 'number', description: 'Monto total en pesos chilenos (CLP), entero' },
      installmentCount: { type: 'number' },
      frequency: { type: 'string', enum: [...PAYMENT_PLAN_FREQUENCIES] },
      startDate: { type: 'string', description: 'Fecha de la primera cuota, formato ISO YYYY-MM-DD' },
      penaltyBps: { type: 'number', description: 'Multa por atraso en basis points sobre la cuota vencida (opcional)' },
      notes: { type: 'string' },
    },
    required: ['clientType', 'clientName', 'totalAmount', 'installmentCount', 'frequency', 'startDate'],
  },
  requiredPermission: 'paymentplans:write',
  async resolve(companyId, rawArgs) {
    const { clientType, clientName, ...rest } = rawArgs as Record<string, unknown>;
    const name = String(clientName ?? '');

    let idFields: { contactId: string } | { candidateId: string };
    let clientLabel: string;
    if (clientType === 'SPONSOR') {
      const contact = await resolveContactByQuery(companyId, name);
      idFields = { contactId: contact.id };
      clientLabel = contact.razonSocial;
    } else {
      const candidate = await resolveCandidateByName(companyId, name);
      idFields = { candidateId: candidate.id };
      clientLabel = candidate.stageName || candidate.fullName;
    }

    const parsed = paymentPlanCreateSchema.safeParse({ clientType, ...idFields, ...rest });
    if (!parsed.success) throw new Error(firstIssueMessage(parsed.error));

    return {
      payload: parsed.data,
      summary: `Crear plan de pago para ${clientLabel} (${clientType === 'SPONSOR' ? 'sponsor' : 'candidata'}): ${formatCurrency(parsed.data.totalAmount)} en ${parsed.data.installmentCount} cuotas.`,
    };
  },
  async execute(companyId, payload) {
    const parsed = paymentPlanCreateSchema.parse(payload);
    const plan = await createPaymentPlan(companyId, parsed);
    return { message: 'Plan de pago creado correctamente.', entityId: plan.id };
  },
};

export const AGENT_ACTIONS: Record<string, AgentAction> = {
  CREATE_CONTACT,
  CREATE_CANDIDATE,
  MARK_CANDIDATE_ATTENDANCE,
  CREATE_PAYMENT_PLAN,
};

export function getAgentAction(type: string): AgentAction | undefined {
  return AGENT_ACTIONS[type];
}
