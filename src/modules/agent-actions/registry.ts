import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { Permission } from '@/lib/auth/permissions';
import { calculateNeto, calculateTotal, formatCurrency } from '@/lib/chile/tax';
import { contactCreateSchema } from '@/modules/contacts/schema';
import { createContact } from '@/modules/contacts/services/contacts.service';
import { candidateCreateSchema, attendanceCreateSchema } from '@/modules/candidates/schema';
import { createCandidate } from '@/modules/candidates/services/candidates.service';
import { addAttendance } from '@/modules/candidates/services/attendance.service';
import { PAYMENT_PLAN_CLIENT_TYPES, PAYMENT_PLAN_FREQUENCIES, paymentPlanCreateSchema } from '@/modules/payment-plans/schema';
import { createPaymentPlan } from '@/modules/payment-plans/services/payment-plans.service';
import { productCreateSchema } from '@/modules/inventory/schema';
import { createProduct } from '@/modules/inventory/services/products.service';
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_RECURRENCES, TASK_RECURRENCE_LABELS, taskSchema } from '@/modules/tasks/schema';
import { createTask } from '@/modules/tasks/services/tasks.service';
import { DEAL_TYPES, DEAL_TYPE_LABELS, opportunityCreateSchema } from '@/modules/crm/schema';
import { createOpportunity } from '@/modules/crm/services/crm.service';
import { projectCreateSchema } from '@/modules/projects/schema';
import { createProject } from '@/modules/projects/services/projects.service';
import { purchaseRequestSchema } from '@/modules/purchases/schema';
import { createPurchaseRequest } from '@/modules/purchases/services/purchase-request.service';
import { salesDocumentCreateSchema } from '@/modules/sales/schema';
import { createSalesDocument } from '@/modules/sales/services/sales.service';
import { getContactPricing } from '@/modules/sales/services/price-lists.service';
import { resolveUnitPrice } from '@/modules/sales/pricing';
import { prisma } from '@/lib/prisma';
import {
  resolveCandidateByName,
  resolveContactByQuery,
  resolveDefaultWarehouse,
  resolveProductByQuery,
  resolveProjectByName,
  resolveUserByName,
} from './resolvers';

/**
 * Acciones que el asistente puede PROPONER (nunca ejecutar directo — ver
 * `src/app/api/ai/manual-assistant/route.ts`). Cada entrada reusa el mismo
 * schema Zod y el mismo `service` que ya usa el formulario real del módulo
 * — el asistente nunca escribe en la base con una query propia, solo llama
 * exactamente lo que llamaría un Server Action normal.
 *
 * Alcance deliberado: altas y borradores que se revisan y corrigen desde su
 * pantalla (un contacto, un producto, una tarea, una cotización en
 * BORRADOR…). Nada que emita un documento tributario, mueva stock, registre
 * un pago o contabilice: eso se sigue haciendo en su pantalla, donde la
 * persona ve el documento completo antes de emitirlo.
 *
 * Agregar una acción nueva de cualquier módulo es solo agregar una entrada
 * acá: no hay que tocar el endpoint, el widget, ni la lógica de
 * permisos/confirmación, que son genéricas.
 */
export interface AgentActor {
  companyId: string;
  userId: string;
  userName: string;
  /** Permisos efectivos de la sesión (ya cruzados con los módulos contratados). */
  permissions: readonly Permission[];
}

export interface AgentActionResolved {
  payload: Record<string, unknown>;
  summary: string;
}

export interface AgentActionResult {
  message: string;
  entityId: string;
  /** Pantalla donde ver lo creado: el widget ofrece un botón "Ver" que lleva ahí. */
  href?: string;
}

export interface AgentAction {
  type: string;
  /** Para el `FunctionDeclaration` de Gemini. */
  description: string;
  parametersJsonSchema: Record<string, unknown>;
  requiredPermission: Permission;
  /** Entidad con la que queda en Auditoría (la misma que usa el formulario del módulo). */
  auditEntity: string;
  /** Valida/traduce los argumentos crudos del modelo (nombres → ids reales) y arma el resumen de confirmación. Lanza con un mensaje legible si algo no calza. */
  resolve(actor: AgentActor, rawArgs: Record<string, unknown>): Promise<AgentActionResolved>;
  /** Ejecuta de verdad — solo se llama después de confirmar. */
  execute(actor: AgentActor, payload: Record<string, unknown>): Promise<AgentActionResult>;
}

function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Datos inválidos';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(value: unknown): string | undefined {
  const result = text(value);
  return result ? result : undefined;
}

function formatIsoDay(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
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
  auditEntity: 'Contact',
  async resolve(_actor, rawArgs) {
    const parsed = contactCreateSchema.safeParse(rawArgs);
    if (!parsed.success) throw new Error(firstIssueMessage(parsed.error));
    const tags = [parsed.data.isCustomer && 'cliente', parsed.data.isSupplier && 'proveedor'].filter(Boolean).join(' y ');
    return {
      payload: parsed.data,
      summary: `Crear contacto "${parsed.data.razonSocial}" (RUT ${parsed.data.rut})${tags ? ` — ${tags}` : ''}.`,
    };
  },
  async execute(actor, payload) {
    const parsed = contactCreateSchema.parse(payload);
    const contact = await createContact(actor.companyId, parsed);
    return { message: `Contacto "${contact.razonSocial}" creado correctamente.`, entityId: contact.id, href: `/dashboard/contacts/${contact.id}` };
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
  auditEntity: 'Candidate',
  async resolve(actor, rawArgs) {
    const { projectName, ...rest } = rawArgs as Record<string, unknown>;
    const project = await resolveProjectByName(actor.companyId, String(projectName ?? ''));
    const parsed = candidateCreateSchema.safeParse({ ...rest, projectId: project.id });
    if (!parsed.success) throw new Error(firstIssueMessage(parsed.error));
    return {
      payload: parsed.data,
      summary: `Crear candidata "${parsed.data.fullName}" (RUT ${parsed.data.rut}) en el proyecto "${project.name}".`,
    };
  },
  async execute(actor, payload) {
    const parsed = candidateCreateSchema.parse(payload);
    const candidate = await createCandidate(actor.companyId, parsed);
    return { message: `Candidata "${candidate.fullName}" creada correctamente.`, entityId: candidate.id, href: `/dashboard/candidates/${candidate.id}` };
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
  auditEntity: 'CandidateAttendance',
  async resolve(actor, rawArgs) {
    const { candidateName, ...rest } = rawArgs as Record<string, unknown>;
    const candidate = await resolveCandidateByName(actor.companyId, String(candidateName ?? ''));
    const parsed = attendanceCreateSchema.safeParse(rest);
    if (!parsed.success) throw new Error(firstIssueMessage(parsed.error));
    const who = candidate.stageName || candidate.fullName;
    const asistio = parsed.data.attended ? 'asistió' : 'no asistió';
    return {
      payload: { candidateId: candidate.id, ...parsed.data },
      summary: `Registrar que ${who} ${asistio} a ${parsed.data.activityType} el ${parsed.data.activityDate.toLocaleDateString('es-CL')}.`,
    };
  },
  async execute(actor, payload) {
    const { candidateId, ...rest } = payload as { candidateId: string } & Record<string, unknown>;
    const parsed = attendanceCreateSchema.parse(rest);
    const attendance = await addAttendance(actor.companyId, candidateId, parsed);
    return { message: 'Asistencia registrada correctamente.', entityId: attendance.id, href: `/dashboard/candidates/${candidateId}` };
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
  auditEntity: 'PaymentPlan',
  async resolve(actor, rawArgs) {
    const { clientType, clientName, ...rest } = rawArgs as Record<string, unknown>;
    const name = String(clientName ?? '');

    let idFields: { contactId: string } | { candidateId: string };
    let clientLabel: string;
    if (clientType === 'SPONSOR') {
      const contact = await resolveContactByQuery(actor.companyId, name);
      idFields = { contactId: contact.id };
      clientLabel = contact.razonSocial;
    } else {
      const candidate = await resolveCandidateByName(actor.companyId, name);
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
  async execute(actor, payload) {
    const parsed = paymentPlanCreateSchema.parse(payload);
    const plan = await createPaymentPlan(actor.companyId, parsed);
    return { message: 'Plan de pago creado correctamente.', entityId: plan.id, href: `/dashboard/payment-plans/${plan.id}` };
  },
};

const CREATE_PRODUCT: AgentAction = {
  type: 'CREATE_PRODUCT',
  description:
    'Crea un producto o servicio en el catálogo. Si el usuario no da un SKU, propón uno corto basado en el nombre (ej. CAFE-500G): queda a la vista en el resumen para que lo confirme. El stock no se carga acá.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      sku: { type: 'string', description: 'Código interno único del producto' },
      name: { type: 'string', description: 'Nombre del producto o servicio' },
      price: { type: 'number', description: 'Precio de venta en CLP, entero' },
      priceIncludesVat: { type: 'boolean', description: 'true si el precio que dio el usuario ya incluye IVA (precio bruto); false o ausente si es neto' },
      isExempt: { type: 'boolean', description: 'Exento de IVA. Solo si el usuario lo dice explícitamente.' },
      unit: { type: 'string', description: 'Unidad: UN, KG, LT, MT, CAJA… (por defecto UN)' },
      minStock: { type: 'number', description: 'Stock mínimo para alertas (opcional)' },
      barcode: { type: 'string', description: 'Código de barras (opcional)' },
      brand: { type: 'string', description: 'Marca (opcional)' },
      description: { type: 'string' },
    },
    required: ['sku', 'name', 'price'],
  },
  requiredPermission: 'products:write',
  auditEntity: 'Product',
  async resolve(_actor, rawArgs) {
    const isExempt = rawArgs.isExempt === true;
    const price = typeof rawArgs.price === 'number' ? Math.round(rawArgs.price) : Number.NaN;
    if (!Number.isFinite(price) || price < 0) throw new Error('Falta un precio válido (en pesos, entero)');
    // Un producto exento no lleva IVA: su precio con o sin IVA es el mismo.
    const netPrice = rawArgs.priceIncludesVat === true && !isExempt ? calculateNeto(price) : price;
    const parsed = productCreateSchema.safeParse({
      sku: text(rawArgs.sku).toUpperCase(),
      name: text(rawArgs.name),
      netPrice,
      isExempt,
      unit: optionalText(rawArgs.unit)?.toUpperCase() ?? 'UN',
      minStock: typeof rawArgs.minStock === 'number' ? Math.max(0, Math.round(rawArgs.minStock)) : undefined,
      barcode: optionalText(rawArgs.barcode),
      brand: optionalText(rawArgs.brand),
      description: optionalText(rawArgs.description),
    });
    if (!parsed.success) throw new Error(firstIssueMessage(parsed.error));
    const priceLabel = parsed.data.isExempt
      ? `${formatCurrency(parsed.data.netPrice)} (exento de IVA)`
      : `${formatCurrency(parsed.data.netPrice)} neto / ${formatCurrency(calculateTotal(parsed.data.netPrice))} con IVA`;
    return {
      payload: parsed.data,
      summary: `Crear producto "${parsed.data.name}" (SKU ${parsed.data.sku}) a ${priceLabel}, unidad ${parsed.data.unit}.`,
    };
  },
  async execute(actor, payload) {
    const parsed = productCreateSchema.parse(payload);
    const product = await createProduct(actor.companyId, parsed);
    return { message: `Producto "${product.name}" creado en el catálogo. Su stock se carga con una compra o un ajuste de inventario.`, entityId: product.id, href: '/dashboard/products' };
  },
};

const quotationLineSchema = z.object({
  product: z.string().min(1),
  quantity: z.number().positive('La cantidad debe ser mayor a cero'),
  unitPrice: z.number().int().min(0).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
});

const CREATE_QUOTATION: AgentAction = {
  type: 'CREATE_QUOTATION',
  description:
    'Deja una COTIZACIÓN en borrador para un cliente existente, con productos del catálogo. No emite ningún documento tributario ni mueve stock: el usuario la revisa y la envía desde Ventas. El precio sale de la lista de precios del cliente o del catálogo, salvo que el usuario dé uno.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      clientQuery: { type: 'string', description: 'Razón social o RUT del cliente' },
      items: {
        type: 'array',
        description: 'Líneas de la cotización',
        items: {
          type: 'object',
          properties: {
            product: { type: 'string', description: 'SKU, código de barras o nombre del producto del catálogo' },
            quantity: { type: 'number' },
            unitPrice: { type: 'number', description: 'Precio NETO unitario en CLP, solo si el usuario lo indicó' },
            discountPercent: { type: 'number', description: '% de descuento de la línea (opcional)' },
          },
          required: ['product', 'quantity'],
        },
      },
      notes: { type: 'string', description: 'Observaciones para el cliente (opcional)' },
    },
    required: ['clientQuery', 'items'],
  },
  requiredPermission: 'sales:write',
  auditEntity: 'SalesDocument',
  async resolve(actor, rawArgs) {
    const contact = await resolveContactByQuery(actor.companyId, text(rawArgs.clientQuery));
    const rawItems = Array.isArray(rawArgs.items) ? rawArgs.items : [];
    if (rawItems.length === 0) throw new Error('Indica al menos un producto con su cantidad');
    if (rawItems.length > 30) throw new Error('Máximo 30 líneas por cotización desde el asistente');

    const [warehouse, pricing] = await Promise.all([resolveDefaultWarehouse(actor.companyId), getContactPricing(actor.companyId, contact.id)]);
    const items = [];
    const lines: string[] = [];
    let netSubtotal = 0;
    for (const raw of rawItems) {
      const line = quotationLineSchema.safeParse(raw);
      if (!line.success) throw new Error(firstIssueMessage(line.error));
      const product = await resolveProductByQuery(actor.companyId, line.data.product);
      const unitPrice = line.data.unitPrice ?? resolveUnitPrice(product.netPrice, pricing.tiers[product.id] ?? [], line.data.quantity);
      const discount = line.data.discountPercent ?? 0;
      items.push({ productId: product.id, sku: product.sku, description: product.name, quantity: line.data.quantity, unitPrice, discountPercent: discount || undefined });
      netSubtotal += Math.round(line.data.quantity * unitPrice * (1 - discount / 100));
      lines.push(`${line.data.quantity} × ${product.name} a ${formatCurrency(unitPrice)} neto${discount ? ` (−${discount}%)` : ''}`);
    }

    const parsed = salesDocumentCreateSchema.safeParse({
      contactId: contact.id,
      warehouseId: warehouse.id,
      dteType: 'COTIZACION',
      paymentMethod: 'EFECTIVO',
      notes: optionalText(rawArgs.notes),
      sellerId: actor.userId,
      // El token de confirmación ya es de un solo uso; esto además protege
      // contra un reintento del servicio igual que en el formulario.
      idempotencyKey: `assistant-${randomUUID()}`,
      items,
    });
    if (!parsed.success) throw new Error(firstIssueMessage(parsed.error));
    const listNote = pricing.priceListName ? ` Precios según la lista "${pricing.priceListName}".` : '';
    return {
      payload: parsed.data,
      summary: `Dejar en borrador una cotización para ${contact.razonSocial}: ${lines.join('; ')}. Subtotal ${formatCurrency(netSubtotal)} neto (el IVA se calcula al guardarla).${listNote}`,
    };
  },
  async execute(actor, payload) {
    const parsed = salesDocumentCreateSchema.parse(payload);
    if (parsed.dteType !== 'COTIZACION') throw new Error('El asistente solo puede crear cotizaciones');
    const document = await createSalesDocument(actor.companyId, parsed, 'DRAFT');
    return {
      message: `Cotización guardada como borrador por ${formatCurrency(document.totalAmount)}. Revísala, imprímela o conviértela desde Ventas.`,
      entityId: document.id,
      href: `/dashboard/sales/${document.id}`,
    };
  },
};

const CREATE_TASK: AgentAction = {
  type: 'CREATE_TASK',
  description: 'Crea una tarea del equipo (Tareas y delegación), opcionalmente repetitiva y asignada a otra persona.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Qué hay que hacer' },
      description: { type: 'string' },
      dueDate: { type: 'string', description: 'Fecha límite, formato ISO YYYY-MM-DD (opcional)' },
      priority: { type: 'string', enum: [...TASK_PRIORITIES] },
      recurrence: { type: 'string', enum: [...TASK_RECURRENCES], description: 'NONE, DAILY, WEEKLY o MONTHLY' },
      assigneeName: { type: 'string', description: 'Nombre de la persona responsable, si no es quien la pide (solo dueño o administrador pueden asignar a otros)' },
    },
    required: ['title'],
  },
  requiredPermission: 'tasks:write',
  auditEntity: 'TeamTask',
  async resolve(actor, rawArgs) {
    const assigneeQuery = optionalText(rawArgs.assigneeName);
    const assignee = assigneeQuery ? await resolveUserByName(actor.companyId, assigneeQuery) : null;
    if (assignee && assignee.id !== actor.userId && !actor.permissions.includes('tasks:manage')) {
      throw new Error('Solo el dueño o un administrador puede asignar tareas a otras personas');
    }
    const parsed = taskSchema.safeParse({
      title: text(rawArgs.title),
      description: optionalText(rawArgs.description),
      dueDate: optionalText(rawArgs.dueDate)?.slice(0, 10) ?? null,
      priority: optionalText(rawArgs.priority) ?? 'NORMAL',
      recurrence: optionalText(rawArgs.recurrence) ?? 'NONE',
      assigneeId: assignee?.id ?? null,
    });
    if (!parsed.success) throw new Error(firstIssueMessage(parsed.error));
    const parts = [
      `Crear la tarea "${parsed.data.title}"`,
      `para ${assignee && assignee.id !== actor.userId ? assignee.name : 'ti'}`,
      parsed.data.dueDate ? `con plazo el ${formatIsoDay(parsed.data.dueDate)}` : 'sin plazo',
      `prioridad ${TASK_PRIORITY_LABELS[parsed.data.priority].toLowerCase()}`,
      parsed.data.recurrence !== 'NONE' ? TASK_RECURRENCE_LABELS[parsed.data.recurrence].toLowerCase() : null,
    ].filter(Boolean);
    return { payload: parsed.data, summary: `${parts.join(', ')}.` };
  },
  async execute(actor, payload) {
    const parsed = taskSchema.parse(payload);
    const created = await createTask({ companyId: actor.companyId, userId: actor.userId, canManage: actor.permissions.includes('tasks:manage') }, parsed);
    return { message: 'Tarea creada.', entityId: created.id, href: '/dashboard/tasks' };
  },
};

const CREATE_OPPORTUNITY: AgentAction = {
  type: 'CREATE_OPPORTUNITY',
  description:
    'Registra un negocio en el CRM (embudo). Si la marca o cliente ya existe como contacto se asocia; si no, queda como prospecto con ese nombre. Queda a cargo de quien la pide.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Nombre del negocio (ej. "Auspicio Café Andino 2027")' },
      clientName: { type: 'string', description: 'Marca o cliente: razón social, RUT o nombre del prospecto' },
      amount: { type: 'number', description: 'Monto estimado en CLP, entero' },
      dealType: { type: 'string', enum: [...DEAL_TYPES], description: 'Tipo de negocio' },
      expectedCloseDate: { type: 'string', description: 'Fecha estimada de cierre, ISO YYYY-MM-DD (opcional)' },
      projectName: { type: 'string', description: 'Certamen asociado, por nombre o código (opcional)' },
      prospectEmail: { type: 'string' },
      prospectPhone: { type: 'string' },
      notes: { type: 'string' },
    },
    required: ['title', 'clientName', 'amount'],
  },
  requiredPermission: 'crm:write',
  auditEntity: 'Opportunity',
  async resolve(actor, rawArgs) {
    const clientName = text(rawArgs.clientName);
    if (!clientName) throw new Error('Falta la marca o el cliente del negocio');
    // Un contacto existente se asocia; "no encontrado" es un prospecto nuevo,
    // pero "varios" sigue siendo un error: elegir uno al azar asociaría el
    // negocio a la marca equivocada.
    const contact = await resolveContactByQuery(actor.companyId, clientName).catch((error: unknown) => {
      if (error instanceof Error && error.message.startsWith('Encontré varios')) throw error;
      return null;
    });
    const projectQuery = optionalText(rawArgs.projectName);
    const project = projectQuery ? await resolveProjectByName(actor.companyId, projectQuery) : null;
    const parsed = opportunityCreateSchema.safeParse({
      title: text(rawArgs.title),
      contactId: contact?.id,
      prospectName: contact ? undefined : clientName,
      prospectEmail: optionalText(rawArgs.prospectEmail),
      prospectPhone: optionalText(rawArgs.prospectPhone),
      amount: typeof rawArgs.amount === 'number' ? Math.round(rawArgs.amount) : Number.NaN,
      dealType: optionalText(rawArgs.dealType),
      expectedCloseDate: optionalText(rawArgs.expectedCloseDate),
      projectId: project?.id,
      notes: optionalText(rawArgs.notes),
      ownerUserId: actor.userId,
    });
    if (!parsed.success) throw new Error(firstIssueMessage(parsed.error));
    const who = contact ? contact.razonSocial : `${clientName} (prospecto nuevo)`;
    const type = parsed.data.dealType ? `${DEAL_TYPE_LABELS[parsed.data.dealType]}, ` : '';
    return {
      payload: parsed.data,
      summary: `Crear el negocio "${parsed.data.title}" con ${who}: ${type}${formatCurrency(parsed.data.amount)}, etapa Prospecto${project ? `, certamen "${project.name}"` : ''}.`,
    };
  },
  async execute(actor, payload) {
    const parsed = opportunityCreateSchema.parse(payload);
    const created = await createOpportunity(actor.companyId, { ...parsed, ownerUserId: parsed.ownerUserId ?? actor.userId });
    return { message: `Negocio "${created.title}" registrado en el embudo.`, entityId: created.id, href: '/dashboard/crm' };
  },
};

const CREATE_PROJECT: AgentAction = {
  type: 'CREATE_PROJECT',
  description: 'Crea un certamen o evento (proyecto) con sus fechas y, si se conoce, la fecha de la gala y el recinto.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Código corto único (ej. RV27). Si no lo dan, propón uno a partir del nombre.' },
      name: { type: 'string' },
      startDate: { type: 'string', description: 'Fecha de inicio, ISO YYYY-MM-DD' },
      endDate: { type: 'string', description: 'Fecha de término, ISO YYYY-MM-DD (opcional)' },
      galaDate: { type: 'string', description: 'Fecha y hora de la gala final, ISO (opcional)' },
      venueName: { type: 'string', description: 'Recinto (opcional)' },
      budgetedIncome: { type: 'number', description: 'Presupuesto de ingresos en CLP (opcional)' },
      budgetedExpense: { type: 'number', description: 'Presupuesto de gastos en CLP (opcional)' },
    },
    required: ['code', 'name', 'startDate'],
  },
  requiredPermission: 'projects:write',
  auditEntity: 'Project',
  async resolve(actor, rawArgs) {
    const code = text(rawArgs.code).toUpperCase();
    const duplicate = code ? await prisma.project.findFirst({ where: { companyId: actor.companyId, code }, select: { id: true } }) : null;
    if (duplicate) throw new Error(`Ya existe un certamen con el código ${code}: propón otro código`);
    const parsed = projectCreateSchema.safeParse({
      code,
      name: text(rawArgs.name),
      startDate: optionalText(rawArgs.startDate),
      endDate: optionalText(rawArgs.endDate),
      galaDate: optionalText(rawArgs.galaDate) ?? null,
      venueName: optionalText(rawArgs.venueName),
      budgetedIncome: typeof rawArgs.budgetedIncome === 'number' ? Math.round(rawArgs.budgetedIncome) : undefined,
      budgetedExpense: typeof rawArgs.budgetedExpense === 'number' ? Math.round(rawArgs.budgetedExpense) : undefined,
    });
    if (!parsed.success) throw new Error(firstIssueMessage(parsed.error));
    const start = parsed.data.startDate.toLocaleDateString('es-CL', { timeZone: 'UTC' });
    const gala = parsed.data.galaDate ? `, gala el ${parsed.data.galaDate.toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}` : '';
    return {
      payload: { ...parsed.data, startDate: parsed.data.startDate.toISOString(), endDate: parsed.data.endDate?.toISOString(), galaDate: parsed.data.galaDate?.toISOString() ?? null },
      summary: `Crear el certamen "${parsed.data.name}" (código ${parsed.data.code}), desde el ${start}${gala}${parsed.data.venueName ? ` en ${parsed.data.venueName}` : ''}.`,
    };
  },
  async execute(actor, payload) {
    const parsed = projectCreateSchema.parse(payload);
    const project = await createProject(actor.companyId, parsed);
    return { message: `Certamen "${project.name}" creado. Desde su centro de mando sigues con candidatas, auspicios y sitio público.`, entityId: project.id, href: `/dashboard/projects/${project.id}` };
  },
};

const CREATE_PURCHASE_REQUEST: AgentAction = {
  type: 'CREATE_PURCHASE_REQUEST',
  description: 'Crea una solicitud de compra interna (lo que se necesita comprar), como borrador o enviada a aprobación.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Qué se necesita, en una línea' },
      neededBy: { type: 'string', description: 'Para cuándo, ISO YYYY-MM-DD (opcional)' },
      notes: { type: 'string', description: 'Justificación o proveedor sugerido (opcional)' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            quantity: { type: 'number' },
            unit: { type: 'string', description: 'Unidad (opcional)' },
          },
          required: ['description', 'quantity'],
        },
      },
      submit: { type: 'boolean', description: 'true para enviarla directo a aprobación; por defecto queda en borrador' },
    },
    required: ['title', 'items'],
  },
  requiredPermission: 'purchases:request',
  auditEntity: 'PurchaseRequest',
  async resolve(_actor, rawArgs) {
    const parsed = purchaseRequestSchema.safeParse({
      title: text(rawArgs.title),
      neededBy: optionalText(rawArgs.neededBy)?.slice(0, 10),
      notes: optionalText(rawArgs.notes),
      items: Array.isArray(rawArgs.items) ? rawArgs.items : [],
    });
    if (!parsed.success) throw new Error(firstIssueMessage(parsed.error));
    const submit = rawArgs.submit === true;
    const items = parsed.data.items.map((item) => `${item.quantity}${item.unit ? ` ${item.unit}` : ''} de ${item.description}`).join('; ');
    return {
      payload: { ...parsed.data, submit },
      summary: `Crear la solicitud de compra "${parsed.data.title}"${parsed.data.neededBy ? ` para el ${formatIsoDay(parsed.data.neededBy)}` : ''}: ${items}. Quedará ${submit ? 'enviada a aprobación' : 'en borrador'}.`,
    };
  },
  async execute(actor, payload) {
    const { submit, ...rest } = payload as { submit?: boolean } & Record<string, unknown>;
    const parsed = purchaseRequestSchema.parse(rest);
    const created = await createPurchaseRequest(actor.companyId, { id: actor.userId, name: actor.userName }, parsed, submit === true);
    return { message: `Solicitud de compra N° ${created.folio} creada${submit ? ' y enviada a aprobación' : ' como borrador'}.`, entityId: created.id, href: `/dashboard/purchase-requests/${created.id}` };
  },
};

export const AGENT_ACTIONS: Record<string, AgentAction> = {
  CREATE_CONTACT,
  CREATE_PRODUCT,
  CREATE_QUOTATION,
  CREATE_TASK,
  CREATE_OPPORTUNITY,
  CREATE_PROJECT,
  CREATE_PURCHASE_REQUEST,
  CREATE_CANDIDATE,
  MARK_CANDIDATE_ATTENDANCE,
  CREATE_PAYMENT_PLAN,
};

export function getAgentAction(type: string): AgentAction | undefined {
  return AGENT_ACTIONS[type];
}

/** Acciones que este usuario puede pedirle al asistente (el permiso se revalida igual al proponer y al confirmar). */
export function availableAgentActions(permissions: readonly Permission[]): AgentAction[] {
  return Object.values(AGENT_ACTIONS).filter((action) => permissions.includes(action.requiredPermission));
}
