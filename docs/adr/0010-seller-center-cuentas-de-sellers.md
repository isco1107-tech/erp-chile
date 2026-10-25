# 0010 — Seller Center: cuentas por persona de los sellers en consignación

Estado: aceptada (2026-10-24)

## Contexto

La consignación (ADR 0009) separa a los **sellers** de los proveedores: el producto tiene un solo dueño (`Product.consignorId`), cada línea de venta guarda la foto del seller y de la comisión, y la empresa liquida lo vendido menos la comisión. El seller entra a su portal con **un código por contacto** (`/proveedor/[código]`, ADR 0005), que ve cualquiera que lo tenga.

Un supermercado que vende productos de productores locales en consignación pidió más: que **cada persona** del seller entre con su propia cuenta, vea lo que vendió en pesos mes a mes con la comisión, su mercadería, sus liquidaciones y sus mermas, y que la empresa pueda quitarle el acceso a una persona sin cambiarle el código a todos. Se definió con el dueño del proyecto:

- Ingreso con **correo y contraseña**, una cuenta **por persona**.
- Lo vendido **en pesos, con la misma cuenta de la liquidación**.
- Las mermas **solo se ven** (sin objeciones dentro de Aether por ahora).
- **Un solo modelo de productor:** el Seller Center es de los sellers de ADR 0009; no inventa otra definición de «qué es suyo».

## Decisión

1. **Interruptor propio dentro de Inventario** (`hasSellerCenter`, Supersuite `seller_center`, `requires: 'hasInventory'`, con precio en el tarifario: `seller-center`). Apagarlo cierra todas las sesiones en la siguiente página. El portal con código sigue funcionando aparte.
2. **Solo sellers.** Un acceso (`SupplierPortalMembership`) es de una persona a UNA empresa en nombre de UN contacto marcado `isConsignor`; si el contacto deja de ser seller, el acceso deja de servir. Un contacto que solo es proveedor no tiene Seller Center.
3. **La persona es de la plataforma; el acceso es de la empresa.** `SupplierPortalPerson` (correo único, sin `companyId`). Una persona invitada por dos empresas tiene **una** contraseña; aceptar la segunda invitación exige esa contraseña (nadie suma un acceso a la cuenta de otro). Ninguna empresa ve ni cambia contraseñas, ni sabe si la persona tiene acceso en otra empresa: su lista muestra el nombre con que ELLA la invitó (`SupplierPortalMembership.personName`), nunca el que escribió otra.
4. **Contraseña como en el panel.** `bcrypt` costo 12, la misma política (`passwordPolicySchema`), 5 intentos y 15 minutos de bloqueo con la fila bloqueada (`FOR UPDATE`) y `bcrypt` de relleno si el correo no existe; límite por IP en ingreso, invitación y recuperación. Los enlaces (invitación 7 días, recuperación 60 minutos) son 32 bytes al azar, se guarda solo su SHA-256 y sirven una vez. **Los correos de acceso salen por la cuenta de la plataforma**, nunca por el Brevo de una empresa (que podría leerlos y tomar una cuenta que también usa otra empresa).
5. **Sesión propia y revalidada.** Cookie `supplier_session` (`httpOnly`, `secure` en producción, `sameSite: strict`, 8 h) firmada con una clave **derivada** de `JWT_SECRET` distinta a la del panel (como el desafío de 2FA) y con `purpose: 'supplier_session'`: un token no sirve en el otro lado. En cada página se revalida: acceso activo y aceptado, contacto aún seller, empresa `ACTIVE|TRIAL`, Inventario y Seller Center encendidos, y `sessionVersion` (recuperar la contraseña cierra todas las sesiones).
6. **Lo vendido sale de SUS líneas de venta, con la regla de la liquidación.** `SalesDocumentItem.consignorId` del mes (de Santiago), con `currentContribution` de `src/lib/consignment/settlement.ts`: boletas y facturas emitidas suman, las notas de crédito restan lo que se le acreditó (`consignorBaseNet`), y la comisión es la congelada en la línea. Muestra neto, comisión y lo que le corresponde, por producto. Así lo que ve cuadra con lo que se le liquida, y si un producto cambió de dueño no ve ventas ajenas.
7. **Su mercadería, lo pendiente y sus liquidaciones son la vista del portal** (`buildPortalView`, la misma del código), armada campo por campo. Nunca el costo de la tienda, clientes, documentos, notas internas de las mermas ni otros sellers (`tests/seller-center-db.test.ts`).
8. **Mermas para mirar.** Las que la tienda le asignó en «Mermas con responsable» y las de sus productos **desde su primera recepción en consignación** (antes, la mercadería era de otro dueño). Si la empresa usa «Mermas con responsable», con quién respondió: «A tu cargo», «La tienda», «Sin asignar» u «Otro responsable», sin nombrar a nadie más. La foto solo si es de nuestro almacenamiento. En «Mermas con responsable», una pérdida de mercadería en consignación se sugiere a su seller dueño.
9. **La empresa administra desde la ficha del seller** (`settings:company`, como el portal con código): invitar, reenviar, anular una invitación, desactivar y reactivar; todo auditado (`SupplierPortalMembership`).

## Consecuencias

- Dos tablas nuevas y una columna en `CompanyFeatures`, con migración aditiva e idempotente (`20261116120000_seller_center`). `SupplierPortalPerson` no tiene empresa: no entra al respaldo por empresa y, si una empresa se borra, sus accesos se van en cascada pero la persona queda (puede tener accesos en otras).
- Sin Turnstile en el ingreso (el del panel sí lo tiene si está configurado): el límite por IP es por instancia (ver `rate-limiter.ts`), así que el bloqueo por cuenta es la barrera principal.
- Pendiente con el dueño: objeciones a una merma, cambio de contraseña con sesión abierta (hoy se usa «¿Olvidaste tu contraseña?») y mostrar, si el seller además es proveedor, su inventario como proveedor (hoy lo ve con el código del portal).

## Ampliación: alta integrada y teléfono (24 de octubre de 2026)

- Al crear un seller desde Contactos se puede guardar su primera invitación en la misma transacción. Se exige `contacts:write`, `consignment:write`, `settings:company` y el módulo Seller Center. El transporte del correo ocurre después del commit: un fallo conserva el seller y la invitación para reenviar, sin sugerir volver a crear el contacto.
- La identidad puede ser un correo normalizado o un celular E.164 (los celulares chilenos de nueve dígitos se normalizan con +56). La migración aditiva `20261117120000_seller_phone_identity` hace opcional email, agrega phone único y exige al menos una identidad. No hay correos ficticios ni se vinculan automáticamente cuentas por coincidencia de datos de contacto.
- Por correo, la plataforma entrega el usuario y un enlace provisional de un solo uso; la persona elige su contraseña antes de consultar información. No se mandan contraseñas permanentes por correo. Una cuenta existente mantiene su contraseña al sumar otra empresa.
- Por teléfono, el administrador obtiene una invitación para compartir manualmente por WhatsApp (canal elegido por el dueño). El mensaje no se envía automáticamente y el estado no afirma que llegó. La URL en claro se muestra solo al generarla; la base guarda su hash. Reenviar la rota; anularla la invalida. No se incorpora un proveedor SMS.
- El ingreso acepta correo o celular con contraseña y conserva el bloqueo por cuenta, el límite por IP, la cookie propia y el aislamiento por acceso. Administrar el seller o editar su teléfono de contacto no cambia la contraseña global de la persona ni permite recuperarla. La recuperación automática existente sigue siendo por correo; las cuentas solo por teléfono requieren asistencia y verificación de identidad, sin entregar al administrador un enlace de restablecimiento global.
- Seller Center conserva su PWA independiente, con manifiesto, icono, scope, entrada e instalación propios en `/proveedor/cuenta`, sin navegación al dashboard del ERP ni caché de datos privados en su worker.
