import type { WorkflowActionType, WorkflowTriggerEvent } from '@prisma/client';

export type { WorkflowActionType, WorkflowTriggerEvent } from '@prisma/client';

/**
 * Contrato compartido del motor de automatizaciones: el schema de Prisma
 * guarda `conditions`/`actions` como `Json` (ver prisma/schema.prisma), estos
 * tipos son la forma que la aplicación exige adentro de ese JSON. Zod
 * (`src/modules/automation/schema.ts`) valida contra estos mismos tipos al
 * guardar; el motor (`engine.ts`) confía en que lo que lee ya pasó por Zod.
 */

export type WorkflowEventPayloadValue = string | number | boolean | null;
export type WorkflowEventPayload = Record<string, WorkflowEventPayloadValue>;

export type WorkflowConditionOperator = 'equals' | 'not_equals' | 'greater_than' | 'greater_or_equal' | 'less_than' | 'less_or_equal' | 'contains';

export interface WorkflowCondition {
  field: string;
  operator: WorkflowConditionOperator;
  /** Siempre texto en el formulario — el evaluador decide si compara como número. */
  value: string;
}

export interface WorkflowActionSendEmail {
  type: 'SEND_EMAIL';
  /** Dirección literal o plantilla `{{campo}}` resuelta contra el payload (ej. `{{buyerEmail}}`). */
  to: string;
  subject: string;
  body: string;
}

export interface WorkflowActionCreateNotification {
  type: 'CREATE_NOTIFICATION';
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  /** Ruta interna opcional a la que apunta la notificación en la campanita. */
  href?: string;
}

export interface WorkflowActionCallWebhook {
  type: 'CALL_WEBHOOK';
  url: string;
}

export type WorkflowActionConfig = WorkflowActionSendEmail | WorkflowActionCreateNotification | WorkflowActionCallWebhook;

export interface WorkflowActionResult {
  type: WorkflowActionType;
  success: boolean;
  detail: string;
}

export interface WorkflowTriggerFieldDefinition {
  field: string;
  label: string;
  /** Orienta al evaluador y a la UI (número vs texto) — no cambia cómo se guarda el valor de la condición. */
  kind: 'string' | 'number' | 'boolean';
}

export interface WorkflowTriggerDefinition {
  event: WorkflowTriggerEvent;
  label: string;
  description: string;
  fields: WorkflowTriggerFieldDefinition[];
}

/**
 * Metadata de cada disparador: alimenta tanto el selector de condiciones en
 * la UI (qué campos existen para ese evento) como la documentación en
 * pantalla. Si se agrega un disparador nuevo al enum de Prisma, agregarlo
 * aquí también — si no, el motor lo emite pero la UI no deja crear reglas
 * para él.
 */
export const WORKFLOW_TRIGGER_DEFINITIONS: Record<WorkflowTriggerEvent, WorkflowTriggerDefinition> = {
  SALE_ISSUED: {
    event: 'SALE_ISSUED',
    label: 'Venta emitida',
    description: 'Se emitió un documento de venta (factura, boleta, guía, nota de crédito o débito).',
    fields: [
      { field: 'documentId', label: 'ID del documento', kind: 'string' },
      { field: 'dteType', label: 'Tipo de documento', kind: 'string' },
      { field: 'folio', label: 'Folio', kind: 'number' },
      { field: 'contactId', label: 'ID del cliente', kind: 'string' },
      { field: 'contactName', label: 'Nombre del cliente', kind: 'string' },
      { field: 'totalAmount', label: 'Total', kind: 'number' },
      { field: 'paymentMethod', label: 'Forma de pago', kind: 'string' },
      { field: 'isDte', label: 'Tiene timbre SII', kind: 'boolean' },
    ],
  },
  SALE_CANCELLED: {
    event: 'SALE_CANCELLED',
    label: 'Venta anulada',
    description: 'Se anuló un documento de venta previamente emitido.',
    fields: [
      { field: 'documentId', label: 'ID del documento', kind: 'string' },
      { field: 'dteType', label: 'Tipo de documento', kind: 'string' },
      { field: 'folio', label: 'Folio', kind: 'number' },
      { field: 'totalAmount', label: 'Total', kind: 'number' },
      { field: 'reason', label: 'Motivo', kind: 'string' },
    ],
  },
  PURCHASE_PENDING_APPROVAL: {
    event: 'PURCHASE_PENDING_APPROVAL',
    label: 'Compra pendiente de aprobación',
    description: 'Una compra superó el monto configurado para requerir aprobación.',
    fields: [
      { field: 'documentId', label: 'ID del documento', kind: 'string' },
      { field: 'contactName', label: 'Proveedor', kind: 'string' },
      { field: 'totalAmount', label: 'Total', kind: 'number' },
    ],
  },
  STOCK_BELOW_MINIMUM: {
    event: 'STOCK_BELOW_MINIMUM',
    label: 'Stock bajo el mínimo',
    description: 'El stock total de un producto cayó a su mínimo configurado o por debajo.',
    fields: [
      { field: 'sku', label: 'SKU', kind: 'string' },
      { field: 'productName', label: 'Producto', kind: 'string' },
      { field: 'totalStock', label: 'Stock actual', kind: 'number' },
      { field: 'minStock', label: 'Mínimo configurado', kind: 'number' },
    ],
  },
  RECEIVABLE_OVERDUE: {
    event: 'RECEIVABLE_OVERDUE',
    label: 'Cuenta por cobrar vencida',
    description: 'Un documento de venta a crédito venció sin pagarse.',
    fields: [
      { field: 'folio', label: 'Folio', kind: 'string' },
      { field: 'contactName', label: 'Cliente', kind: 'string' },
      { field: 'pendingAmount', label: 'Monto pendiente', kind: 'number' },
      { field: 'daysOverdue', label: 'Días de atraso', kind: 'number' },
    ],
  },
  DTE_FOLIOS_LOW: {
    event: 'DTE_FOLIOS_LOW',
    label: 'Folios del SII por agotarse',
    description: 'Un rango de folios autorizados (CAF) quedó con pocos folios disponibles.',
    fields: [
      { field: 'dteType', label: 'Tipo de documento', kind: 'string' },
      { field: 'remaining', label: 'Folios restantes', kind: 'number' },
    ],
  },
  CANDIDATE_REGISTERED: {
    event: 'CANDIDATE_REGISTERED',
    label: 'Candidata inscrita',
    description: 'Se recibió una nueva postulación en el formulario público de candidatas.',
    fields: [
      { field: 'candidateId', label: 'ID de la candidata', kind: 'string' },
      { field: 'fullName', label: 'Nombre completo', kind: 'string' },
      { field: 'projectId', label: 'ID del proyecto', kind: 'string' },
      { field: 'projectName', label: 'Proyecto', kind: 'string' },
    ],
  },
  TICKET_PURCHASE_CONFIRMED: {
    event: 'TICKET_PURCHASE_CONFIRMED',
    label: 'Compra de entradas confirmada',
    description: 'Se confirmó el pago de una orden de compra de entradas.',
    fields: [
      { field: 'saleId', label: 'ID de la venta', kind: 'string' },
      { field: 'buyerName', label: 'Comprador', kind: 'string' },
      { field: 'buyerEmail', label: 'Correo del comprador', kind: 'string' },
      { field: 'ticketTypeName', label: 'Tipo de entrada', kind: 'string' },
      { field: 'quantity', label: 'Cantidad', kind: 'number' },
      { field: 'totalAmount', label: 'Total', kind: 'number' },
    ],
  },
  VOTE_ORDER_PAID: {
    event: 'VOTE_ORDER_PAID',
    label: 'Votación pagada',
    description: 'Se confirmó el pago de una orden de votos del público.',
    fields: [
      { field: 'orderId', label: 'ID de la orden', kind: 'string' },
      { field: 'candidateName', label: 'Candidata votada', kind: 'string' },
      { field: 'voteCount', label: 'Cantidad de votos', kind: 'number' },
      { field: 'totalAmount', label: 'Total', kind: 'number' },
    ],
  },
  SPONSORSHIP_SIGNED: {
    event: 'SPONSORSHIP_SIGNED',
    label: 'Auspicio firmado',
    description: 'Un contrato de auspicio quedó con la firma completa.',
    fields: [
      { field: 'contractId', label: 'ID del contrato', kind: 'string' },
      { field: 'sponsorName', label: 'Auspiciador', kind: 'string' },
      { field: 'totalAmount', label: 'Monto del contrato', kind: 'number' },
    ],
  },
  OPPORTUNITY_WON: {
    event: 'OPPORTUNITY_WON',
    label: 'Oportunidad ganada (CRM)',
    description: 'Una oportunidad del embudo comercial se marcó como ganada.',
    fields: [
      { field: 'opportunityId', label: 'ID de la oportunidad', kind: 'string' },
      { field: 'title', label: 'Oportunidad', kind: 'string' },
      { field: 'clientName', label: 'Cliente', kind: 'string' },
      { field: 'amount', label: 'Monto', kind: 'number' },
      { field: 'ownerName', label: 'Vendedor', kind: 'string' },
    ],
  },
  EXPENSE_REPORT_SUBMITTED: {
    event: 'EXPENSE_REPORT_SUBMITTED',
    label: 'Rendición de gastos enviada',
    description: 'Un colaborador envió una rendición de gastos para aprobación.',
    fields: [
      { field: 'reportId', label: 'ID de la rendición', kind: 'string' },
      { field: 'title', label: 'Rendición', kind: 'string' },
      { field: 'submitterName', label: 'Rendida por', kind: 'string' },
      { field: 'totalAmount', label: 'Total', kind: 'number' },
      { field: 'itemCount', label: 'Cantidad de gastos', kind: 'number' },
    ],
  },
  LEAVE_REQUESTED: {
    event: 'LEAVE_REQUESTED',
    label: 'Solicitud de vacaciones o permiso',
    description: 'Se registró una solicitud de vacaciones, licencia o permiso que espera aprobación.',
    fields: [
      { field: 'requestId', label: 'ID de la solicitud', kind: 'string' },
      { field: 'employeeName', label: 'Trabajador', kind: 'string' },
      { field: 'type', label: 'Tipo', kind: 'string' },
      { field: 'businessDays', label: 'Días hábiles', kind: 'number' },
      { field: 'startDate', label: 'Desde', kind: 'string' },
    ],
  },
  PAYROLL_CLOSED: {
    event: 'PAYROLL_CLOSED',
    label: 'Remuneraciones del mes cerradas',
    description: 'Se cerró un período de remuneraciones y sus liquidaciones quedaron congeladas.',
    fields: [
      { field: 'periodLabel', label: 'Período', kind: 'string' },
      { field: 'employeeCount', label: 'Trabajadores', kind: 'number' },
      { field: 'totalNetPay', label: 'Total líquido a pagar', kind: 'number' },
      { field: 'totalEmployerCost', label: 'Costo empresa', kind: 'number' },
    ],
  },
  CRM_LEAD_RECEIVED: {
    event: 'CRM_LEAD_RECEIVED',
    label: 'Prospecto de auspicio desde el sitio del certamen',
    description: 'Una marca completó el formulario "Quiero auspiciar" del micrositio público y quedó como oportunidad en el CRM.',
    fields: [
      { field: 'opportunityId', label: 'ID de la oportunidad', kind: 'string' },
      { field: 'projectName', label: 'Certamen', kind: 'string' },
      { field: 'companyName', label: 'Marca / empresa', kind: 'string' },
      { field: 'contactName', label: 'Nombre de contacto', kind: 'string' },
      { field: 'contactEmail', label: 'Correo de contacto', kind: 'string' },
      { field: 'packageName', label: 'Plan de interés', kind: 'string' },
    ],
  },
  PAYMENT_RECEIVED: {
    event: 'PAYMENT_RECEIVED',
    label: 'Dinero recibido',
    description: 'Entró dinero a Tesorería: cobro de una factura, cuota, entrada, voto, auspicio o pagaré, o un abono conciliado de la cartola.',
    fields: [
      { field: 'paymentId', label: 'ID del movimiento', kind: 'string' },
      { field: 'amount', label: 'Monto', kind: 'number' },
      { field: 'paymentMethod', label: 'Medio de pago', kind: 'string' },
      { field: 'source', label: 'Origen (DOCUMENT, INSTALLMENT, TICKET_SALE…)', kind: 'string' },
      { field: 'description', label: 'Glosa', kind: 'string' },
      { field: 'contactId', label: 'ID del contacto', kind: 'string' },
    ],
  },
  PAYMENT_MADE: {
    event: 'PAYMENT_MADE',
    label: 'Pago realizado',
    description: 'Salió dinero de Tesorería: pago a proveedor, sueldos, cotizaciones, honorarios o reembolso de una rendición.',
    fields: [
      { field: 'paymentId', label: 'ID del movimiento', kind: 'string' },
      { field: 'amount', label: 'Monto', kind: 'number' },
      { field: 'paymentMethod', label: 'Medio de pago', kind: 'string' },
      { field: 'source', label: 'Origen (DOCUMENT, PAYROLL_SALARIES, FEE_DOCUMENT…)', kind: 'string' },
      { field: 'description', label: 'Glosa', kind: 'string' },
      { field: 'contactId', label: 'ID del contacto', kind: 'string' },
    ],
  },
  RECURRING_INVOICES_READY: {
    event: 'RECURRING_INVOICES_READY',
    label: 'Facturas recurrentes listas para revisar',
    description: 'La facturación automática de contratos dejó documentos en borrador esperando que alguien los revise y emita.',
    fields: [{ field: 'draftCount', label: 'Cantidad de borradores', kind: 'number' }],
  },
  RECURRING_BILLING_FAILED: {
    event: 'RECURRING_BILLING_FAILED',
    label: 'Falló la facturación de un contrato',
    description: 'Un contrato recurrente no pudo generar la factura de su período (por ejemplo, sin folios o sobre el límite de crédito del cliente).',
    fields: [
      { field: 'contractId', label: 'ID del contrato', kind: 'string' },
      { field: 'contractName', label: 'Contrato', kind: 'string' },
      { field: 'periodKey', label: 'Período', kind: 'string' },
      { field: 'error', label: 'Motivo', kind: 'string' },
    ],
  },
};

export const WORKFLOW_ACTION_TYPE_LABELS: Record<WorkflowActionType, string> = {
  SEND_EMAIL: 'Enviar correo',
  CREATE_NOTIFICATION: 'Crear notificación interna',
  CALL_WEBHOOK: 'Llamar un webhook',
};

export const WORKFLOW_CONDITION_OPERATOR_LABELS: Record<WorkflowConditionOperator, string> = {
  equals: 'es igual a',
  not_equals: 'es distinto de',
  greater_than: 'es mayor que',
  greater_or_equal: 'es mayor o igual que',
  less_than: 'es menor que',
  less_or_equal: 'es menor o igual que',
  contains: 'contiene',
};
