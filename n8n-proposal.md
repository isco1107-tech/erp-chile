# Propuesta completa de automatización con n8n para este ERP

## 1. Objetivo

Implementar una capa de automatización basada en n8n para reducir tiempos operativos, mejorar la velocidad de respuesta comercial y conectar el ERP con canales externos como email, WhatsApp, Slack, Google Drive/Sheets y firma digital, sin comprometer la lógica crítica del negocio.

## 2. Principio arquitectónico

La regla principal será:

- El ERP sigue siendo la fuente de verdad para validaciones, permisos, inventario, costos, impuestos, auditoría y transacciones críticas.
- n8n actuará como orquestador externo para workflows repetitivos, comunicaciones y sincronizaciones.
- Los eventos del ERP se publicarán mediante webhooks HTTP o endpoints internos, y n8n reaccionará a ellos.

Esto evita que n8n replique lógica financiera o contable, y mantiene la integridad del sistema.

## 3. Estado actual del proyecto que ya ayuda a la integración

El proyecto ya tiene varios elementos clave que permiten una integración limpia con n8n:

- Endpoint genérico de webhooks: `src/app/api/webhooks/route.ts`
- Servicio de idempotencia: `src/modules/webhooks/services/webhook-idempotency.service.ts`
- Cron jobs para recordatorios: `src/modules/calendar/services/event-reminders.service.ts`
- Cron jobs para cuotas vencidas: `src/modules/payment-plans/services/overdue-reminder-cron.service.ts`
- Centralización de emails: `src/lib/email/mailer.ts`
- Normalización de teléfonos para WhatsApp: `src/lib/phone.ts` y `src/lib/chile/phone.ts`

Esto significa que no estamos arrancando desde cero: ya hay base para eventos, deduplicación y notificaciones.

## 4. Alcance recomendado

### 4.1. Casos de uso de alta prioridad

1. Seguimiento automático de candidaturas / clientes / oportunidades
2. Recordatorios de pagos y cuotas vencidas
3. Notificaciones por WhatsApp y email
4. Firma electrónica y flujo de documentos
5. Alertas de inventario y stock bajo
6. Reportes periódicos automatizados

### 4.2. Casos de uso fuera de alcance para n8n

- Cálculos tributarios
- Contabilidad y posting
- Inventario crítico / costo PMP
- Control de permisos y RBAC
- Validaciones multi-tenant
- Transacciones financieras con impactos contables directos

## 5. Arquitectura propuesta

### 5.1. Flujo general

1. ElERP registra un evento o cambia un estado relevante.
2. Se emite un webhook a n8n, con payload tipado y eventId único.
3. n8n valida, enruta y ejecuta el workflow.
4. n8n publica notificaciones, sincronizaciones o tareas externas.
5. El ERP sigue siendo quien actualiza registros críticos y mantiene auditoría.

### 5.2. Componentes

- ERP: fuente de verdad
- n8n: motor de orquestación
- Webhooks: canal de eventos
- Storage externo: Drive / Sheets / Notion / CRM
- Mensajería: WhatsApp, Email, Slack
- Firmas digitales: ZapSign u otro provedor

## 6. Eventos recomendados a publicar

### 6.1. Candidate / CRM

- `candidate.created`
- `candidate.stage_changed`
- `candidate.assigned`
- `candidate.contract_requested`
- `candidate.contract_signed`

### 6.2. Ventas / pagos

- `sales.document.created`
- `sales.document.status_changed`
- `payment.plan.overdue`
- `payment.received`
- `invoice.pending`

### 6.3. Inventario / operaciones

- `inventory.stock_low`
- `purchase.order.received`
- `goods.receipt.created`

### 6.4. Documentos / firma

- `document.signature_requested`
- `document.signature_completed`
- `document.signature_rejected`

### 6.5. Operaciones internas

- `calendar.event_upcoming`
- `reminder.sent`
- `report.generated`

## 7. Payload mínimo recomendado

Todos los eventos deben incluir:

```json
{
  "eventId": "uuid",
  "eventType": "candidate.stage_changed",
  "occurredAt": "2026-09-08T12:00:00.000Z",
  "companyId": "company_123",
  "tenant": "empresa-xyz",
  "entityType": "Candidate",
  "entityId": "cand_456",
  "actor": {
    "userId": "usr_1",
    "userEmail": "admin@empresa.cl"
  },
  "payload": {
    "previousStage": "screening",
    "newStage": "interview",
    "candidateName": "María Elena",
    "contactEmail": "maria@empresa.cl",
    "contactPhone": "+56912345678"
  }
}
```

## 8. Recomendaciones técnicas para este proyecto

### 8.1. Reutilizar el webhook existente

El endpoint actual en `src/app/api/webhooks/route.ts` ya hace lo esencial:

- extrae `provider`, `eventId`, `eventType`
- recibe body
- registra el evento en `ProcessedWebhookEvent`
- descarta eventos duplicados

Eso es una base excelente para n8n. La propuesta es extenderlo con:

- validación de payloads por tipo
- payload schemas con Zod
- endpoint específico por dominio cuando sea necesario
- integración de logging y audit

### 8.2. Criterio de idempotencia

Se recomienda conservar y fortalecer lo ya hecho:

- El `eventId` debe ser único por origen y por tipo de evento.
- `ProcessedWebhookEvent` debe registrar:
  - provider
  - eventId
  - eventType
  - companyId
  - processedAt
  - payload hash

Esto permite que n8n pueda retry sin duplicar acciones.

### 8.3. Criterio de seguridad

- Usar secret token para n8n
- No confiar en payload del webhook para decisiones críticas
- Validar companyId y permisos en el ERP
- Mantener `x-company-id` y `x-webhook-event-id` para debugging

## 9. Workflows recomendados

## Workflow A: Seguimiento de candidaturas

### Objetivo
Automatizar la comunicación y coordinación cuando cambia la etapa de una candidatura.

### Trigger
`candidate.stage_changed`

### Acciones
1. n8n recibe el evento
2. valida el payload
3. consulta datos adicionales desde ERP o CRM
4. decide canal:
   - email
   - WhatsApp
   - Slack interna
5. envía notificación
6. registra respuesta o genera tarea interna

### Salidas esperadas
- Email al cliente o responsable
- Mensaje por WhatsApp
- Aviso a equipo de recruiting
- Registro de seguimiento en CRM o hoja

### Archivos relevantes
- `src/modules/candidates/actions/candidates.actions.ts`
- `src/modules/candidates/services/candidates.service.ts`

---

## Workflow B: Recordatorio de cuotas vencidas

### Objetivo
Reducir tiempo de cobranza y mejorar tasa de recuperación.

### Trigger
`payment.plan.overdue`

### Acciones
1. n8n recibe el evento
2. obtienen datos del cliente
3. decide si mandar:
   - email recordatorio
   - WhatsApp
   - alerta a cobranzas
4. reintenta con pausa programada
5. si no responde, escala a responsable

### Salidas esperadas
- Mensaje multicanal
- Registro de estado en CRM o tabla de seguimiento
- Tarea de cobranza

### Archivos relevantes
- `src/modules/payment-plans/services/overdue-reminder-cron.service.ts`
- `src/modules/payment-plans/services/payment-plans.service.ts`

---

## Workflow C: Documentos y firma digital

### Objetivo
Automatizar el ciclo de firma de contratos, cronogramas, acuerdos y documentos.

### Trigger
`document.signature_requested`

### Acciones
1. n8n notifica a destinatario
2. espera confirmación o firma
3. cuando se completa, recibe webhook de ZapSign
4. actualiza estado del documento en ERP
5. guarda copia en Drive/Cloud
6. alerta al equipo responsable

### Archivos relevantes
- `src/app/api/webhooks/zapsign/route.ts`
- `src/lib/zapsign/client.ts`
- `src/modules/candidates/services/documents.service.ts`

---

## Workflow D: Alertas de stock bajo

### Objetivo
Reducir retrasos operativos al prevenir faltantes.

### Trigger
`inventory.stock_low`

### Acciones
1. n8n recibe evento
2. consulta umbral de stock
3. notifica al almacén y compras
4. si aplica, crea compra sugerida o tarea

### Archivos relevantes
- `src/modules/inventory/`
- `src/modules/purchases/`

---

## Workflow E: Reportes periódicos automáticos

### Objetivo
Entregar reportes útiles sin intervención manual.

### Trigger
cron semanal o mensual

### Acciones
1. n8n consulta endpoints del ERP para datasets
2. genera un resumen
3. envía por email o Slack
4. guarda copia en Drive o Sheets

### Archivos relevantes
- `src/modules/reports/`
- `src/modules/agents/`

## 10. Endpoints y rutas recomendadas para agregar

### 10.1. Endpoint de eventos del ERP

- `POST /api/webhooks/{eventType}`

Uso:

- `/api/webhooks/candidate-stage`
- `/api/webhooks/payment-overdue`
- `/api/webhooks/document-signed`
- `/api/webhooks/inventory-low-stock`

Esto permite separar responsabilidades por dominio y facilita debugging.

### 10.2. Endpoint para consultas de n8n

- `GET /api/integrations/n8n/report/<tipo>`
- `GET /api/integrations/n8n/summary/<empresa>`

Estos endpoints deben devolver data ya preparada para n8n, no lógica compleja.

### 10.3. Endpoint de configuración

- `GET /api/integrations/n8n/config`

Debe devolver:

- nombres de workflows disponibles
- secrets configuradas o no
- endpoints activos
- estado general

## 11. Cambios concretos que Claude Code debería implementar

### Fase 1 — Base de integración

1. Proteger y ampliar `src/app/api/webhooks/route.ts`
   - validar eventType
   - validar payload tipo
   - registrar métricas

2. Crear helpers tipados por evento
   - `src/modules/webhooks/types.ts`
   - `src/modules/webhooks/schemas.ts`

3. Añadir servicio de evento de negocio
   - `src/modules/webhooks/event-dispatcher.ts`

4. Añadir logging y auditoría detallada
   - `processedAt`, `source`, `status`, `retryCount`

### Fase 2 — Los primeros workflows

5. Agregar endpoint para `candidate.stage_changed`
6. Agregar endpoint para `payment.plan.overdue`
7. Agregar endpoint para `document.signature_completed`

### Fase 3 — Integraciones externas

8. Configurar n8n para:
   - WhatsApp
   - email
   - Slack
   - Google Sheets/Drive

9. Crear plantillas base y mensajes estándar

### Fase 4 — Operación

10. Añadir documentacion interna
11. Añadir checks de salud y monitoreo
12. Añadir dashboard básico de eventos

## 12. Recomendaciones de datos para n8n

n8n debería recibir solo lo necesario:

- IDs
- nombres
- emails / teléfonos
- estados
- timestamps
- compañía
- links o URLs

No necesita:

- el contenido completo de la transacción contable
- detalles internos no relevantes para la operación
- datos sensibles innecesarios

## 13. Criterios de aceptación

### 13.1. General

- Cada webhook recibe `eventId` y responde `200 OK`
- Los eventos duplicados no crean acciones extra
- Los errores se registran en auditoría
- Las ejecuciones fallidas se pueden reintentar

### 13.2. Candidate workflow

- Al cambiar la etapa, se dispara exactamente un workflow
- Se envía el mensaje adecuado según configuración
- Se registra el seguimiento externo

### 13.3. Payment workflow

- Una cuota vencida genera recordatorio programado
- Si el cliente responde, no se envían más recordatorios
- El equipo recibe alerta en el canal correcto

### 13.4. Document workflow

- La firma completa dispara evento de confirmación
- Se guarda copia externa
- Se actualiza estado interno

## 14. Riesgos y mitigaciones

### Riesgo: duplicación de notificaciones
Mitigación: eventId + idempotencia + dedupe en n8n y ERP.

### Riesgo: sobreconexión de n8n con lógica crítica
Mitigación: no dejar que n8n haga posteo contable o cambios de inventario decisivos.

### Riesgo: payload inconsistente
Mitigación: schemas Zod y validación en endpoints.

### Riesgo: envíos no deseados
Mitigación: feature flags por empresa y canal.

## 15. Solicitud de implementación para Claude Code

El siguiente prompt puede usarse para que Claude Code ejecute la propuesta:

```text
Actúa como ingeniero Full Stack para este proyecto ERP.

Objetivo: implementar una propuesta base de automatización con n8n, preservando la lógica crítica del ERP y mejorando velocidad operativa.

Requisitos:
1. Revisar y reforzar la infraestructura existente de webhooks en src/app/api/webhooks/route.ts y src/modules/webhooks/services/webhook-idempotency.service.ts.
2. Añadir schemas y helpers tipados para eventos de negocio de candidatos, pagos, documentos e inventario.
3. Crear endpoints específicos para cada tipo de evento (candidate.stage_changed, payment.plan.overdue, document.signature_completed, inventory.stock_low).
4. Añadir documentacion de payloads y una guía de integración n8n.
5. No tocar lógica contable, fiscal, permisos, ni cambios críticos en Prisma sin requerir validación explícita.
6. Mantener idempotencia, auditoría y logs por evento.
7. Priorizar workflows A, B y C descritos en esta propuesta.
8. Dejar tests o validaciones básicas para los endpoints y la deduplicación.

Entrega esperada:
- Código fuente listo para integrar con n8n
- Documentación del diseño
- Lista de workflows sugeridos
- Criterios de aceptación verificados
```

## 16. Orden recomendado de implementación

1. Base de webhooks yidempotencia
2. Eventos de candidatos
3. Eventos de pagos y vencimientos
4. Eventos de firma y documentos
5. Alertas de inventario y reportes
6. Integraciones externas y n8n workflows

## 17. Resultado esperado

Con esta propuesta, el ERP quedará preparado para:

- reducir tiempos manuales,
- mejorar comunicacion por WhatsApp y email,
- acelerar seguimiento comercial,
- automatizar tareas repetitivas,
- y conectar la operación con el ecosistema de herramientas externas sin poner en riesgo la lógica central del negocio.

## 18. Próximo paso sugerido

Si quieres, el siguiente paso puede ser:

- convertir esta propuesta en un prompt más corto y específico para Claude Code,
- o dejar preparados los archivos exactos y endpoints que Claude Code debería crear primero.
