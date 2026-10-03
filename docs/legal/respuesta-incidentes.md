# Plan de respuesta a incidentes y vulneraciones de datos

**Objetivo:** contener rápido, avisar a quien corresponde dentro de plazo y dejar constancia.

## 1. Qué es un incidente

- Acceso no autorizado a datos de un cliente (o sospecha fundada).
- Datos de una empresa visibles para otra.
- Filtración de un secreto (clave de API, llave de cifrado, credencial de base de datos).
- Pérdida o borrado no intencional de datos.
- Caída total del servicio por más de 1 hora en horario hábil.

## 2. Pasos

| # | Acción | Responsable | Plazo |
|---|---|---|---|
| 1 | **Contener:** revocar el acceso o la clave comprometida, suspender la cuenta afectada, activar el modo *Under Attack* de Cloudflare si es un ataque. | Quien lo detecta + administrador | Inmediato |
| 2 | **Registrar** en una bitácora: hora de detección, qué se vio, qué se hizo. | Administrador | Durante el incidente |
| 3 | **Evaluar alcance:** qué empresas, qué datos, cuántas personas, si hay datos sensibles o de menores. Usar la auditoría y los registros de Vercel/Neon. | Administrador | Primeras 24 h |
| 4 | **Avisar al cliente afectado** (responsable de los datos) con lo que se sabe, aunque sea preliminar. El contrato de encargo obliga a Aether a avisarle sin dilación indebida. | Representante legal | Sin dilación, idealmente dentro de 24 h |
| 5 | **Apoyar al cliente** en su aviso a la Agencia de Protección de Datos Personales y a los titulares, cuando la ley lo exija. Desde el 1 de diciembre de 2026 rige la Ley 21.719; **confirmar con el abogado el plazo y el contenido exactos de esos avisos.** | Representante legal + cliente | Según la ley |
| 6 | **Corregir la causa** y verificar que no se repita (test, regla, cambio de configuración). | Desarrollo | Lo antes posible |
| 7 | **Cerrar:** informe breve al cliente y registro en Configuración → Protección de datos → Incidentes de seguridad. | Administrador | Al cerrar |

## 3. Restauración de datos

- Errores recientes: restaurar desde Neon a una **rama nueva**, revisar y recién entonces copiar lo necesario. Nunca restaurar encima de producción sin revisar.
- La ventana de restauración depende del plan de Neon (hoy, en el plan gratuito, es de **6 horas**). Por eso conviene el plan Launch antes de tener clientes.

## 4. Contactos de emergencia (completar)

| Rol | Nombre | Teléfono | Correo |
|---|---|---|---|
| Representante legal | | | |
| Administrador técnico 1 | | | |
| Administrador técnico 2 | | | |
| Abogado | | | |
| Soporte Vercel / Neon / Cloudflare | Panel de cada proveedor | | |
