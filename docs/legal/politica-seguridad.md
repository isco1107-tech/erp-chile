# Política de seguridad de la información

**Alcance:** la plataforma Aether ERP, su código, su infraestructura (Vercel, Neon, Cloudflare, R2) y las personas con acceso administrativo.
**Dueño de la política:** el representante legal de Aether. Se revisa cada 6 meses o tras un incidente.

## 1. Principios

- **Mínimo privilegio:** cada persona y cada servicio tiene solo el acceso que necesita.
- **Aislamiento por empresa:** toda consulta a la base filtra por `companyId`. Una empresa nunca ve datos de otra (CLAUDE.md, sección 2.3).
- **Defensa en profundidad:** ninguna barrera es la única (sesión + permisos + filtro de empresa + firewall de borde).
- **Nada sensible en texto plano:** contraseñas con bcrypt (costo 12); credenciales de integraciones, CAF, mensajes y TOTP cifrados con AES-256-GCM.

## 2. Accesos administrativos

| Sistema | Regla |
|---|---|
| Vercel, Neon, Cloudflare, GitHub, proveedor de correo | Verificación en dos pasos obligatoria. Al menos **dos** personas de confianza con acceso de administrador, para no depender de una sola. |
| Superadmin de la plataforma | Solo el equipo de Aether. Cada acción queda en la auditoría. |
| Secretos (variables de entorno) | Solo en Vercel, marcados como *sensitive*. Nunca en el repositorio, en chats ni en correos. Se rotan si una persona con acceso deja el equipo o ante sospecha de filtración. |
| Base de datos de producción | No se usa desde computadores personales para desarrollo. Desarrollo y pruebas usan una rama de Neon separada. |

**Las llaves de cifrado no se cambian a la ligera.** `TOTP_ENCRYPTION_KEY` hoy cifra también los CAF, credenciales de pasarelas e integraciones y la mensajería, porque las llaves específicas (`DTE_ENCRYPTION_KEY`, `PAYMENTS_ENCRYPTION_KEY`, etc.) no están definidas. Si se agrega o cambia una de ellas sin volver a cifrar lo existente, **esos datos quedan ilegibles**. Cualquier cambio de llave se hace con un script de recifrado probado antes en una rama de Neon.

## 3. Desarrollo seguro

- Toda Server Action empieza con `requireAuthWithPermission` y valida con Zod.
- Antes de desplegar: `npm run ci` (Prisma, tipos, lint y tests) en verde.
- Migraciones aditivas e idempotentes; el SQL se revisa antes de aplicarse.
- Dependencias: revisión mensual de avisos de seguridad (`npm audit`) y actualización de los paquetes con vulnerabilidades.
- Archivos de clientes: los sensibles (certificados médicos, contratos de candidatas) van al bucket **privado** de R2 y solo se leen por rutas autenticadas que auditan la descarga.

## 4. Protección en el borde

- Cloudflare delante de la aplicación: TLS Full (strict), WAF, límite de peticiones y Turnstile en login y formularios públicos (`docs/security/cloudflare.md`).
- Firewall de Vercel que bloquea el acceso directo a `*.vercel.app`.

## 5. Monitoreo

- Errores de producción a observabilidad (`captureException`) y, con `SENTRY_DSN`, a Sentry.
- Monitor externo de disponibilidad con aviso al celular.
- Revisión semanal de errores nuevos y mensual de accesos (usuarios inactivos, claves sobrantes).

## 6. Proveedores

Cada proveedor que trata datos figura en `src/lib/privacy/subprocessors.ts` (página `/aether/subencargados`). Se agrega **antes** de empezar a usarlo. Las claves de servicios que no se usan se eliminan de Vercel.
