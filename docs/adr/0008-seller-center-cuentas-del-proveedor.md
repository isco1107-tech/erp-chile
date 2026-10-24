# 0008 — Seller Center: cuentas por persona del proveedor, con ventas en pesos

Estado: aceptada (2026-10-24)

## Contexto

El portal del proveedor (ADR 0005) entrega un código por proveedor y muestra **solo cantidades**. Un supermercado que vende productos de productores locales **en consignación** necesita más: que cada persona del productor entre con su propia cuenta y vea lo que vendió en pesos, sus existencias y sus mermas, para liquidar sin discusión. Se definió con el dueño del proyecto:

- Ingreso con **correo y contraseña**, una cuenta **por persona**.
- Ventas en **unidades y pesos al precio cobrado**.
- Un producto con varios proveedores: se muestra **solo si lo surte uno**.
- Las mermas **solo se ven** (sin objeciones dentro de Aether por ahora).
- Las comisiones y liquidaciones automáticas **quedan fuera** hasta que se aprueben los términos comerciales.

## Decisión

1. **Interruptor propio dentro de Inventario** (`hasSellerCenter`, Supersuite `seller_center`, `requires: 'hasInventory'`, fuera del tarifario). Apagarlo cierra todas las sesiones en la siguiente página.
2. **La persona es de la plataforma; el acceso es de la empresa.** `SupplierPortalPerson` (correo único, sin `companyId`) y `SupplierPortalMembership` (empresa + proveedor + persona, a lo más uno por empresa). Una persona invitada por dos empresas tiene **una** contraseña; aceptar la segunda invitación exige esa contraseña (nadie suma un acceso a la cuenta de otro). Ninguna empresa ve ni cambia contraseñas, ni sabe si la persona tiene acceso en otra empresa: su lista muestra el nombre con que ELLA la invitó (`SupplierPortalMembership.personName`), nunca el que escribió otra.
3. **Contraseña como en el panel.** `bcrypt` costo 12, la misma política (`passwordPolicySchema`), 5 intentos y 15 minutos de bloqueo con la fila bloqueada (`FOR UPDATE`) y `bcrypt` de relleno si el correo no existe; límite por IP en ingreso, invitación y recuperación. Los enlaces (invitación 7 días, recuperación 60 minutos) son 32 bytes al azar, se guarda solo su SHA-256 y sirven una vez. **Los correos de acceso salen por la cuenta de la plataforma**, nunca por el Brevo de una empresa (que podría leerlos y tomar una cuenta que también usa otra empresa).
4. **Sesión propia y revalidada.** Cookie `supplier_session` (`httpOnly`, `secure` en producción, `sameSite: strict`, 8 h) firmada con una clave **derivada** de `JWT_SECRET` distinta a la del panel (como el desafío de 2FA) y con `purpose: 'supplier_session'`: un token no sirve en el otro lado. En cada página se revalida: acceso activo y aceptado, contacto aún proveedor, empresa `ACTIVE|TRIAL`, Inventario y Seller Center encendidos, y `sessionVersion` (recuperar la contraseña cierra todas las sesiones). El proxy no la conoce: `/proveedor` ya es pública y cada página/ruta valida.
5. **Se levanta la regla «solo cantidades», solo aquí y acotada.** El Seller Center muestra **neto cobrado** (subtotal de la línea: precio × cantidad − descuento, sin IVA) de boletas y facturas **emitidas** menos las **notas de crédito**, por mes de Santiago, **solo de los productos que surte en exclusiva** (un único `ProductSupplier`): un producto compartido tiene una sola venta y mostrarla sería mostrar la de otro productor; de esos se muestran existencias. Las guías de despacho no cuentan (las factura después una factura). **Nunca** el costo de la tienda (PMP), su margen, clientes, documentos, notas internas de las mermas ni otros proveedores; la vista se arma campo por campo y `tests/seller-center-db.test.ts` lo vigila. El portal con código sigue igual (solo cantidades).
6. **Mermas para mirar.** Las del mes de sus productos exclusivos y las que la tienda le asignó en «Mermas con responsable» (si la empresa lo usa, con quién respondió: «A tu cargo», «La tienda», «Sin asignar» u «Otro responsable», sin nombrar a otro proveedor). La foto solo si es de nuestro almacenamiento.
7. **La empresa administra desde la ficha del proveedor** (`settings:company`, como el portal con código): invitar, reenviar, anular una invitación, desactivar y reactivar; todo auditado (`SupplierPortalMembership`).

## Consecuencias

- Dos tablas nuevas y una columna en `CompanyFeatures`, con migración aditiva e idempotente. `SupplierPortalPerson` no tiene empresa: no entra al respaldo por empresa y, si una empresa se borra, sus accesos se van en cascada pero la persona queda (puede tener accesos en otras).
- Lo que ve el proveedor depende de que `ProductSupplier` esté bien: un producto sin proveedor no aparece, y uno compartido no muestra ventas.
- Sin Turnstile en el ingreso (el del panel sí lo tiene si está configurado): el límite por IP es por instancia (ver `rate-limiter.ts`), así que el bloqueo por cuenta es la barrera principal.
- Pendiente con el dueño: liquidaciones y comisiones (términos comerciales), objeciones a una merma y cambio de contraseña con sesión abierta (hoy se usa «¿Olvidaste tu contraseña?").
