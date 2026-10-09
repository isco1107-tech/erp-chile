# Política de conservación, respaldos y eliminación de datos

## 1. Roles

Cada empresa cliente es la **responsable** de sus datos y define cuánto tiempo los conserva. Aether, como encargado, ofrece las herramientas y aplica lo que dicen los términos y el contrato de encargo.

## 2. Plazos que aplica la plataforma

| Dato | Plazo | Cómo se cumple |
|---|---|---|
| Postulaciones descartadas (candidatas) | 12 meses por defecto (`CANDIDATE_RETENTION_MONTHS`) | Purga automática mensual (cron `/api/candidates/purge-retention/cron`). |
| Documentos tributarios, contables y de pago | El plazo legal tributario y contable; el cliente lo confirma con su contador | No se borran a pedido del titular. El buscador de datos de una persona lo advierte. |
| Datos de trabajadores y remuneraciones | El plazo legal laboral y previsional; el cliente lo confirma con su asesor | Ídem. |
| Sesiones | 8 horas | Expiración de la cookie. |
| Auditoría | Mientras exista la cuenta del cliente | Necesaria para seguridad y para acreditar el cumplimiento. |
| Datos de un cliente que termina el servicio | 30 días para exportar y luego eliminación dentro de 90 días | Términos de servicio, sección 10. El borrado definitivo de una empresa ya no existe en Aether (se quitó con el panel de superadmin): queda pendiente definir cómo se pide desde la Supersuite. |
| Ramas de Neon de prueba | Se borran al terminar la prueba | **Hoy existen copias de producción con datos reales en ramas `preview/*`: borrarlas.** |

Los plazos sugeridos del registro de actividades (`src/lib/privacy/processing-activities.ts`) son un punto de partida. Cada cliente debe ajustarlos.

## 3. Respaldos

| Capa | Qué cubre | Frecuencia |
|---|---|---|
| Restauración puntual de Neon (PITR) | Toda la base, hasta la ventana del plan | Continua |
| Exportación completa por empresa (`/api/backup/company`) | Datos de una empresa en JSON, sin credenciales | Mensual, guardada fuera de la plataforma |
| Archivos en R2 | Fotos, logos, contratos, certificados | Activar versionado o copia periódica del bucket |

**Prueba de restauración trimestral**: restaurar a una rama nueva, abrir la aplicación contra ella y verificar los datos de una empresa. Anotar la fecha y el resultado.

## 4. Eliminación segura

- Se elimina con las funciones de la plataforma (`platform-delete.service.ts`, purgas) que respetan el filtro por empresa.
- Los respaldos de Neon expiran solos al pasar su ventana; no se conservan copias manuales de la base de producción en computadores personales.
- **Pendiente:** al eliminar una empresa (`platform-delete.service.ts`) se borran sus datos de la base, pero **no** sus archivos (fotos, contratos, certificados) en R2 o Vercel Blob. Hasta automatizarlo, borrarlos a mano en el panel de R2 buscando las carpetas que contienen el id de la empresa (por ejemplo `candidates/<companyId>/`), para cumplir el plazo de 90 días de los términos.
