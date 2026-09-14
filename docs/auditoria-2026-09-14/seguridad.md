# Auditoría de seguridad y protección de datos

Fecha: 14 de septiembre de 2026. Alcance: código local de `D:\ERP`, autenticación, autorización, separación de empresas, archivos, datos sensibles, webhooks y controles de abuso. No se modificó código de aplicación, no se consultó la base de datos ni se realizaron solicitudes a servicios o usuarios reales.

## Resultado y límites

Hay controles útiles, pero también fallos concretos que permiten omitir restricciones de seguridad. Los más urgentes afectan datos médicos de candidatas, cambios de contraseña, recuperación de cuentas privilegiadas, revocación de sesiones y pertenencia de archivos a una empresa.

P0 significa corregir o contener antes de ampliar uso con datos sensibles. P1 corresponde a la siguiente entrega de seguridad. P2 es endurecimiento planificado. Son prioridades técnicas; no equivalen a una puntuación CVSS ni demuestran que haya existido una intrusión.

La evidencia principal es inspección del código y seguimiento entre acciones, servicios y esquema. Se reprodujo además un fallo del limitador mediante simulación local pura, con reloj controlado, sin importar Prisma ni cargar variables de entorno. Los escenarios que dependen de roles, datos existentes o configuración del proveedor están identificados como condicionales.

`CLAUDE.md` advierte que la conexión local comparte base con producción. Se respetó esa restricción. En los archivos `.env` y `.env.local` inspeccionados no aparecen las variables `R2_PUBLIC_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` ni `R2_BUCKET_NAME`. Esto no acredita su ausencia en variables heredadas, Vercel o producción. No se inspeccionaron permisos reales de buckets ni se descargaron archivos. No se muestran valores de credenciales.

## Resumen de hallazgos

| ID | Prioridad | Hallazgo | Evidencia principal |
|---|---|---|---|
| SEG-01 | P0 | Datos médicos y certificados eluden el permiso de información sensible | `src/modules/candidates/actions/candidates.actions.ts:54`, `:401`, `:426` |
| SEG-02 | P0 | El cambio obligatorio de contraseña funciona para cualquier sesión, sin comprobar contraseña actual | `src/lib/actions/change-password.ts:34` |
| SEG-03 | P0 | Administración de usuarios permite recuperar contraseñas de OWNER o superadmin del mismo tenant | `src/lib/actions/users.ts:293`, `src/lib/services/users.service.ts:348` |
| SEG-04 | P0 | Referencias de archivos permiten borrar objetos de otra empresa si se conoce su URL | `src/modules/candidates/schema.ts:255`, `src/modules/candidates/services/candidates.service.ts:413` |
| SEG-05 | P1 | Cambio de empresa genera sesiones que no quedan registradas ni pueden revocarse por dispositivo | `src/lib/auth/actions/switch-company.actions.ts:74`, `src/lib/auth/sessions.ts:98` |
| SEG-06 | P1 | Contratos, fotos de postulaciones y pagarés se diseñan para almacenamiento público | `src/lib/storage/blob.ts:30`, `src/app/api/candidates/document-upload/route.ts:57` |
| SEG-07 | P1 | Restricción por IP no se vuelve a comprobar en uso de sesión ni cambio de empresa | `src/lib/auth/ip-allowlist-guard.ts:16`, `src/lib/auth/guards.ts:198` |
| SEG-08 | P1 | Obligación de cambiar contraseña solo bloquea el layout del dashboard | `src/app/(dashboard)/layout.tsx:51`, `src/lib/auth/guards.ts:227` |
| SEG-09 | P1 | Limpieza del limitador elimina prematuramente cuotas de otras ventanas | `src/lib/security/rate-limiter.ts:65` |
| SEG-10 | P1 | Tokens de integraciones y calendario omiten suspensión y módulos de la empresa | `src/modules/webhooks/services/n8n-secret.service.ts:60`, `src/modules/calendar/services/calendar.service.ts:318` |
| SEG-11 | P2 | Respuestas de usuarios incluyen material TOTP cifrado innecesario | `src/lib/services/users.service.ts:15` |
| SEG-12 | P1 | Webhook de firma consume servicios antes de validar documento propio y confirma errores con HTTP 200 | `src/app/api/webhooks/zapsign/route.ts:30`, `:90` |
| SEG-13 | P2 | Validación de archivos, cuotas y orden de autorización son inconsistentes | `src/app/api/messaging/attachments/upload/route.ts:66` |
| SEG-14 | P2 | CSP permite ejecución inline/eval y no contempla las imágenes del nuevo storage | `next.config.js:28` |

## SEG-01 — Datos médicos fuera del control de información sensible

**Evidencia.** `redactSensitiveFields` en `src/modules/candidates/actions/candidates.actions.ts:54` copia el objeto completo y oculta varios campos de contacto, pero conserva `condicionesMedicas`. Las acciones de listado y ficha (`:194`, `:205`) aplican esa función a usuarios sin `candidates:sensitive`. La inscripción guarda ese campo en `src/modules/candidates/services/candidates.service.ts:899`.

El conjunto `SENSITIVE_DOCUMENT_TYPES` en `candidates.actions.ts:401` contiene únicamente `PHOTO_FACE` y `PHOTO_FULL_BODY`. `listDocumentsAction` (`:426`) filtra según ese conjunto y limpia la URL solo para esos tipos. La ruta de inscripción sí admite y guarda `MEDICAL_CERTIFICATE` (`src/app/api/public/candidates/[token]/apply/route.ts:212`). Por tanto, un rol con `candidates:read` y sin `candidates:sensitive` recibe el certificado y su URL sin el control previsto para información sensible.

**Impacto.** Acceso a información médica por roles destinados a ver solamente fichas básicas. Se mantiene el filtro de empresa; el fallo ocurre entre permisos dentro de la misma empresa. La descarga directa depende de accesibilidad real del objeto, pero la entrega del campo médico y de la referencia documental está comprobada en código.

**Corrección.** Definir DTO por nivel de acceso mediante listas explícitas de campos permitidos. Clasificar también certificados médicos y revisar todos los tipos documentales presentes y futuros. Servir documentos sensibles con un identificador interno y autorización en cada lectura.

**Aceptación.** Un rol de lectura básica nunca recibe `condicionesMedicas`, información de salud ni URLs/identificadores utilizables de certificados. Pruebas de acciones y rutas con roles completo, básico y otra empresa; al incorporar un nuevo tipo documental, la opción predeterminada debe ser acceso restringido.

## SEG-02 — Cambio de contraseña sin reautenticación

**Evidencia.** `completeForcedPasswordChangeAction` (`src/lib/actions/change-password.ts:34`) exige sesión, valida la nueva contraseña y actualiza el usuario en `:46`. No exige que `context.mustChangePassword` esté activo ni comprueba contraseña actual. La comprobación de que corresponde mostrar la pantalla reside en `src/app/change-password/page.tsx`; no protege la acción invocable en servidor.

**Impacto.** Una sesión sustraída o un equipo abierto permite establecer una contraseña permanente y revocar las otras sesiones. La nueva clave también satisface la comprobación de contraseña de `disableTotpAction` (`src/lib/actions/totp.ts`), ampliando el impacto sobre una cuenta con segundo factor.

**Corrección.** Separar el cambio obligatorio de un cambio voluntario. El primero debe requerir estado pendiente y una sesión limitada para ese propósito; el segundo, contraseña actual o reautenticación reciente. Los cambios de segundo factor deben exigir verificación apropiada y cerrar/revalidar otras sesiones.

**Aceptación.** Una sesión ordinaria no puede usar el flujo obligatorio. Una petición con contraseña nueva pero sin verificación de identidad falla sin mutar datos. El flujo legítimo de primera entrada sigue funcionando y revoca sesiones anteriores.

## SEG-03 — Recuperación de cuentas privilegiadas sin jerarquía

**Evidencia.** `resetUserPasswordAction` (`src/lib/actions/users.ts:293`) exige `settings:users`, permiso de OWNER y ADMIN (`src/lib/auth/permissions.ts:72`). El servicio (`src/lib/services/users.service.ts:348`, consulta en `:365`, actualización en `:372`) verifica empresa pero no el rol ni `isSuperAdmin` del usuario objetivo. Devuelve al operador la contraseña temporal en `:381`.

El mismo archivo de acciones sí reserva crear o asignar OWNER a otro OWNER (`users.ts:82`, `:235`), por lo que la recuperación permite eludir una separación de privilegios ya explícita.

**Impacto.** Un administrador del tenant puede tomar control de un OWNER sin segundo factor. Si un superadmin pertenece a esa empresa y carece de segundo factor, el alcance puede extenderse al panel global. La existencia de esas cuentas y su configuración 2FA no se comprobó. Con 2FA activo, el reinicio sigue alterando la credencial e invalidando sesiones, aunque no entrega automáticamente acceso al segundo factor.

**Corrección.** Política central sobre actor y objetivo para cambio de rol, recuperación, suspensión y eliminación. Proteger OWNER y bloquear siempre operaciones sobre superadmins desde administración de tenant. Separar cuentas de operación de plataforma de cuentas administrables por un cliente. Preferir recuperación que verifique al titular frente a entregar una clave reutilizable al operador.

**Aceptación.** ADMIN no puede recuperar OWNER ni superadmin; los roles personalizados tampoco eluden la regla. Superadmin no es administrable mediante acciones del tenant. Pruebas de matriz actor/objetivo y aviso verificable al titular para toda recuperación autorizada.

## SEG-04 — Pertenencia de archivos no verificada al asociar y borrar

**Evidencia.** `documentCreateSchema.fileUrl` (`src/modules/candidates/schema.ts:255`) exige únicamente `isAllowedBlobUrl`. Este helper (`src/lib/security/blob-url.ts:27`) valida protocolo y host, sin empresa ni objeto. `addDocument` (`src/modules/candidates/services/documents.service.ts:27`) verifica la candidata pero guarda la URL recibida (`:40`). Posteriormente `deleteCandidate` (`src/modules/candidates/services/candidates.service.ts:413`) recoge esas URLs y llama `del(fileUrls)` en `:427`. El adaptador elimina las claves de R2 derivadas de la URL (`src/lib/storage/blob.ts:130`, `:144`) sin comprobar propietario.

**Impacto.** Un usuario con escritura de candidatas puede asociar a una candidata propia la referencia conocida de un archivo ajeno alojado en el storage compartido. El ciclo de eliminación actúa sobre ese objeto usando credenciales del servidor. No requiere conocer un secreto del proveedor; sí conocer la URL o clave del objeto y que el storage esté operativo. No se ejecutó ningún borrado.

**Corrección.** Registro `StoredFile` con empresa, propietario, finalidad y clave interna. El cliente debe enviar un ID creado mediante una subida autorizada, no una URL arbitraria. Validar pertenencia tanto al asociar como al eliminar, incluyendo migración del contenido previo. La validación de host para SSRF no sustituye autorización de objetos.

**Aceptación.** Asociar un objeto de otra empresa se rechaza. El borrado no envía solicitudes al proveedor para objetos ajenos o sin propiedad acreditada. Pruebas con dos tenants y storage simulado que comprueben la ausencia de llamadas de eliminación no autorizadas.

## SEG-05 — Sesiones reemitidas fuera del registro y de la revocación

**Evidencia.** `switchActiveCompanyAction` (`src/lib/auth/actions/switch-company.actions.ts:74`) emite JWT en `:97` y cookie en `:106`, sin `recordSession` ni revocación de la sesión anterior. También acepta como destino la empresa hogar (`:84`), de modo que la omisión no depende exclusivamente de una membresía adicional. `isSessionRevoked` acepta tokens sin fila (`src/lib/auth/sessions.ts:98`, `:103`); cerrar sesión solo hace `updateMany` de filas existentes (`:117` y `src/app/api/auth/signout/route.ts`).

**Impacto.** El token reemitido no figura en dispositivos activos. El cierre de sesión, cierre por dispositivo y cierre de otras sesiones no pueden revocar un token sin fila. Una copia sigue válida hasta su expiración o incremento global de `sessionVersion`. Reemitir además reinicia las ocho horas del JWT sin conservar un límite absoluto de autenticación.

**Corrección.** Una sola rutina de emisión/rotación para todas las vías, con ID de sesión aleatorio y registro obligatorio. Rechazar sesiones desconocidas después de una migración explícita. Mantener `authTime` y límite absoluto; usar la misma sesión de dispositivo al cambiar contexto o cerrar correctamente la anterior.

**Aceptación.** Login, invitación, cambio de clave y cambio de empresa dejan una sesión visible. Copias del token fallan después del logout o revocación. Cambiar de empresa no crea sesiones invisibles ni prolonga indefinidamente la autenticación.

## SEG-06 — Información privada en almacenamiento concebido como público

**Evidencia.** El contrato de `PutBlobOptions` (`src/lib/storage/blob.ts:30`) admite únicamente acceso público y documenta que el control depende de la configuración del bucket. `put` devuelve una URL pública del objeto. Documentos de candidatas (`src/app/api/candidates/document-upload/route.ts:57`), fotos/certificados de inscripción (`src/app/api/public/candidates/[token]/apply/route.ts:189`), pagarés (`src/app/api/promissory-notes/document-upload/route.ts:52`) y contratos firmados (`src/app/api/webhooks/zapsign/route.ts:42`) usan ese mecanismo.

**Impacto.** Si el bucket se configura según ese contrato, quien obtenga el enlace accede sin sesión y sin pasar por auditoría ni revocación del ERP. Ocultar el enlace en algunas respuestas no proporciona control sobre lecturas directas. No se verificó que el bucket de producción esté públicamente accesible; la configuración R2 no figura en los dos archivos de entorno locales inspeccionados. Los archivos anteriores de Vercel Blob permanecen contemplados como públicos en el adaptador.

**Corrección.** Separar activos públicos de documentos privados. Bucket privado y descarga autorizada con expiración corta o transmisión desde servidor. Migrar archivos existentes y retirar URLs anteriores. Usar cifrado cuando el modelo de amenaza lo requiera; mensajería ya proporciona un precedente local de cifrado antes de almacenar.

**Aceptación.** Un cliente anónimo no obtiene fotos, certificados, contratos ni pagarés por URL directa. Se prueban expiración, revocación, cambio de permiso y auditoría. Inventario de objetos previos con resultado de migración y limpieza verificable.

## SEG-07 — Allowlist de IP limitada a la emisión inicial

**Evidencia.** `checkIpAllowlist` (`src/lib/auth/ip-allowlist-guard.ts:16`) aparece en signin, verificación TOTP y aceptación de invitaciones. No aparece en `getAuthContext` (`src/lib/auth/guards.ts:198`) ni en cambio de empresa (`src/lib/auth/actions/switch-company.actions.ts:74`).

**Impacto.** Una sesión emitida desde una red permitida continúa operando al cambiar de red o después de endurecer la lista. Una membresía puede activar una empresa con una política más restrictiva sin comprobar su lista. No se comprobó si algún tenant utiliza esta configuración.

**Corrección.** Comprobar la política de la empresa efectiva en el guard compartido, usando la fuente de IP confiable del hosting. Mantener la excepción de plataforma explícita y auditada. Definir comportamiento de IPv6 y proxies.

**Aceptación.** Lecturas, mutaciones y cambio de empresa desde IP no permitida fallan aunque el JWT sea válido. Cambiar la política afecta a la siguiente operación. Pruebas de IPv4, IPv6, membresía adicional y configuración de proxy autorizada.

## SEG-08 — Cambio obligatorio solo impuesto por la interfaz

**Evidencia.** La redirección por `mustChangePassword` existe en `src/app/(dashboard)/layout.tsx:51`. Los guards generales (`src/lib/auth/guards.ts:198`, `:227`) devuelven el contexto y permisos sin bloquear ese estado. Las API quedan expresamente fuera del proxy y se protegen mediante sus guards (`src/proxy.ts`).

**Impacto.** Una cuenta con contraseña temporal puede invocar directamente API y acciones de negocio con los permisos normales, antes de completar el cambio exigido.

**Corrección.** Estado restringido aplicado por servidor. Autorizar únicamente cambio de contraseña, salida y operaciones necesarias para completar la recuperación. Documentar las excepciones en un guard separado.

**Aceptación.** Con contraseña pendiente, las API y acciones de negocio devuelven error de autorización y no alteran datos. El flujo de cambio termina y habilita acceso normal solo después de actualizar y reemitir correctamente la sesión.

## SEG-09 — Cuotas que desaparecen por actividad ajena

**Evidencia.** El store de `src/lib/security/rate-limiter.ts` es global al proceso. `maybeCleanup` (`:65`) elimina todas las entradas según `maxWindowMs`, que recibe de la configuración del request actual (`:91`), y compara antigüedad de la primera petición (`:73`). Un request de ventana corta puede eliminar contadores todavía válidos de una ventana larga.

**Reproducción local realizada.** Se transpilaron únicamente las funciones puras del archivo en memoria y se controló `Date.now`: cinco postulaciones permitidas; sexta rechazada; avance de 121 segundos; comprobación del limitador de login para otra IP; sexta postulación permitida aunque su cuota es cinco por hora. No hubo peticiones HTTP, base de datos ni cambios de archivos de código.

La reproducción está disponible en [repro-limite.cjs](repro-limite.cjs) y su salida en [repro-limite.json](repro-limite.json). Su código de salida 0 indica que reproduce el defecto de la versión auditada; no significa que el limitador sea correcto.

**Impacto.** El control de abuso falla incluso dentro de una instancia, además de su limitación documentada de no compartir contadores entre instancias serverless.

**Corrección.** Conservar expiración propia de cada entrada y eliminar solo entradas expiradas según su configuración. Para producción distribuida, almacenamiento de cuotas compartido y operaciones atómicas; protección por usuario, IP y tenant según superficie.

**Aceptación.** El caso reproducido continúa bloqueado hasta terminar la hora. Mezclar configuraciones de ventanas distintas no reinicia contadores. Pruebas con dos instancias verifican la cuota global en la implementación elegida.

## SEG-10 — Suspensión omitida en accesos mediante token

**Evidencia.** `resolveCompanyByN8nWebhookSecret` (`src/modules/webhooks/services/n8n-secret.service.ts:60`) devuelve solo `companyId`. La ruta (`src/app/api/webhooks/route.ts`) y `handleN8nWebhookEvent` no verifican estado de empresa ni disponibilidad de tesorería antes de llamar los servicios de pago. Estos últimos reciben `companyId` y no resuelven el estado del tenant. `getCalendarFeedByToken` (`src/modules/calendar/services/calendar.service.ts:318`) también resuelve token y obtiene datos sin comprobar estado/módulo. La selección del cron de agentes (`src/app/api/agents/run/route.ts:58`) filtra por feature pero no por estado.

**Impacto.** Suspender una empresa o retirar determinados módulos no detiene consistentemente integraciones existentes, publicación del calendario y tareas automáticas. El webhook puede continuar registrando movimientos con una credencial antigua de una empresa suspendida.

**Corrección.** Política común para accesos no interactivos: estado, módulo, alcance del token y expiración/revocación. Definir por producto qué labores de retención y cierre deben sobrevivir a una suspensión, y separar esas excepciones de operación comercial.

**Aceptación.** Un token existente de empresa suspendida no registra pagos ni publica datos. Quitar tesorería corta la conciliación. Los trabajos deliberadamente permitidos tienen casos de prueba y registros explícitos.

## SEG-11 — Respuestas demasiado amplias de User

**Evidencia.** `SafeUser` se define como `Omit<User, 'passwordHash'>` y `SAFE_USER_OMIT` solo elimina ese campo (`src/lib/services/users.service.ts:15`). `listUsers` y varias mutaciones devuelven el resto. El modelo User incluye `totpSecret` cifrado (`prisma/schema.prisma:215`) y estado de seguridad interno.

**Impacto.** Quien administra equipo recibe material de autenticación cifrado que no necesita. No se afirma que se filtre un secreto TOTP en claro ni que el cifrado pueda romperse: el fallo es de minimización y aumento de superficie ante otro compromiso.

**Corrección.** DTO positivo de los campos que necesita la interfaz, compartido por lecturas y mutaciones. Evitar que un nuevo campo de seguridad en el modelo se publique automáticamente.

**Aceptación.** Serializaciones de equipo, perfil, roles y reseteos no incluyen `totpSecret`, hashes, tokens ni campos de bloqueo que no sean necesarios para una función visible.

## SEG-12 — Webhook de firma: abuso y pérdida de reintentos

**Evidencia.** `src/app/api/webhooks/zapsign/route.ts:30` consulta a ZapSign antes de verificar que el token pertenece a un documento local. Descarga y sube el PDF antes de esa comprobación (`:35`, `:42`, `:44`). No hay limitación de frecuencia en esta ruta. Cualquier excepción, incluidos fallos transitorios, devuelve HTTP 200 (`:90`). Los efectos externos ocurren antes de determinar si el documento ya estaba firmado. La transición `justSigned` usa lectura seguida de actualización sin condición `signedAt: null` (`src/modules/candidates/services/documents.service.ts:138`), por lo que dos entregas concurrentes pueden notificar dos veces.

**Impacto.** Consumo innecesario de cuota y almacenamiento, duplicación de efectos y falta de reintentos del proveedor cuando ocurre un fallo real de red o persistencia. La reconsulta de ZapSign protege la integridad de la firma; no se encontró aceptación de una firma basada únicamente en el cuerpo recibido.

**Corrección.** Validar formato y existencia local antes de I/O remoto; limitar frecuencia; procesar mediante cola y estado de idempotencia; límites de descarga y timeout. Responder éxito solo tras persistir o aceptar durablemente el trabajo; distinguir token inválido de errores reintentables. Transición de firma atómica.

**Aceptación.** Tokens ajenos no generan llamadas al proveedor. Entregas duplicadas/concurrentes producen una transición y una notificación. Una indisponibilidad temporal conserva el trabajo pendiente y se recupera mediante reintento.

## SEG-13 — Subidas sin política común de contenido y recursos

**Evidencia.** Documentos de candidatas y pagarés validan `file.type`, tamaño y extensión derivada, pero no firma binaria (`src/app/api/candidates/document-upload/route.ts:38`, `src/app/api/promissory-notes/document-upload/route.ts:38`). La postulación pública sí tiene validación binaria, por lo que hay un control existente reutilizable. En mensajería se cifra y sube el objeto (`src/app/api/messaging/attachments/upload/route.ts:63`, `:66`) antes de que `createPendingAttachment` (`:72`) compruebe pertenencia a la conversación. No hay cuotas por usuario/empresa en estas rutas.

**Impacto.** MIME declarado no demuestra tipo real. Las solicitudes rechazadas después de subir pueden dejar objetos huérfanos y consumir recursos. No se demostró ejecución de malware ni XSS a partir de estos archivos.

**Corrección.** Autorización de entidad antes de lectura costosa/subida, detección binaria común, límites de tamaño y cuota, limpieza compensatoria de fallos y política de análisis para documentos ofimáticos/archivos comprimidos acorde a su uso.

**Aceptación.** Una conversación no autorizada no produce operaciones de storage. MIME adulterado se rechaza. Un error de persistencia limpia o agenda limpieza del objeto. Las cuotas se mantienen entre instancias.

## SEG-14 — CSP permisiva y desalineada con storage

**Evidencia.** `next.config.js:28` permite simultáneamente `unsafe-inline` y `unsafe-eval` en scripts. `img-src` (`:30`) solo contempla el origen local, data/blob y Vercel Blob, aunque la implementación nueva devuelve URLs de R2.

**Impacto.** La CSP ofrece menor contención si aparece una inyección. Imágenes alojadas en un host R2 distinto pueden bloquearse en navegador. No se encontró una explotación XSS demostrada ni se verificaron los headers desplegados.

**Corrección.** Política con nonce/hash compatible con el modo de render y quitar eval en producción si no es imprescindible. Incluir únicamente el origen público de imágenes realmente configurado, diferenciándolo del almacenamiento privado.

**Aceptación.** Prueba en navegador de login, navegación, hidratación e imágenes reales; CSP aplicada sin bloqueos legítimos y sin excepciones de script innecesarias.

## Controles positivos comprobados

- Las contraseñas se verifican con bcrypt coste 12. El login serializa los intentos por usuario mediante bloqueo de fila y aplica bloqueo temporal; existe comparación contra hash fijo para cuentas inexistentes.
- Las cookies de sesión son httpOnly, SameSite Strict y Secure en producción, con duración de ocho horas. Hay validación de propósito del JWT, separación del challenge de TOTP y comprobación de `sessionVersion` contra la base.
- Los guards ordinarios releen usuario, estado del tenant y permisos efectivos. Resuelven membresía multiempresa contra la base y cruzan permisos con módulos contratados. Es una buena base para corregir las excepciones identificadas.
- Los servicios muestreados usan filtros de empresa y, en operaciones financieras relevantes, transacciones y bloqueo de filas. El fallo de archivos no implica que toda consulta SQL carezca de separación.
- Hay cifrado AES-GCM de TOTP, CAF y adjuntos de mensajería. Los adjuntos de mensajería se descargan mediante una ruta que comprueba participación y descifra en servidor.
- Existen validación binaria para archivos de postulación, control de URLs salientes frente a destinos internos, headers de seguridad y un sistema de observabilidad con redacción.
- El webhook general identifica empresa por credencial y reclama eventos de forma atómica. La firma de ZapSign se comprueba contra la API del proveedor, sin confiar en una declaración del solicitante.
- El backup requiere permiso propio y excluye sesiones, códigos de respaldo y CAF; filtra nombres de campos sensibles. Esto no reemplaza un respaldo restaurable ni una auditoría completa de datos anidados.

## Plan de validación y cierre

1. Preparar una base aislada, datos sintéticos de dos empresas, cuentas OWNER/ADMIN/lector básico y un superadmin de prueba; storage y proveedores simulados. Nunca usar el `.env` de producción para estas pruebas.
2. Entrega urgente: SEG-01 a SEG-04; cubrir salud, recuperación de cuentas, cambio de contraseña y autorización de archivos con pruebas de denegación que comprueben ausencia de mutaciones/llamadas externas.
3. Entrega de autenticación: SEG-05, SEG-07 y SEG-08; probar el ciclo completo de dispositivos, cambio de empresa, revocación, IP y cambio obligatorio.
4. Entrega de integraciones y privacidad: SEG-06, SEG-09, SEG-10 y SEG-12; migración revisable de archivos, cuotas compartidas y procesamiento durable de webhooks. Inventariar objetos legacy antes de retirar acceso público.
5. Endurecimiento: SEG-11, SEG-13 y SEG-14; DTO mínimos, subidas consistentes y verificación de headers en staging.
6. Validación final: pruebas de integración que atraviesen API/Server Actions además de helpers, navegación real en staging y revisión independiente de los escenarios P0. Medir sesiones sin registro, rechazos por permisos, objetos huérfanos, reintentos fallidos y tasa de límites aplicados.

Queda pendiente verificar configuración real de hosting/WAF/storage, credenciales y rotación, MFA de cuentas privilegiadas, retención y eliminación efectiva, cobertura de auditoría, comportamiento de sesiones en despliegue, vulnerabilidades de dependencias y revisión jurídica específica de tratamiento de salud/menores. Este documento no acredita cumplimiento normativo ni ausencia de otras vulnerabilidades.
