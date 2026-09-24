# Aether: ERP chileno + producción de certámenes

Plataforma donde una empresa lleva su operación tributaria chilena (ventas, compras, inventario, contabilidad) y produce certámenes (postulación, jurado, show en vivo, auspicios, entradas, votación). Ambas mitades comparten empresa, contactos y contabilidad. El nombre en código de cada término va entre paréntesis.

## Empresa y acceso

**Empresa** (`Company`):
Quien contrata Aether; unidad de aislamiento de todos los datos.
_Avoid_: cliente, tenant, organización, cuenta

**Usuario** (`User`):
Persona que inicia sesión; puede tener acceso a varias empresas.
_Avoid_: miembro, cuenta

**Acceso** (`CompanyMembership`):
Vínculo de un usuario con una empresa, con un rol en ella.
_Avoid_: membresía, cuenta

## Contactos

**Contacto** (`Contact`):
Cualquier persona o empresa con RUT con la que hay relación tributaria.
_Avoid_: tercero, entidad

**Cliente** / **Proveedor**:
Roles de un contacto, no entidades aparte; un mismo contacto puede ser ambos.
_Avoid_: comprador, vendedor

**Persona de contacto** (`CrmPerson`):
El ser humano con quien se negocia en el CRM; puede no tener RUT todavía y ligarse después a un contacto.
_Avoid_: lead, prospecto

## Tributario

**Documento de venta** (`SalesDocument`):
Cualquier documento que registra una venta o una oferta de venta, sea o no DTE.
_Avoid_: venta (para el documento)

**DTE**:
Documento de venta con código del SII (factura, boleta, guía, nota de débito o crédito).
_Avoid_: documento electrónico, comprobante

**Cotización**:
Documento de venta que no es DTE; nunca lleva folio ni timbre.
_Avoid_: presupuesto, proforma

**Emitir**:
Pasar un documento de venta de borrador a emitido.
_Avoid_: timbrar, enviar

**Timbrar**:
Firmar un DTE con la llave del CAF; un DTE emitido sin CAF queda sin timbre y sin validez tributaria.
_Avoid_: emitir, firmar (a secas)

**Folio**:
Número tributario de un DTE, tomado del rango autorizado por el SII.
_Avoid_: usar "folio" para cualquier otro correlativo

**Anular**:
Dejar sin efecto dentro de Aether un documento de venta que aún no llega al SII.
_Avoid_: anular un DTE ya enviado (eso se corrige con nota de crédito)

**Nota de crédito**:
DTE que revierte total o parcialmente otro DTE; única forma de corregir uno ya enviado al SII.
_Avoid_: anulación, devolución (para el documento)

## Punto de venta

**Caja** (`CashRegister`):
Punto de cobro físico, asociado a una bodega.
_Avoid_: POS, terminal

**Turno** (`CashShift`):
Período entre la apertura y el cierre de una caja.
_Avoid_: sesión, jornada

**Arqueo**:
Conteo de efectivo al cerrar un turno, comparado con lo esperado.
_Avoid_: cuadratura, cierre (para el conteo)

## Cobranza

**Plan de pago** (`PaymentPlan`):
Acuerdo para pagar un monto en cuotas.
_Avoid_: convenio, crédito

**Cuota** (`PaymentPlanInstallment`):
Cada pago con vencimiento propio dentro de un plan de pago.
_Avoid_: mensualidad, letra

**Deudor**:
El contacto que firma el plan de pago; puede ser la candidata o su apoderado.
_Avoid_: titular

**Beneficiaria**:
La candidata a quien corresponden las cuotas de un plan de pago; el portal de pago la busca por su RUT.
_Avoid_: deudora (cuando no firmó el plan)

**Pagador**:
Quien hace una transferencia en línea para pagar cuotas; puede no ser ni el deudor ni la beneficiaria.
_Avoid_: deudor, cliente

**Orden de pago en línea** (`InstallmentPaymentOrder`):
Un intento de cobro por Khipu para una o más cuotas; solo vale cuando el proveedor lo confirma.
_Avoid_: pago (antes de confirmarse)

**Comprobante de pago**:
Documento no tributario, numerado, que se emite cuando una orden de pago en línea queda pagada.
_Avoid_: boleta, recibo

## Certámenes

**Proyecto** (`Project`):
Contenedor de negocio con presupuesto, ingresos y gastos propios.
_Avoid_: evento

**Certamen**:
Proyecto con candidatas, jurado y micrositio público.
_Avoid_: evento, concurso

**Ficha** (`Candidate`):
Registro de una persona en un certamen, en cualquier etapa.
_Avoid_: candidate (como término general)

**Postulante**:
Ficha que aún no llega a candidata oficial (`APPLICANT`, `UNDER_REVIEW`, `CALLED_TO_CASTING`).
_Avoid_: candidata, aspirante

**Candidata**:
Ficha desde candidata oficial en adelante; **finalista** y **ganadora** son etapas de la candidata.
_Avoid_: participante, concursante

**Número de postulación** (`Candidate.folio`):
Correlativo que recibe una ficha al postular por el formulario público.
_Avoid_: folio

### Jurado

**Jurado** (`JudgeAssignment`):
Una persona que evalúa, con acceso propio por enlace.
_Avoid_: juez, evaluador

**Panel de jurado**:
El conjunto de jurados de un certamen.
_Avoid_: jurado (para el grupo)

**Ronda** (`CompetitionRound`):
Etapa de evaluación de un certamen, con corte opcional a N clasificadas.
_Avoid_: fase, etapa

**Criterio** (`JudgingCategory`):
Aspecto que se evalúa dentro de una ronda, con su ponderación.
_Avoid_: categoría

**Puntaje** (`ScoreSheet`):
La nota de un jurado a una ficha en un criterio de una ronda.
_Avoid_: planilla, voto

**Planilla**:
El conjunto de puntajes de un jurado en una ronda.
_Avoid_: hoja de votación

**Voto del público** (`VoteOrder`):
Voto comprado por cualquier persona a favor de una candidata; no es un puntaje (ver ADR-0001).
_Avoid_: voto (a secas), puntaje

### Auspicios

**Plan de auspicio** (`SponsorshipPackage`):
Una oferta del tarifario de un certamen (Titular, Oro, Plata…).
_Avoid_: paquete, nivel

**Auspicio** (`SponsorshipContract`):
El contrato firmado con un contacto para auspiciar un certamen.
_Avoid_: patrocinio, sponsor

**Canje**:
La parte de un auspicio pagada en especie, valorizada en pesos.
_Avoid_: trueque, barter

**Contraprestación** (`SponsorshipDeliverable`):
Lo que la organización debe entregar al auspiciador a cambio del auspicio.
_Avoid_: entregable, beneficio

### Producción

**Escaleta**:
El guion minuto a minuto del show.
_Avoid_: pauta, programa, timeline

**Bloque** (`StageTimelineItem`):
Cada ítem de la escaleta.
_Avoid_: ítem, momento

**Segmento**:
El tipo de un bloque (apertura, traje de baño, gala, pregunta…).
_Avoid_: tipo de bloque

**Credencial** (`StaffAccreditation`):
Permiso de ingreso del staff a un certamen, con nivel y QR.
_Avoid_: entrada, pase

**Acreditación**:
El proceso de emitir credenciales.
_Avoid_: credencial (para el proceso)

**Entrada** (`TicketSale`):
Permiso de ingreso pagado del público a un certamen.
_Avoid_: ticket, credencial
