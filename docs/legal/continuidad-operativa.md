# Plan de continuidad operativa

Qué hacer para que la plataforma siga funcionando ante fallas, y cómo volver a operar si algo se cae.

## 1. Dependencias críticas

| Servicio | Si falla | Plan |
|---|---|---|
| Vercel (aplicación) | La plataforma no responde | Ver estado en el panel de Vercel. Si un despliegue lo causó: **Instant Rollback** a la versión anterior. |
| Neon (base de datos) | Errores al cargar cualquier pantalla | Ver estado de Neon. Si es un dato dañado: restaurar a rama nueva (ver respuesta a incidentes). |
| Cloudflare | El dominio no carga | Pasar el DNS a "solo DNS" (nube gris) para entrar directo a Vercel mientras dura la falla. |
| Correo (Brevo/Resend) | No llegan confirmaciones ni recuperación de contraseña | Con ambas claves gana Brevo y **no hay cambio automático** al otro. Si Brevo cae, quitar temporalmente `BREVO_API_KEY` en Vercel y volver a desplegar para que salga por Resend (requiere dominio verificado en Resend). |
| SII | No se puede consultar ni enviar | El ERP sigue emitiendo con folios y timbre; el envío lo hace el cliente cuando el SII vuelva. |
| Khipu | No se pueden pagar cuotas en línea | Las cuotas se registran a mano en tesorería. |
| Gemini / NVIDIA | Los asistentes no responden | El resto del ERP no depende de ellos. |

## 2. Antes de cada despliegue

1. `npm run ci` en verde.
2. Revisar el SQL de cualquier migración nueva (aditiva e idempotente).
3. Probar en un despliegue de vista previa conectado a una rama de Neon, **no a producción**.
4. Desplegar fuera de horas de mayor uso y mirar los errores durante los 15 minutos siguientes.

## 3. Eventos en vivo (galas, votaciones)

- Semana previa: prueba de carga de la venta de entradas y de votos; subir el mínimo de cómputo de Neon esa semana.
- No desplegar cambios el día del evento.
- Tener una persona disponible durante el evento con acceso a Vercel, Neon y Cloudflare.

## 4. Personas

- Dos personas con acceso de administrador a cada proveedor, con verificación en dos pasos.
- Credenciales de recuperación (códigos de respaldo de 2FA) guardadas en un gestor de contraseñas compartido del equipo, no en una sola cabeza.
