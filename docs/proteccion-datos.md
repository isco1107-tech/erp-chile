# Protección de datos personales (Ley 21.719)

Estado al 2026-10-02. La ley entra en vigencia el **1 de diciembre de 2026**. Este documento dice qué hace hoy el sistema, qué falta y qué debe decidir o validar una persona (no es asesoría legal: los textos y plazos deben revisarse con un abogado).

## Roles

- **Cada empresa usuaria es la responsable** de los datos que carga (decide para qué se usan).
- **Aether es la encargada**: los trata por cuenta de la empresa. Lo dicen `/aether/privacidad` y `/aether/encargado`.

## Qué hace el sistema hoy

| Obligación | Dónde está |
|---|---|
| Derechos del titular (acceso, rectificación, supresión, oposición, portabilidad, bloqueo) con plazo | Configuración → Protección de datos → Solicitudes. Formulario público por empresa: `/derechos/[token]` |
| Plazo de respuesta y prórroga | `src/lib/privacy/constants.ts` (30 días corridos + 30 de prórroga) y `deadlines.ts`. **Validar con asesoría.** |
| Verificar identidad antes de responder | La solicitud no se resuelve sin marcarla; tampoco se cierra sin constancia |
| Encontrar y entregar los datos de una persona | Pestaña "Buscar datos de una persona" (correo/RUT). Respeta los permisos sensibles de quien consulta (`candidates:sensitive`, `payroll:read`). La copia JSON exige `company:export` y sale solo de una solicitud de acceso o portabilidad con identidad verificada. Cada consulta queda en auditoría con una huella, no con el dato |
| Registro de actividades de tratamiento | `src/lib/privacy/processing-activities.ts`; pestaña "Registro de actividades" (descarga CSV) |
| Encargados y transferencias internacionales | `src/lib/privacy/subprocessors.ts`; página pública `/aether/subencargados` |
| Consentimiento demostrable (postulación) | `Candidate.privacyConsentAt` + `privacyPolicyVersion` + `privacyGuardianProvided` |
| Política de privacidad de la postulación | `/politica-privacidad?certamen=…`. RUT y domicilio salen de la empresa solo si es persona jurídica (RUT desde 50.000.000); una persona natural debe completarlos a mano |
| Formulario público de derechos con freno al abuso | Tope por IP, por enlace y por correo, señuelo y Turnstile; el acuse no incluye el nombre escrito |
| Incidentes de seguridad | Pestaña "Incidentes de seguridad": qué pasó, a quién se avisó y cuándo |
| Retención | Purga mensual de postulaciones descartadas (`vercel.json`, `CANDIDATE_RETENTION_MONTHS`, 12 por defecto) |
| Respaldo/portabilidad por empresa | `GET /api/backup/company` |

Al cambiar el texto de `src/app/politica-privacidad/page.tsx`, **sube `PRIVACY_POLICY_VERSION`** en `src/lib/privacy/constants.ts`.

## Lo que NO está resuelto

1. **Bloqueo**: se registra la solicitud, pero no hay un indicador en las fichas que impida usar los datos. Hoy es una medida manual.
2. **Supresión**: solo las postulaciones se eliminan a pedido desde su ficha. Clientes, trabajadores, compras y pagos tienen obligación de conservación tributaria, contable o laboral: el buscador lo indica y permite rectificar.
3. **Formularios públicos sin aviso de privacidad**: venta de entradas, compra de votos, portal de pago de cuotas, contacto de sitios web y formulario de auspiciadores no muestran qué datos tratan ni enlazan una política. La ley exige informar **antes** de recopilar. Falta una política por flujo (o una política general por empresa) y un enlace en cada formulario.
4. **Archivos en almacenamiento público** (fotos, contratos, certificados médicos): la dirección no se puede adivinar, pero quien la tenga puede abrirla (SEG-06 del `ROADMAP.md`). Los certificados médicos son datos sensibles: conviene pasarlos a almacenamiento privado con enlaces que expiran.
5. **Plazos de conservación** del registro de actividades son sugerencias: cada empresa debe definirlos.
6. **Evaluación de impacto, delegado de protección de datos y modelo de prevención de infracciones**: voluntarios, pero atenúan sanciones. No están implementados.
7. **Avisos de plazo**: el panel marca solicitudes vencidas y por vencer, y la campanita avisa al recibir; no hay recordatorio diario por correo.

## Qué debe hacer una persona (no se puede desde el código)

- **Abogado**: revisar `/aether/encargado`, `/aether/privacidad`, `/politica-privacidad` y los plazos de `constants.ts`.
- **Neon**: la base está en Estados Unidos (aws-us-east-2) y la ventana de restauración es de 6 horas. Ampliarla requiere un plan de pago.
- **Ramas de Neon `preview/claude/*`**: la integración con Vercel crea una copia de la base de producción (con datos personales reales) por cada rama de trabajo. Conviene borrar las antiguas y evitar que se creen con datos reales.
- **Sentry**: sin `SENTRY_DSN` no hay alertas de errores.
- **IA**: el plan gratuito de Gemini puede usar lo enviado para mejorar sus productos; con datos reales de clientes, pasar al plan de pago.
- **Datos de contacto**: completar `AETHER_SALES_EMAIL` (contacto de la política de la plataforma).
