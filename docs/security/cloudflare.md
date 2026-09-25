# Cloudflare delante de Aether (Vercel): configuración y auditoría

Fecha: 25 de septiembre de 2026. Complementa la auditoría del 14 de septiembre
(`docs/auditoria-2026-09-14/seguridad.md`); no la reemplaza.

## Qué hace el código y qué se configura en los paneles

| Pieza | Dónde | Estado |
|---|---|---|
| IP real del cliente detrás de Cloudflare (`cf-connecting-ip`, solo con secreto de origen) | Código: `src/lib/security/cloudflare.ts` (`getClientIp`) | Implementado. Todo el sistema (rate limit, auditoría, lista blanca de IP, sesiones) usa esta única función. |
| Turnstile (anti-bots) en login y postulación de candidatas | Código: `src/lib/security/turnstile.ts`, `src/components/security/TurnstileWidget.tsx` | Implementado, se activa con las llaves. |
| CSP con Turnstile, `object-src 'none'`, `upgrade-insecure-requests`, COOP, Permissions-Policy ampliada | `next.config.js` | Implementado. |
| DNS con proxy, TLS, WAF, rate limit en el borde, reglas de caché | Panel de Cloudflare | Pasos abajo. |
| Bloqueo de origen (que nadie le pegue directo a `*.vercel.app`) | Firewall de Vercel | Pasos abajo. |

Sin las variables de entorno nuevas, la aplicación se comporta exactamente como antes.

### Variables de entorno (Vercel → Settings → Environment Variables, solo Production)

| Variable | Valor |
|---|---|
| `CLOUDFLARE_ORIGIN_SECRET` | Aleatorio de 32+ caracteres (`openssl rand -hex 32`). Con menos de 32 se ignora. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Site key del widget Turnstile. |
| `TURNSTILE_SECRET_KEY` | Secret key del widget Turnstile. |

Turnstile solo se exige si están **las dos** llaves. `NEXT_PUBLIC_*` entra en el bundle al compilar: después de cargarla hay que volver a desplegar.

## Por qué hace falta el cambio de IP

Con Cloudflare como proxy, Vercel ve a Cloudflare como cliente: `x-forwarded-for` trae la IP de un nodo de Cloudflare, compartida por miles de usuarios. Sin el cambio:

- el rate limit de login (10 por minuto por IP) bloquearía a usuarios legítimos que entran por el mismo nodo;
- la lista blanca de IP por empresa rechazaría a todos;
- la auditoría registraría IPs de Cloudflare.

`cf-connecting-ip` trae la IP real, pero cualquiera puede inventarlo si le pega directo a Vercel. Por eso solo se cree cuando el request trae también el header `x-aether-origin-auth` con el secreto, que agrega nuestra zona de Cloudflare. Un request sin el secreto usa `x-forwarded-for` como siempre.

## Pasos en Cloudflare

1. **DNS.** Registro `CNAME` del dominio a `cname.vercel-dns.com`, con proxy activado (nube naranja). En Vercel, el dominio debe seguir verificado.
2. **SSL/TLS.**
   - Modo **Full (strict)**. Nunca Flexible: con Flexible, Vercel responde redirecciones a HTTPS y se forma un bucle.
   - Activar *Always Use HTTPS*.
   - TLS mínimo 1.2.
   - HSTS ya lo manda la aplicación, no hace falta duplicarlo.
3. **Secreto de origen.** *Rules → Transform Rules → Modify Request Header*, para todas las solicitudes: *Set static* `x-aether-origin-auth` = el valor de `CLOUDFLARE_ORIGIN_SECRET`.
4. **WAF.**
   - *Cloudflare Managed Ruleset*: activado.
   - *OWASP Core Ruleset*: primero en modo **Log** una semana, revisar los falsos positivos y después pasarlo a Block.
   - Excluir de ambos los webhooks, cuyos cuerpos no son de un navegador:
     - `/api/webhooks` (n8n)
     - `/api/webhooks/zapsign`
     - `/api/public/installments/khipu/notify`
5. **Rate limiting en el borde.** Cubre lo que el limitador en memoria no puede cubrir: cada instancia de Vercel lleva sus propios contadores. Por IP:

   | Ruta | Método | Límite | Acción |
   |---|---|---|---|
   | `/api/auth/signin` | POST | 20 / 1 min | Block 10 min |
   | `/api/auth/verify-totp` | POST | 20 / 1 min | Block 10 min |
   | `/forgot-password` | POST | 10 / 10 min | Block 30 min |
   | `/api/public/*` | POST | 60 / 1 min | Managed Challenge |
6. **Bots.** No activar *Bot Fight Mode*: bloquea a Vercel Cron, Khipu, ZapSign y n8n, y no admite excepciones. Para bots basta Turnstile. Con plan Pro o superior se puede usar *Super Bot Fight Mode* con excepciones para las rutas del punto 4 y para `/api/*/cron`.
7. **Caché.** Regla *Bypass cache* para todo, salvo:
   - `/_next/static/*`
   - `/marketing/cinematic/seq/*` (inmutables, ya llevan `?v=`)
   - `/branding/*`

   Nunca cachear HTML ni `/api`: dependen de la cookie de sesión.
8. **Turnstile.**
   - *Turnstile → Add widget*, modo **Managed**, con el dominio de producción y el de preview si se prueba ahí.
   - Cargar las dos llaves en Vercel.

## Bloqueo de origen (Firewall de Vercel)

Sin este paso, el WAF y el rate limit de Cloudflare se pueden esquivar pegándole directo a `*.vercel.app`.

En *Vercel → Firewall → Custom Rules*, crear una regla **Deny** con esta condición: el header `x-aether-origin-auth` no es igual al secreto, **y** el User-Agent no contiene `vercel-cron`. Vercel Cron llama directo al deployment, sin pasar por Cloudflare, y cada ruta de cron ya exige `CRON_SECRET`.

Antes de activarla:

- Los webhooks de Khipu, ZapSign y n8n deben apuntar al **dominio propio**, no a `*.vercel.app`.
- La app de escritorio (`desktop-client/`) debe apuntar al dominio propio.
- Probar primero en modo *Log*.

Este bloqueo no se implementó en `src/proxy.ts` a propósito. Para cubrir `/api`, el proxy tendría que interceptar esas rutas, y Next 16 bufferiza el cuerpo de todo request que pasa por el proxy con un tope de 10 MB (`proxyClientMaxBodySize`). Eso truncaría las importaciones y subidas grandes. El firewall de Vercel actúa en el borde, antes de la función, y no tiene ese problema.

## Verificación después de configurar

Cambiar `aether.cl` por el dominio real.

```bash
# 1. Pasa por Cloudflare (debe traer cf-ray y server: cloudflare)
curl -sI https://aether.cl/login | grep -iE 'cf-ray|server|content-security-policy'

# 2. Con el bloqueo de origen activo, el acceso directo debe dar 403
curl -sI https://<proyecto>.vercel.app/login | head -1

# 3. La IP que registra la app es la real: iniciar sesión y revisar
#    la lista de sesiones activas en Configuración (debe mostrar tu IP, no una de Cloudflare).
```

## Hallazgos de esta pasada

| ID | Prioridad | Hallazgo | Estado |
|---|---|---|---|
| CF-01 | P0 al activar Cloudflare | La IP del cliente salía de `x-forwarded-for` en 12 lugares distintos. Detrás de Cloudflare eso rompe el rate limit, la lista blanca de IP y la auditoría. | **Corregido**: una sola función `getClientIp`, consciente de Cloudflare y protegida contra headers falsificados. |
| CF-02 | P1 | Login y postulación pública sin protección contra bots más allá del rate limit por instancia y el honeypot. | **Corregido** (opcional por llaves): Turnstile verificado en el servidor, con acción ligada al formulario. |
| CF-03 | P2 | CSP sin `object-src` ni `frame-src`, y sin COOP. | **Corregido** en `next.config.js`. |
| CF-04 | P1 | Rate limit en memoria por instancia de Vercel: un ataque distribuido entre instancias no comparte contadores. | **Mitigado** con el rate limiting de Cloudflare (paso 5). |
| CF-05 | P1 | El certificado médico de la postulación se guarda con acceso público (`apply/route.ts`, `access: 'public'`). Quien obtenga la URL lo lee. Sigue abierto desde SEG-06 del 14/09. | **Pendiente**: requiere bucket o prefijo privado y descarga firmada. Cloudflare no lo resuelve. |
| CF-06 | P2 | En la raíz del repositorio hay archivos que no son código: `ERP_99999999-9_*.xlsx`, `images.jpg`, `images (1).jpg`, `dev-*.log`. Los logs están vacíos o no contienen secretos; los `.xlsx` son exportaciones de una empresa de prueba. | **Pendiente**: confirmar con el dueño y sacarlos del repo. Agregar `*.log` y `/ERP_*.xlsx` a `.gitignore`. |
