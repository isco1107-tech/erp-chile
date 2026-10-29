import type { ManualSection } from '../types';

/** Vender: mostrador, documentos tributarios, pedidos, precios, comisiones y la ficha de clientes. */
export const VENTAS_SECTIONS: ManualSection[] = [
  {
    id: 'punto-de-venta',
    key: 'hasPos',
    permission: 'pos:operate',
    chapter: 'Ventas',
    title: 'Punto de Venta (POS)',
    summary:
      'Mostrador con varias cajas simultáneas: cada cajero entra con su cuenta, declara el fondo inicial, registra ventas y movimientos y cierra su turno con arqueo. El supervisor consulta las cajas y sus comprobantes.',
    route: '/dashboard/pos',
    topics: [
      {
        id: 'instalar-app-pos',
        title: 'Instalar el POS en el computador',
        steps: [
          'Abre /pos en el navegador o Punto de Venta dentro del ERP y presiona "Descargar app POS".',
          'Descarga el instalador para Windows, Mac o Linux, instálalo y fija Aether POS en el escritorio, Inicio o Dock.',
          'Abre Aether POS e ingresa con tu cuenta personal. Entrarás directamente al mostrador. La aplicación necesita internet para confirmar ventas, stock y movimientos de caja.',
        ],
        tip: 'Si una operación queda pendiente por un corte de conexión, mantén abierta la app y reintenta la misma operación. No cambies de cajero hasta recuperar el resultado.',
      },
      {
        id: 'abrir-caja',
        title: 'Abrir la caja al empezar el turno',
        steps: [
          'Ingresa con tu propio usuario y contraseña y entra a Punto de Venta. Verifica tu nombre y correo en "Cajero identificado". Si no tienes un turno abierto verás "Abrir caja".',
          'Elige una caja disponible: las ocupadas muestran al cajero y no se pueden seleccionar. "Actualizar cajas" consulta su estado. Cada persona y cada caja pueden tener un solo turno abierto.',
          'Cuenta el efectivo inicial, escribe el monto (también si es cero) y presiona "Abrir caja y comenzar a vender". Un administrador puede agregar cajas con "+ Nueva caja" → "Crear caja", indicando la bodega desde la que descuentan stock.',
        ],
      },
      {
        id: 'vender-pos',
        title: 'Registrar una venta',
        steps: [
          'En la pestaña "Vender", escanea el código de barras o escribe el SKU o nombre y presiona Enter: el producto entra al carrito. Para varias unidades escribe la cantidad, un asterisco y escanea (por ejemplo 3* y después el código).',
          'Al escanear el PRIMER producto de la venta, lo primero que pide el sistema es el RUT del cliente ("¿Boleta con RUT?"): escríbelo y presiona Enter. Sin RUT, presiona Enter sin escribir (o Esc, o el botón "Consumidor final") y la boleta sale a consumidor final. Si el cliente ya existe en tu empresa, verás su nombre junto al RUT. Mientras se pide el RUT puedes seguir escaneando productos. "Cambiar" (F4) corrige el RUT más tarde.',
          'Ajusta cantidades con los botones − y +, o escribe la cantidad en la propia línea; quita una línea con el ícono de basurero. Si te equivocas con toda la venta, "Cancelar venta" la vacía.',
          'Presiona "Cobrar" (o F9, o Enter con el buscador vacío). Elige el medio de pago con los botones o con las teclas E (Efectivo), D (Débito), C (Crédito) o T (Transferencia). En efectivo escribe lo que entrega el cliente, o usa "Exacto" (tecla X) o los montos sugeridos: el sistema muestra al instante el vuelto o lo que falta.',
          'Presiona el "Cobrar" del diálogo (o Enter): se emite la boleta, se abre el cajón si lo configuraste y el "Vuelto" queda a la vista, en grande, hasta la próxima venta. "Imprimir boleta" la imprime en formato de ticket y "Nueva venta" despeja el aviso (también desaparece al escanear el siguiente producto). Más tarde "Reimprimir boleta" la vuelve a imprimir.',
        ],
        tip: 'Con tarjeta o transferencia, cobra primero en el terminal de pagos y confirma aquí cuando salga aprobado: el sistema no se conecta al terminal. El catálogo se actualiza al volver a la pantalla y periódicamente; "Actualizar catálogo" permite consultarlo a mano y el servidor vuelve a validar precios y stock al cobrar. Si se corta la conexión al cobrar, conserva el carrito y reintenta la misma venta sin editarlo: no se duplica. No cierres la app hasta confirmar el resultado.',
      },
      {
        id: 'espera-pos',
        title: 'Dejar una venta en espera',
        steps: [
          'Con una venta en curso, presiona "Poner en espera" (F6): el carrito queda guardado y la pantalla se despeja para atender al siguiente cliente.',
          'Para volver, presiona "En espera" (F7) y "Retomar" en la venta que corresponde. Si tienes otra venta a medias, pasa a espera en su lugar. "Descartar" borra una venta en espera.',
          'Puedes dejar hasta 5 ventas en espera. Quedan guardadas solo en este equipo y no reservan stock hasta que se cobran; al retomarlas se actualizan los precios.',
        ],
      },
      {
        id: 'cajon-impresora',
        title: 'Conectar el cajón de dinero y la impresora',
        steps: [
          'Presiona "Cajón e impresora" en la barra de acciones del mostrador. La configuración vale solo para este equipo: cada caja tiene la suya.',
          'En "¿Cómo está conectado?" elige "Impresora del sistema" si tu impresora está instalada en Windows o Mac: el cajón se abre cuando la impresora imprime la boleta, siempre que en el controlador de la impresora esté activada la opción de abrir el cajón. Activa "Imprimir la boleta al cobrar".',
          'Elige "Directo por puerto serie / USB-COM" o "Directo por USB" para que el POS mande la boleta y el pulso del cajón sin ventana de impresión. Presiona "Conectar", elige el dispositivo y usa "Probar el cajón" e "Imprimir hoja de prueba" para comprobarlo antes de vender. Si las tildes salen mal, cambia la "Tabla de caracteres".',
          'Con "Abrir el cajón al cobrar en efectivo" el cajón se abre apenas queda emitida la boleta; con "Abrir el cajón en ingresos y retiros" también lo hace al registrar un movimiento de efectivo.',
        ],
        tip: 'Esto no se puede verificar sin el equipo conectado: prueba siempre con el cajón y la impresora reales antes de la primera venta. La conexión directa necesita Chrome o Edge. Si el cajón no responde, la venta igual queda cobrada y emitida: el POS solo avisa y puedes reintentar con "Abrir cajón".',
      },
      {
        id: 'abrir-cajon-sin-venta',
        title: 'Abrir el cajón sin una venta',
        steps: [
          'Presiona "Abrir cajón" (F8), elige el motivo ("Dar cambio", "Error de cobro", "Ingreso o retiro de efectivo" u "Otro motivo", que debes explicar) y confirma con "Abrir cajón".',
          'Cada apertura queda registrada con tu nombre, la caja y el motivo, y un supervisor puede revisarla en la bitácora de auditoría.',
        ],
      },
      {
        id: 'movimientos-caja',
        title: 'Registrar un ingreso o retiro de efectivo',
        steps: [
          'Ve a la pestaña "Caja y arqueo" → "Movimiento de efectivo".',
          'Elige "Ingreso" o "Retiro", escribe el monto y el motivo (ej. "retiro a bóveda", "compra de insumos") y presiona "Registrar". El movimiento aparece en la "Bitácora de efectivo" y modifica el esperado de este turno.',
          'Registra solamente dinero que entra o sale físicamente del cajón. No ingreses otra vez el dinero de una venta ya cobrada. Si falla la conexión, reintenta con los mismos datos sin modificarlos.',
        ],
      },
      {
        id: 'cerrar-caja',
        title: 'Cerrar la caja (arqueo)',
        steps: [
          'En "Caja y arqueo" presiona "Actualizar arqueo" y revisa el resumen del turno y el efectivo esperado en el cajón. Cada cajero puede cerrar su propio turno.',
          'Cuenta el dinero real y escríbelo en "Efectivo contado en el cajón". Si hay diferencia, explícala en las observaciones.',
          'Presiona "Cerrar caja" y confirma. Si hay un sobrante o faltante, explica la diferencia en las observaciones antes de confirmar. Débito, crédito y transferencias se concilian con el banco.',
        ],
        tip: 'Cierra siempre el turno el mismo día, aunque haya diferencia: dejarlo abierto descuadra también el turno siguiente.',
      },
      {
        id: 'historial-multicaja',
        title: 'Consultar turnos y comprobantes',
        steps: [
          'Abre "Mis turnos"; si tienes permiso de supervisión se llama "Turnos y multicaja". También se muestra debajo de "Abrir caja".',
          'Filtra "Todos", "Abiertos" o "Cerrados" y presiona "Ver turno". Revisa sus ventas y movimientos. En un turno cerrado verás "Comprobante de cierre" y podrás usar "Imprimir comprobante de cierre".',
          'Cada cajero ve sus propios turnos. El supervisor con permiso de cierre ve todos los turnos de la empresa y puede cerrar un turno ajeno contando el efectivo y declarando sus observaciones; los ingresos y retiros siguen a cargo del cajero de ese turno.',
        ],
        tip: 'Las cajas del mismo local trabajan en paralelo. El stock se valida en el ERP al confirmar cada venta para evitar vender dos veces las últimas unidades.',
      },
      {
        id: 'anular-venta-pos',
        title: 'Anular una boleta hecha por error',
        permission: 'sales:cancel',
        steps: [
          'Mientras el turno sigue abierto, anula la boleta desde Ventas & Facturación (botón "Anular" en el listado). La anulación ya se descuenta del efectivo esperado: no registres además un retiro.',
          'Si el turno ya se cerró, no se puede anular: emite una Nota de Crédito que haga referencia a esa boleta, para que la devolución quede en el turno actual.',
        ],
      },
    ],
  },
  {
    id: 'ventas-facturacion',
    key: 'hasDteBilling',
    permission: 'sales:read',
    chapter: 'Ventas',
    title: 'Ventas y facturación',
    summary:
      'Emisión de facturas, boletas, guías de despacho, notas de crédito y débito, y cotizaciones. Al emitir, el sistema asigna el folio, calcula el IVA, descuenta el stock y, si es a crédito, crea la cuenta por cobrar.',
    route: '/dashboard/sales',
    topics: [
      {
        id: 'emitir-documento',
        title: 'Emitir una factura o boleta',
        permission: 'sales:write',
        route: '/dashboard/sales/new',
        steps: [
          'Ve a Ventas → Ventas & Facturación y haz clic en "Nueva Venta".',
          'Elige el "Tipo de Documento" (Factura Electrónica, Boleta Electrónica, Guía de Despacho, etc.) y la bodega de salida.',
          'Busca el cliente por RUT o razón social. Si no existe, créalo ahí mismo con el botón de cliente rápido, sin salir del formulario.',
          'Agrega productos escaneando el código o buscando por SKU o nombre. Para un servicio sin ficha usa "+ Agregar línea libre". Puedes aplicar un % de descuento por línea.',
          'Elige la forma de pago (Efectivo, Transferencia, Tarjeta de Débito o Crédito, o Crédito 30 días). Es obligatoria: si el cliente tiene días de crédito pactados, se propone "Crédito 30 días".',
          'Revisa el resumen (neto, exento, IVA 19% y total) y presiona "Emitir Documento". Antes de emitir verás el tipo, el cliente, el total y si quedará pagada o pendiente; presiona "Sí, emitir" o "Revisar". Si aún no está listo, usa "Guardar Borrador".',
        ],
        tip: 'El IVA y la exención salen de la ficha de cada producto, no del formulario: si un producto debería ser exento, corrígelo en el Catálogo.',
      },
      {
        id: 'borradores',
        title: 'Borradores: guardar ahora, emitir después',
        steps: [
          'Un borrador no tiene folio, no descuenta stock y no cuenta para el F29.',
          'En el listado presiona "Continuar y emitir" (también está en el detalle del borrador): se abre con todo lo que guardaste. Complétalo y emítelo, o presiona "Guardar cambios del borrador" para seguir después; el borrador se reemplaza, no se duplica.',
          'Antes de cerrar el mes revisa que no queden borradores que en realidad debían emitirse.',
        ],
      },
      {
        id: 'cotizacion',
        title: 'Cotizar antes de vender',
        permission: 'sales:write',
        steps: [
          'En "Nueva Venta" elige el tipo "Cotización". No usa folio del SII ni mueve stock.',
          'Imprímela o descárgala desde "Ver / Imprimir" para enviársela al cliente. La pestaña "Cotizaciones" del listado las reúne.',
          'Cuando el cliente acepta, abre la cotización y usa "Convertir en nota de venta": el pedido queda con las mismas líneas y desde ahí emites la factura o boleta.',
          'Si prefieres facturar directo, usa "Duplicar" en el listado y cambia el tipo de documento del borrador que se crea.',
        ],
      },
      {
        id: 'venta-credito',
        title: 'Vender a crédito y controlar el límite',
        steps: [
          'Elige "Crédito 30 días" como forma de pago: el documento queda pendiente en Finanzas → Cuentas por Cobrar hasta que registres el pago.',
          'Si el cliente tiene límite de crédito, el formulario muestra el crédito disponible y bloquea la venta si la deuda más el documento lo superan.',
          'Opcional: indica una fecha de vencimiento distinta en "Vencimiento".',
        ],
      },
      {
        id: 'anular-documento',
        title: 'Anular un documento emitido',
        permission: 'sales:cancel',
        steps: [
          'En el listado de Ventas & Facturación, usa "Anular" en el documento. Se repone el stock, se revierten sus pagos y el documento queda como anulado (nunca se borra).',
          'No se puede anular una boleta de un turno de caja ya cerrado ni un documento ya enviado al SII: en esos casos emite una Nota de Crédito.',
          'Para la Nota de Crédito usa "Nota de crédito" en el listado o "Emitir nota de crédito" en el detalle del documento: se cargan el cliente, el folio de referencia y todas las líneas. Para una devolución parcial baja las cantidades o quita líneas antes de emitir.',
        ],
      },
      {
        id: 'nota-credito',
        title: 'Corregir con una Nota de Crédito o de Débito',
        permission: 'sales:write',
        route: '/dashboard/sales/new',
        steps: [
          'En "Nueva Venta" elige "Nota de Crédito Electrónica" (para rebajar o anular) o "Nota de Débito Electrónica" (para aumentar el monto).',
          'Completa "Folio de referencia" y "Tipo de documento referenciado" con los datos del documento original.',
          'Agrega las líneas a devolver o corregir y emite.',
        ],
        tip: 'Nunca vuelvas a emitir una factura completa para "arreglar" otra: el libro de ventas quedaría duplicado.',
      },
      {
        id: 'ver-imprimir',
        title: 'Ver, imprimir y enviar un documento',
        steps: [
          'Usa "Ver / Imprimir" en el listado para abrir el documento con el formato tributario, listo para imprimir o guardar como PDF.',
          'Desde el detalle registras los pagos del documento y ves si viene de una nota de venta.',
          'Las pestañas del listado separan facturas/boletas de cotizaciones; el buscador filtra por RUT o razón social.',
        ],
      },
    ],
  },
  {
    id: 'notas-de-venta',
    key: 'hasDteBilling',
    permission: 'sales:read',
    chapter: 'Ventas',
    title: 'Notas de venta (pedidos de clientes)',
    summary:
      'El pedido del cliente antes de facturar. Reserva el stock mientras está abierto y permite facturar o despachar por partes, sabiendo siempre cuánto falta.',
    route: '/dashboard/sales/orders',
    topics: [
      {
        id: 'crear-nota-venta',
        title: 'Registrar un pedido',
        permission: 'sales:write',
        steps: [
          'Ve a Ventas → Notas de venta y haz clic en "Nueva nota de venta" (o "Convertir en nota de venta" desde una cotización).',
          'Elige el cliente, la bodega de despacho, la forma de pago, la fecha de entrega y el vendedor.',
          'Agrega los productos con cantidad, precio neto y descuento, y escribe en "Observaciones" la dirección o condiciones de entrega.',
          'Guarda: el stock queda reservado para este pedido.',
        ],
      },
      {
        id: 'facturar-nota-venta',
        title: 'Facturar o despachar por partes',
        permission: 'sales:write',
        steps: [
          'Abre la nota y usa "Facturar", "Boleta" o "Guía de despacho": el formulario se precarga con lo pendiente.',
          'Deja solo las cantidades que entregas ahora. La nota muestra por producto lo pedido, despachado y facturado.',
          'Cuando todo está facturado la nota se concluye sola. Si el cliente desiste de lo pendiente, usa "Cerrar saldo" (o "Anular nota" si aún no se facturó nada) e indica el motivo.',
        ],
      },
      {
        id: 'seguimiento-notas',
        title: 'Seguir los pedidos pendientes',
        steps: [
          'Las pestañas Abiertas, Concluidas y Anuladas filtran el listado; los pedidos con fecha de entrega vencida aparecen como "atrasada".',
          'Busca por número de nota, cliente o RUT.',
        ],
      },
    ],
  },
  {
    id: 'listas-de-precios',
    key: 'hasDteBilling',
    permission: 'sales:read',
    chapter: 'Ventas',
    title: 'Listas de precios',
    summary: 'Precios distintos por tipo de cliente (mayoristas, distribuidores, VIP) y por volumen. Se asignan a cada cliente y se proponen solos al venderle.',
    route: '/dashboard/sales/price-lists',
    topics: [
      {
        id: 'crear-lista',
        title: 'Crear una lista de precios',
        permission: 'sales:write',
        steps: [
          'Ve a Ventas → Listas de precios y crea una lista con su nombre (ej. "Mayoristas") y una descripción.',
          'Ábrela y usa "Ajuste sobre el precio base (%)" para calcular todos los precios de una vez: un número negativo es descuento (−12 deja cada precio 12% bajo el catálogo).',
          'Ajusta a mano el precio de los productos que quieras y agrega tramos "Por volumen" (cantidad mínima y precio).',
          'Marca la lista como activa y guarda.',
        ],
      },
      {
        id: 'asignar-lista',
        title: 'Asignar la lista a un cliente',
        steps: [
          'Edita el cliente en Clientes & Proveedores y elige su "Lista de precios".',
          'Desde ese momento, al venderle, cada producto se propone con el precio de su lista (puedes modificarlo en la línea).',
        ],
      },
    ],
  },
  {
    id: 'comisiones',
    key: 'hasDteBilling',
    permission: 'reports:read',
    chapter: 'Ventas',
    title: 'Comisiones de vendedores',
    summary: 'Calcula cuánto le corresponde a cada vendedor según su venta neta del mes (sin IVA) y su tasa. Las notas de crédito restan.',
    route: '/dashboard/sales/commissions',
    topics: [
      {
        id: 'tasas-comision',
        title: 'Definir la tasa de cada vendedor',
        steps: [
          'Ve a Ventas → Comisiones y, en "Tasas de comisión", escribe el porcentaje de cada vendedor.',
          'Elige la base: "Sobre lo facturado" (comisiona al emitir) o "Sobre lo cobrado" (comisiona recién cuando el cliente paga).',
          'Guarda la fila de cada vendedor.',
        ],
      },
      {
        id: 'revisar-comisiones',
        title: 'Revisar las comisiones del mes',
        steps: [
          'Usa las flechas para cambiar de mes. El detalle por vendedor muestra base, documentos, venta neta, tasa y comisión.',
          'Para que una venta cuente, debe tener vendedor: el campo "Vendedor" del formulario de venta (si no se elige, queda a nombre de quien emite).',
          '"Venta sin vendedor" muestra lo emitido antes de registrar vendedores.',
        ],
      },
    ],
  },
  {
    id: 'clientes-proveedores',
    key: 'always',
    permission: 'contacts:read',
    chapter: 'Ventas',
    title: 'Clientes y proveedores',
    summary: 'La ficha única de cada cliente y proveedor: RUT, giro, contacto, condiciones de crédito, lista de precios y su portal de autoatención. Todo el resto del sistema se apoya en estas fichas.',
    route: '/dashboard/contacts',
    topics: [
      {
        id: 'crear-contacto',
        title: 'Registrar un cliente o proveedor',
        permission: 'contacts:write',
        steps: [
          'Ve a Ventas → Clientes & Proveedores y haz clic en "Nuevo contacto".',
          'Ingresa el RUT: el sistema valida el dígito verificador. Con "Buscar empresa con IA" puedes completar los datos de una empresa a partir de su nombre o RUT (revísalos antes de guardar).',
          'Completa razón social, giro, dirección, correo y teléfono, y marca si es Cliente, Proveedor o ambos.',
          'Opcional: límite y días de crédito, lista de precios y datos bancarios (necesarios para pagarle con nómina).',
          'Guarda: ya puedes usarlo en ventas, compras, planes de pago y más.',
        ],
        tip: 'También puedes crear el contacto desde el mismo formulario de venta o compra, o pedírselo al Asistente: "crea el cliente Comercial Sur, RUT 76.123.456-7".',
      },
      {
        id: 'buscar-contacto',
        title: 'Buscar y revisar un contacto',
        steps: [
          'Busca por RUT o razón social en el listado y abre la ficha.',
          'La ficha muestra sus datos de contacto y condiciones de crédito, su portal y, según tus módulos, sus auspicios, boletas de honorarios, pagarés, planes de pago y compras, con botón de WhatsApp para escribirle.',
        ],
      },
      {
        id: 'limite-credito',
        title: 'Cómo funciona el límite de crédito',
        steps: [
          'Con un límite definido, el sistema bloquea una venta a crédito si la deuda vigente más el nuevo documento lo superan.',
          'Los días de crédito sugieren el vencimiento al vender; no bloquean por sí solos.',
        ],
      },
      {
        id: 'portal-cliente',
        title: 'Darle al cliente su portal de autoatención',
        steps: [
          'En la ficha del cliente, sección "Portal del cliente", genera el enlace.',
          'Cópialo o envíalo por WhatsApp: sin contraseña, el cliente ve su saldo, descarga sus documentos y revisa sus pagos y órdenes de servicio.',
          'El enlace se muestra una sola vez. Puedes desactivarlo o generar uno nuevo (el anterior deja de funcionar).',
        ],
      },
      {
        id: 'portal-proveedor',
        title: 'Darle al proveedor su portal de inventario',
        permission: 'settings:company',
        steps: [
          'En la ficha del proveedor (un contacto marcado como proveedor), sección "Portal del proveedor", presiona "Generar código".',
          'Se muestra su código de 16 letras y números (por ejemplo K7QM-4TXD-9HWB-2ZNC), que se ve una sola vez. Cópialo con "Copiar código" o envíalo con "WhatsApp".',
          'El proveedor lo escribe en la dirección /proveedor de tu sitio (o abre el enlace directo) y ve cuánto le queda en bodega de SUS productos: existencias por bodega, si están bajo el mínimo, su última llegada y, si lo permites, lo que salió en los últimos 30 días. Puede descargarlo a Excel. Nunca ve costos ni precios.',
          'Sus productos se agregan solos cuando el bodeguero registra una llegada de ese proveedor en la app. En la misma tarjeta puedes buscar un producto para agregarlo o quitar uno.',
          'Si no quieres que vea lo que sale, desmarca "Mostrar también lo que sale (ventas y bajas de los últimos 30 días) y los días que alcanza el stock".',
          '"Generar código nuevo" invalida el anterior al instante; "Desactivar" corta el acceso.',
        ],
        tip: 'Es información de tu empresa que ve un tercero: dalo solo a proveedores de confianza y desactívalo cuando termine la relación.',
      },
    ],
  },
  {
    id: 'fidelizacion',
    key: 'hasCustomerCare',
    permission: 'customercare:read',
    chapter: 'Ventas',
    title: 'Fidelización y clientes',
    summary: 'Cómo te encuentran los clientes, qué tan satisfechos quedan (encuestas CSAT y NPS por enlace) y a quién volver a contactar porque dejó de comprar.',
    route: '/dashboard/customer-care',
    topics: [
      {
        id: 'resumen-indicadores',
        title: 'Ver los indicadores y registrar cómo te encontró cada cliente',
        steps: [
          'Entra a la pestaña Resumen.',
          'Revisa NPS, Satisfacción, Tasa de respuesta y Clientes inactivos. El NPS muestra "—" mientras nadie responda: no se inventan cifras.',
          'En "Cómo nos encontraron" ves de qué canal llegan tus clientes.',
          'Pregunta "¿cómo nos encontraste?" a cada cliente nuevo y anótalo en "Clientes sin canal registrado": elige el canal y haz clic en Guardar.',
        ],
      },
      {
        id: 'seguimientos-inactivos',
        title: 'Volver a contactar a clientes que dejaron de comprar',
        steps: [
          'Ve a la pestaña Seguimientos.',
          'Haz clic en "Crear seguimientos de inactivos": crea uno por cada cliente que lleva los días definidos sin comprar. Si ya tiene uno abierto, no lo duplica.',
          'En la lista de clientes inactivos usa el botón WhatsApp: abre la conversación con el mensaje ya escrito.',
          'En "Seguimientos abiertos" anota "¿Qué pasó?" y marca Listo, o Descartar si ya no corresponde.',
        ],
      },
      {
        id: 'encuestas-enviar',
        title: 'Medir la satisfacción con una encuesta por enlace',
        steps: [
          'Ve a la pestaña Encuestas, elige un cliente y haz clic en "Crear enlace de encuesta". El enlace queda copiado: pégalo en WhatsApp o en un correo.',
          'El cliente responde 3 preguntas (satisfacción, recomendación y si llegó a tiempo) sin necesitar cuenta.',
          'Si la nota es mala (satisfacción 1 o 2, o recomendación de 0 a 6) se abre un seguimiento y se avisa en la campanita.',
          'Usa "Copiar enlace" para volver a compartir una encuesta que aún no fue contestada. Cada enlace se puede responder una sola vez.',
        ],
      },
      {
        id: 'ajustes-configurar',
        title: 'Ajustar los días de inactividad y los mensajes',
        permission: 'customercare:write',
        steps: [
          'Ve a la pestaña Ajustes.',
          'Define cuántos días sin comprar hacen inactivo a un cliente (por defecto 60) y el plazo estándar de entrega.',
          'Edita el texto de invitación a la encuesta y el mensaje de seguimiento; puedes usar {{cliente}} y {{empresa}}.',
        ],
      },
    ],
  },
];
