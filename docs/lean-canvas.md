# Lean Canvas — Aether (ERP chileno + producción de eventos)

Fecha: 2026-10-03. Basado en el código, el README, la landing (`src/components/marketing/Segments.tsx`), la hoja de ruta (`docs/ROADMAP.md`) y el análisis de infraestructura de `docs/escalabilidad-hasta-50-empresas.md`.

> **Qué es dato y qué es hipótesis.** Lo que sale del código o de los documentos del proyecto está tal cual. Todo lo marcado **[validar]** es una hipótesis tuya que no está en el repositorio (precios, tamaño de mercado, número de clientes, conversión): no la inventé, hay que llenarla con conversaciones reales con clientes.

---

## 1. Problema

1. **Las pymes chilenas operan con herramientas sueltas** (planillas, un sistema de facturación, otro de inventario, contabilidad aparte) y no ven cuánto ganan de verdad: el costo real de cada salida, lo que les deben y su caja de las próximas semanas.
2. **La tributación chilena es una carga constante**: IVA, F29, PPM, boletas de honorarios y documentos tributarios electrónicos. Un error de cálculo es un problema con el SII.
3. **Los productores de certámenes y eventos** manejan candidatas, jurado, escaleta en vivo, auspicios y entradas en WhatsApp, Excel y formularios, y no pueden **rendir cuentas** con la contabilidad del evento.
4. Los ERP grandes son caros y pensados para otro mercado; los sistemas pequeños no cubren inventario con costo, contabilidad y tributario a la vez.

**Alternativas existentes:** planillas Excel, sistemas de facturación electrónica sueltos, ERP locales más grandes, y para eventos, formularios y hojas de cálculo. **[validar]** qué usan hoy tus clientes objetivo y qué pagan.

## 2. Segmentos de clientes

Los cuatro segmentos que ya plantea la landing:

| Segmento | Quién es | Qué necesita |
|---|---|---|
| **Comercio y distribución** | Vende productos y mueve bodega | Inventario multibodega, POS, compras, kardex con costo PMP |
| **Servicios y profesionales** | Factura trabajo, no cajas | Presupuestos, boletas de honorarios con retención, planes de pago, cuentas por cobrar |
| **Eventos y certámenes** | Produce y además rinde cuentas | Candidatas, jurado y votación, escaleta, auspicios, entradas, contabilidad del evento |
| **Grupos con varias empresas** | Más de un RUT | Multiempresa, roles a medida, reportes por empresa, respaldo |

**Primeros clientes (early adopters) [validar]:** el segmento con más diferencia frente a la competencia es **eventos y certámenes**, porque casi nadie une producción de eventos con ERP tributario. El ERP puro compite en un mercado más lleno.

## 3. Propuesta de valor única

> **Un solo sistema chileno que lleva tu negocio y tu contabilidad en regla, y si produces eventos, también el certamen completo, sin pegar herramientas.**

- Tributación chilena de verdad, no un estimador: IVA, F29 sobre documentos reales, RUT, boletas de honorarios.
- Todo se contrata **por módulos** (`CompanyFeatures`): pagas solo lo que usas.
- Un dato, un lugar: la venta de entradas, el auspicio y el gasto del evento llegan a la misma contabilidad.
- Reglas de negocio visibles y auditables: lo que se calcula, se calcula con la misma regla en todo el sistema.

**Concepto de alto nivel:** "el ERP chileno que también produce tu certamen".

## 4. Solución

Mapa uno a uno con los problemas:

1. **Control del negocio:** inventario multibodega con kardex PMP, ventas, POS, compras, tesorería (cuentas por cobrar y por pagar, flujo de caja), presupuestos, CRM.
2. **Tributario y contable:** facturación con folios y timbre electrónico (CAF/TED), F29 con motor propio, asientos automáticos, plan de cuentas, cierre mensual, activos fijos, honorarios, remuneraciones.
3. **Producción de eventos:** candidatas, jurado y escrutinio en vivo, escaleta con modo show, vestuario, acreditación, auspicios con tarifario, entradas, votación del público, micrositio del certamen con dominio propio y afiches de campaña.
4. **Inteligencia:** Radiografía 360, caja a 13 semanas, equipo ejecutivo virtual (agentes con IA) y alertas operativas.
5. **Cobro y fidelización:** pago en línea de cuotas por Khipu, encuestas de satisfacción, seguimiento de clientes inactivos.

**Producto de partida (MVP) a vender primero [validar]:** certámenes y eventos, más el núcleo ERP que ya funciona (ventas, inventario, tesorería).

## 5. Canales

- **Venta directa y demos** a productores de certámenes y pymes (conversación, WhatsApp, demo en vivo). Ya existe formulario de contacto de ventas y landing.
- **Landing y SEO** (`src/components/marketing/`), con páginas por segmento.
- **El propio producto como canal:** cada micrositio de certamen y cada entrada llevan «Hecho con Aether» hacia la plataforma (`AetherBadge`).
- **Alianzas:** contadores y asesores tributarios que llevan varias pymes; academias, municipalidades y organizadores de certámenes. **[validar]**
- **Universidad / entorno académico** como primer espacio de prueba, con acuerdo escrito sobre propiedad intelectual antes de usarlo.

## 6. Fuentes de ingreso

- **Suscripción mensual por empresa y por módulo.** La arquitectura ya lo permite: cada módulo se activa por empresa.
- **Cobro por uso en eventos [validar]:** comisión sobre entradas vendidas o votos pagados (hoy se procesan, falta definir si se cobra).
- **Servicios:** implementación, importación de datos, capacitación y, con el módulo de sitios web, diseño de sitios para clientes.
- **Precios concretos: [validar].** No hay precios definidos en el repositorio. Para fijarlos, parte del costo por cliente (sección 7) y de lo que hoy paga el cliente por herramientas sueltas.

## 7. Estructura de costos

**Infraestructura (estimación, ver `docs/escalabilidad-hasta-50-empresas.md`):**

| Concepto | Orden de magnitud |
|---|---|
| Vercel Pro | desde ~US$20 por usuario al mes |
| Neon (plan pagado) | por uso: US$0,106 por CU-hora y US$0,35 por GB al mes |
| Gemini de pago, correo (Brevo/Resend) | variable con el uso |
| Cloudflare R2 | ~US$1–4 al mes para 50 empresas (estimado) |
| Redis para rate limit (Upstash) | capa gratuita al inicio |
| **Total base operando comercialmente** | **~US$60–150 al mes** |

**Otros costos:**
- Tu tiempo de desarrollo y soporte (el costo dominante, hoy sin valorizar).
- Comisiones de Khipu por pago en línea.
- Certificación y pruebas con el SII (certificado digital real para probar el envío).
- Marketing, contenido y demos.
- Asesoría legal: contrato de servicio, términos, política de privacidad y Ley 21.719.

**Costo variable bajo:** el costo por empresa nueva es pequeño (una base compartida y serverless), por eso los márgenes pueden ser altos si el precio cubre soporte.

## 8. Métricas clave

Las que importan para decidir:

- **Activación:** empresas que emiten su primer documento o publican su primer certamen en los primeros 14 días.
- **Retención:** empresas activas a los 3 y 6 meses (un ERP se queda si cierra el mes dentro).
- **Ingreso mensual recurrente (MRR)** y **módulos por empresa**.
- **Eventos:** certámenes publicados, candidatas inscritas, entradas y votos vendidos.
- **Soporte:** tickets por empresa al mes y tiempo de respuesta.
- **Salud técnica:** errores en Sentry, duración de los cron, consultas lentas en Neon.

Objetivos numéricos: **[validar]** (primero medir, luego fijar).

## 9. Ventaja injusta

Honestamente, hoy lo más defendible es la **combinación**, no una sola pieza:

- **ERP tributario chileno + producción de eventos en un mismo producto**, con contabilidad compartida: difícil de replicar rápido.
- **Profundidad en reglas chilenas ya construidas y probadas** (más de 2.700 tests): IVA con reparto exacto, F29, PMP con bloqueo, CAF/TED, RUT.
- **Costo de operación muy bajo** por la arquitectura serverless multi-tenant, que permite precios agresivos.
- **Conocimiento del dominio** del certamen (casting, escaleta, jurado) por experiencia propia. **[validar]** cuánta es tu red en ese mercado.
- Lo que **no** es ventaja todavía: marca, base de clientes y facturación electrónica ya certificada con el SII.

---

## Riesgos que el canvas deja a la vista

1. **Facturación electrónica con el SII:** el núcleo de firma y envío está hecho (`src/lib/chile/dte/`), pero según la hoja de ruta falta guardar el certificado cifrado por empresa, la acción «Enviar al SII», la consulta de estado y, sobre todo, la **prueba real en el ambiente de certificación del SII con un certificado verdadero**. Para vender como "ERP chileno" a empresas que facturan, esto es el bloqueo más importante. Mientras tanto, una empresa sin CAF emite con contador interno y **sin validez tributaria**.
2. **Auditoría pendiente:** la hoja de ruta lista fichas de seguridad, negocio y operación aún abiertas, entre ellas el **entorno de desarrollo apuntando a la base de producción** (OP-01).
3. **Dos mercados a la vez** (ERP y eventos) diluyen el foco. Conviene elegir uno como cuña y vender el otro como ampliación.
4. **Dependencia de pocas personas** (soporte y desarrollo): definir cuántos clientes puedes atender antes de contratar.
5. **Datos personales** (candidatas, RUT): cumplir la Ley 21.719 es parte del producto, no un trámite.
6. **Propiedad intelectual** si usas recursos de una universidad: resolverlo por escrito antes de vender.

## Qué validar primero (las 5 hipótesis más riesgosas)

1. ¿Los productores de certámenes pagan por un sistema así, y cuánto pagan hoy por lo que usan? **[validar]**
2. ¿Una pyme cambiaría su sistema de facturación por Aether sin facturación certificada con el SII? Probablemente no: acelerar la prueba real en certificación.
3. ¿Qué precio por módulo cubre soporte y deja margen? **[validar]**
4. ¿Qué segmento convierte más rápido: eventos o comercio? **[validar]**
5. ¿Cuántas empresas puedes atender sola/o con calidad? Medirlo con los primeros 5 clientes.
