# Aether Bodega: implementación y puesta en marcha

## Superficies

- `/bodega`: pantalla del operario, instalable en Android/iPhone desde el navegador.
- `/dashboard/inventory/mobile`: pendientes e historial central para supervisión.
- `mobile/aether-warehouse`: aplicación nativa Expo para Android/iOS, con SQLite cifrado, cámara, OCR local y transporte nativo de cookies.

El núcleo de captura y sincronización está en `src/lib/warehouse/`. La web y la app nativa usan los mismos contratos, parser GS1, reglas de cantidades, cola y motor de sincronización. Cambia únicamente el almacenamiento y el transporte.

## Trabajo del operario

1. Iniciar sesión con conexión y actualizar el catálogo. La empresa, cuenta y bodega quedan identificadas.
2. En la web, pulsar **Preparar lectura sin señal** antes de salir de cobertura. Esto descarga desde Aether los archivos de OCR y el shell de la aplicación. En la app nativa, el modelo latino se incluye en la instalación.
3. Elegir **Entrar**, **Sacar**, **Contar** o **Consultar**. Escanear el código o fotografiar la etiqueta, comprobar los datos y confirmar la cantidad realmente manipulada.
4. Verificar los estados de **Registros**. Guardado en el teléfono y confirmado en Aether son estados distintos.
5. Antes de cerrar el turno, conectar y comprobar que no queden registros sin enviar. Los datos nuevos o movimientos de otros teléfonos se consultan con **Actualizar**.

Las fotos se procesan en el dispositivo. La sincronización no incluye imágenes. Un código comercial puede identificar solo el producto; si hay datos GS1 se interpretan lote, vencimiento y peso. El contenido de una caja no se confunde con el número de cajas recibidas. Los valores ilegibles se completan manualmente.

## Operaciones y controles

| Operación | Tratamiento |
| --- | --- |
| Recepción contra OC | Valida producto, línea y pendiente. Toma el costo de la orden y reutiliza la recepción de Compras, sin duplicar stock al facturar después |
| Entrada sin orden | Solicitud de ajuste revisada por supervisión; no se crea una compra ficticia ni se pide un costo al operario |
| Salida interna | Descuenta el lote físico confirmado y usa el PMP vigente en la transacción central |
| Merma o daño | Retiro revisado por supervisión; permite gestionar lotes vencidos sin usarlos en una salida normal |
| Traslado | Salida y entrada atómicas, conservando el lote y su vencimiento |
| Conteo | Observación revisada antes de aplicar diferencias. Revalida la versión del lote contado, o del stock para productos sin lote; si cambió exige una nueva captura |

Las salidas del móvil representan consumo, entrega interna o merma. Un despacho comercial sigue registrándose desde su documento de venta. El inventario móvil no emite documentos tributarios.

Los reintentos conservan un UUID persistente. El servidor bloquea la intención, comprueba su contenido y autor, y confirma resultado y movimiento en una misma transacción. Una respuesta perdida no vuelve a mover stock. Los errores inesperados conservan el pendiente para reintentar; los conflictos de negocio quedan visibles y no fuerzan stock negativo.

La sincronización automática valida la sesión y refresca los productos afectados. **Actualizar** descarga el catálogo completo por páginas y lo publica localmente cuando todas terminaron. Un refresco interrumpido conserva el catálogo anterior y los identificadores pendientes de refrescar; no da por actualizadas existencias que todavía no descargó.

## Acceso y privacidad

- `products:read` permite consultar el catálogo del módulo de inventario.
- `inventory:operate` permite capturar y sincronizar. Está habilitado por defecto para OWNER, ADMIN y WAREHOUSE.
- `inventory:approve` permite revisar ajustes, conteos y mermas. Está habilitado por defecto para OWNER y ADMIN.
- Recibir una OC exige además `purchases:orders`; confirmar un costo de ajuste exige `products:costs`.
- Para un operario con acceso reducido, crear un rol personalizado con los permisos necesarios. El rol WAREHOUSE existente tiene otros permisos del ERP, incluidos costos; la aplicación móvil selecciona campos explícitos y no descarga precios ni PMP.
- La base y las colas se separan por empresa + usuario. Cada lote de sincronización declara el contexto esperado y el servidor lo compara con la sesión viva antes de aceptar nada. Todas las consultas usan la empresa de la sesión.
- La autorización local termina al vencer la cookie original, con un máximo de ocho horas. Atrasar el reloj no prolonga el acceso. Cerrar sesión en la web bloquea la copia local sin borrar pendientes.
- La app nativa guarda SQLite con SQLCipher y conserva su clave en SecureStore. Las cookies `httpOnly` viven en el almacén nativo del WebView/HTTP; no pasan a la base local ni a JavaScript. El login reutiliza Aether, incluido Turnstile y segundo factor.
- El service worker conserva únicamente el shell neutral de `/bodega`, recursos públicos de Next y archivos de OCR. No cachea endpoints autenticados ni páginas del panel.

La revocación remota se conoce al recuperar conexión. Sin comunicación, dos teléfonos no pueden conocer sus últimas retiradas mutuamente. La captura local conserva la intención; Aether comprueba el saldo real al confirmar. Si se necesita impedir también el exceso físico offline, se deben asignar cantidades/tareas exclusivas previamente; no se implementó una promesa de stock global instantáneo sin red.

## Compilar la aplicación nativa

```powershell
cd mobile/aether-warehouse
npm ci
npm run typecheck
npm run export:check
npm run android
```

El dominio predeterminado es `https://aetherp.online`, verificado contra el proyecto conectado. Para otro entorno, configurar `EXPO_PUBLIC_AETHER_URL` como origen HTTPS sin barra final antes del prebuild. El plugin escribe el origen permitido en Android/iOS: el transporte nativo no acepta un servidor arbitrario ni sigue redirecciones.

El OCR y SQLCipher requieren una compilación nativa; Expo Go no sirve para verificar estas funciones. Android requiere JDK y SDK compatibles con el Expo fijado en el lockfile. iOS requiere macOS/Xcode. La clave de firma para distribución y la publicación en tiendas se gestionan por separado; un APK de piloto con firma de desarrollo no es una publicación de producción.

`scripts/prepare-warehouse-android.mjs` descarga herramientas oficiales, verifica sus hashes y las mantiene dentro del laboratorio ignorado. `scripts/build-warehouse-android.mjs` genera un APK arm64 de piloto con esas herramientas, sin instalar software global.

## Validación reproducible

```powershell
npm run ci
npm run mobile:check
npm run test:warehouse
node --conditions=react-server --import tsx scripts/warehouse-lab.mjs --serve
node scripts/verify-warehouse-browser.cjs
```

El laboratorio crea un PostgreSQL efímero con PGlite, genera un esquema base sin `WarehouseOperation` y aplica la migración nueva allí. Usa únicamente datos sintéticos y sobreescribe la conexión de sus procesos con una dirección loopback; no modifica `.env`. Prueba deduplicación, selección física de lote, vencimiento en traslados, PMP, conflictos, aislamiento y recepción contra OC.

La prueba de navegador usa una sesión sintética del laboratorio, pantalla de 390 px y capturas en `.codex-audit/warehouse/`. Comprueba autenticación, origen, registro, preparación offline, recarga sin conexión, persistencia de pendientes y reenvío. Los artefactos y sesiones del laboratorio están ignorados por Git. Para comprobar el shell de producción se debe ejecutar la prueba contra `next start`, con la misma base aislada y una sesión de prueba válida.

La calidad de reconocimiento, enfoque, reflejos y formatos de etiquetas debe validarse además en los teléfonos reales con etiquetas representativas. El operador confirma los datos; el OCR no sustituye esa revisión.

## Migración y activación

La migración `20261021130000_warehouse_mobile` agrega solamente `WarehouseOperation`, su restricción de estados e índices. No modifica saldos ni documentos existentes. El respaldo por DMMF incluye el modelo automáticamente y el borrado por empresa está cubierto por la relación en cascada, verificada por el test de cobertura.

No aplicar migraciones a la conexión local habitual para probar: apunta a producción. La activación requiere revisar el conjunto del despliegue, aplicar la migración aditiva y desplegar el código inmediatamente, según AGENTS.md. El espacio de trabajo contiene también cambios de otros módulos; deben conservarse y coordinarse antes de publicar una versión conjunta.

Neon rechazó crear una rama de pruebas por su límite de ramas. No se eliminó ninguna rama ni se cambió producción; por ese motivo la comprobación de migración se realiza con PostgreSQL aislado local.
