# Aether: ERP chileno + producción de certámenes

Plataforma donde una empresa lleva su operación tributaria chilena (ventas, compras, inventario, contabilidad) y produce certámenes (postulación, jurado, show en vivo, auspicios, entradas, votación). Ambas mitades comparten empresa, contactos y contabilidad. El nombre en código de cada término va entre paréntesis.

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

**Folio**:
Número tributario de un DTE, tomado del rango autorizado por el SII.
_Avoid_: usar "folio" para cualquier otro correlativo

## Cobranza

**Plan de pago** (`PaymentPlan`):
Acuerdo para pagar un monto en cuotas.
_Avoid_: convenio, crédito

**Deudor**:
El contacto que firma el plan de pago; puede ser la candidata o su apoderado.
_Avoid_: pagador, titular

**Beneficiaria**:
La candidata a quien corresponden las cuotas de un plan de pago; el portal de pago la busca por su RUT.
_Avoid_: deudora (cuando no firmó el plan)

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
