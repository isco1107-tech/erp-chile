# Lista de lanzamiento: legal y operativa

Lo que hay que tener listo antes de ofrecer Aether a clientes, en orden de prioridad. Basada en una revisión del código y del estado real de Vercel y Neon el **3 de octubre de 2026**.

Leyenda: **[Tú]** lo hace el dueño en un panel u oficina · **[Abogado]** requiere revisión profesional · **[Código]** ya resuelto en el repositorio.

## A. Bloqueantes: antes del primer cliente

### Empresa y contratos
- [ ] **[Tú]** Operar a través de una sociedad (por ejemplo una SpA) y no como persona natural: separa tu patrimonio personal de las deudas y reclamos del negocio.
- [ ] **[Tú]** Inicio de actividades en el SII con un giro de desarrollo y venta de software, y emisión de tus propias facturas a los clientes.
- [ ] **[Tú]** Definir en Vercel `AETHER_LEGAL_NAME`, `AETHER_LEGAL_RUT` y `AETHER_LEGAL_ADDRESS`: los términos identifican al proveedor con ellas. **Hoy no existen en producción.**
- [ ] **[Abogado]** Revisar `/aether/terminos`, `/aether/privacidad`, `/aether/encargado`, `/politica-privacidad` y los documentos de esta carpeta. Preparar una cotización o contrato comercial modelo que remita a los términos.
- [ ] **[Tú]** Consultar en INAPI si la marca "Aether" está disponible en la clase de software y registrarla. Es un nombre común: si otra empresa la tiene registrada, conviene saberlo antes de invertir en ella.
- [x] **[Código]** Términos con tope de responsabilidad, exclusión de daños indirectos, indemnidad, suspensión por no pago, plazo de borrado al terminar, IA, eventos y tribunales.
- [x] **[Código]** Aceptación registrada de términos y privacidad al activar cada cuenta (versión y fecha).

### Datos personales (Ley 19.628 y Ley 21.719, vigente desde el 1 de diciembre de 2026)
- [x] **[Código]** Aviso de privacidad en entradas, votos, cuotas, portal del auspiciador y encuesta (`/aviso-privacidad`).
- [x] **[Código]** Certificados médicos y documentos de candidatas en un bucket privado (requiere el paso siguiente).
- [ ] **[Tú]** Crear el bucket **privado** en Cloudflare R2 y las variables `R2_*` y `R2_PRIVATE_BUCKET_NAME` en Vercel. **Hoy producción no tiene R2 configurado**: todo sigue en Vercel Blob público.
- [ ] **[Tú]** Migrar al bucket privado los certificados médicos ya subidos (pedirlo: hay que escribir un script y probarlo en una rama de Neon).
- [ ] **[Tú]** **Borrar las 7 ramas de Neon `preview/*`, `vercel-dev` y `ensayo-categorias-auspicio`**: son copias completas de producción, con datos personales reales, creadas por la integración de Neon con Vercel. Después, configurar la integración para que las vistas previas no copien datos de producción.
- [ ] **[Tú]** Pasar Gemini a un plan de pago antes de procesar datos reales de clientes (en el plan gratuito, Google puede usar lo enviado para mejorar sus productos).
- [ ] **[Abogado]** Evaluación de impacto para el módulo de candidatas (datos sensibles de salud y de menores) y decidir si se nombra un delegado de protección de datos. Ambos son voluntarios, pero atenúan sanciones.
- [ ] **[Código, pendiente]** Al eliminar una empresa, borrar también sus archivos en R2/Blob (hoy es manual; ver conservación y respaldos).

### Infraestructura
- [ ] **[Tú]** **Neon: pasar el proyecto `erp` del plan gratuito a Launch.** Hoy tiene restauración de solo 6 horas y un tope de 1 GB por rama.
- [ ] **[Tú]** Neon: marcar la rama `production` como **protegida** (hoy no lo está).
- [ ] **[Tú]** Dejar de usar la base de producción desde el `.env` local: crear una rama `desarrollo` y apuntar ahí.
- [ ] **[Tú]** Vercel Pro (uso comercial y 13 tareas programadas).
- [ ] **[Tú]** Verificación en dos pasos en Vercel, Neon, Cloudflare, GitHub y el proveedor de correo, y una **segunda persona** con acceso de administrador.

## B. Primeras dos semanas

- [ ] **[Tú]** Conectar Cloudflare según `docs/security/cloudflare.md` y definir `CLOUDFLARE_ORIGIN_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` (**ninguna existe hoy en producción**). Después, el bloqueo de origen en el firewall de Vercel.
- [ ] **[Tú]** Crear una cuenta gratuita de Sentry y definir `SENTRY_DSN`.
- [ ] **[Tú]** Monitor externo de disponibilidad (UptimeRobot, Better Stack) con aviso al celular.
- [ ] **[Tú]** Eliminar de Vercel `TAVILY_API_KEY`: el código no la usa.
- [ ] **[Tú]** Confirmar que `ZAPSIGN_BASE_URL` apunta a producción (`https://api.zapsign.com.br`) y no al sandbox; si no, las firmas no tienen validez legal.
- [ ] **[Tú]** Primera prueba de restauración de Neon a una rama nueva.
- [ ] **[Tú]** Completar la tabla de contactos de emergencia en `respuesta-incidentes.md`.
- [x] **[Código]** Errores de producción corregidos: montos fuera de rango, aviso SSL que llenaba los registros y modelo de NVIDIA dado de baja.

## C. Lo que cada cliente organizador debe saber (avisar al venderle)

Estas obligaciones son del **cliente**, no de Aether (términos, sección 6), pero si no las cumple el problema te salpica. Inclúyelas en el material de incorporación:

- Publicar las **bases del certamen**: requisitos, selección, jurado, premios y uso de la votación pagada (que no dependa del azar).
- Autorización del **representante legal** de cada candidata menor de edad y contrato de **uso de imagen**.
- Venta de entradas y votos a consumidores (Ley 19.496): precio total, condiciones de devolución y, si excluye el **derecho de retracto** de la compra a distancia, informarlo de forma clara antes del pago. **Confirmar con el abogado.**
- Emitir los documentos tributarios de lo que vende (entradas, votos, cuotas).
- Completar en la plataforma el correo de contacto del certamen y, si es persona natural, revisar los datos que publica la política de privacidad.

## D. Revisión periódica

| Frecuencia | Qué |
|---|---|
| Semanal | Errores en Sentry/Vercel, tareas programadas ejecutadas, alertas de folios del SII. |
| Mensual | Costos, consultas lentas en Neon, `npm audit`, usuarios y claves sobrantes, exportación de respaldo por empresa. |
| Trimestral | Prueba de restauración, reglas del WAF, este documento. |
| Cada cambio legal | Subir `TERMS_VERSION` o `PRIVACY_POLICY_VERSION`. |
