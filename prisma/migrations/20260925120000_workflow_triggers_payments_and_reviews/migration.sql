-- Siete disparadores nuevos para el motor de automatizaciones. Solo agrega
-- valores al enum: no toca filas existentes y el código anterior sigue
-- funcionando igual (nunca lee estos valores).
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE 'INSTALLMENT_PAID';
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE 'PROMISSORY_NOTE_PAID';
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE 'FEE_DOCUMENT_PAID';
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE 'CASH_SHIFT_CLOSED';
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE 'PURCHASE_REVIEWED';
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE 'GOODS_RECEIPT_CREATED';
ALTER TYPE "WorkflowTriggerEvent" ADD VALUE 'LEAVE_REQUEST_REVIEWED';
