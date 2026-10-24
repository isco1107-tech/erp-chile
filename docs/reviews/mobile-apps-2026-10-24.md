# Revisión de aplicaciones móviles — 24 de octubre de 2026

Las tres aplicaciones siguen usando sus accesos personales y los datos del ERP. Esta revisión mejora la operación desde el teléfono sin cambiar los cálculos, las transacciones ni las reglas de permisos.

- **Aether Control:** navegación directa a resumen, cajas y actividad; indicadores que se adaptan al ancho disponible; filtros de ventas/caja/bodega y búsqueda por producto, movimiento u operario. La falta de conexión deshabilita la actualización manual y señala la antigüedad de la consulta. Una respuesta 401/403 sigue eliminando la información de pantalla.
- **Seller Center:** navegación a resumen, ventas, mercadería y mermas; búsqueda independiente en ventas y stock; liquidaciones en tarjetas en teléfonos y tabla en escritorio. Los totales mensuales conservan su significado al filtrar productos. La fecha de consulta y la conexión quedan visibles. Un cierre de sesión fallido se informa sin fingir que terminó; el cambio de empresa recarga el documento antes de permitir nuevas descargas.
- **Bodega móvil:** inicio más compacto y contadores accionables; barra de consulta, lista y envíos que permanece accesible mientras se desplazan las tareas. Se conservan la confirmación de descarte, el borrador, la cola persistente y la atribución de los movimientos.
- **Instalación:** Control y Seller mantienen el evento de instalación en su layout, incluso al navegar desde el ingreso. Las instrucciones distinguen iPhone/iPad, Android y computador. La aceptación del diálogo no se presenta como instalación terminada: se espera el evento real o el modo independiente. Bodega muestra instrucciones también al cancelar.

Las versiones móviles son PWA. Control y Seller requieren conexión para consultar información nueva y sus workers no cachean HTML privado ni APIs. La cola offline de bodega mantiene su implementación existente. No se modificó el esquema de la base de datos.

## Validación

- Compilación de producción local con PostgreSQL de pruebas, sin ejecutar migraciones de producción.
- 16 casos E2E distintos aprobados entre los recorridos de apps, Seller Center, ingreso, instalación, cámara y fotos de bodega (incluye el setup). Las correcciones se volvieron a ejecutar sobre la app compilada.
- Las tres apps revisadas en 13 anchos entre 280 y 2560 px. Seller Center usa también el detector de textos cortados y tipografía pequeña, con un nombre largo; Control usa una razón social larga. Capturas revisadas en `.vercel/apps-review/`, incluidas las liquidaciones y las mermas en el teléfono.
- `npm run verify:responsive -- --only=normal`: 13 combinaciones sin desbordes ni textos cortados y comprobación de interacciones del verificador general.
- La cámara usa un video de prueba y las respuestas de IA se simulan; la sesión, los permisos, la cola y los movimientos de inventario se comprueban contra el servidor y la base local. Esto no sustituye una prueba física en iPhone o Android.
- `npm run ci`: Prisma válido, TypeScript y ESLint sin errores; 202 suites y 3.856 pruebas aprobadas. Permanecen 18 advertencias de lint anteriores y 17 suites de integración que requieren sus variables de base de pruebas.
