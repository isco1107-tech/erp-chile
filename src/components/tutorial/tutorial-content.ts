/**
 * Contenido de los tutoriales guiados por pantalla. La clave de cada entrada
 * es la que devuelve `getModuleKeyForPath` (`tutorial-routes.ts`).
 *
 * Agregar una pantalla nueva es solo agregar una entrada acá + su ruta en
 * `tutorial-routes.ts` — `ModuleTutorial` y `HowToUseButton` no necesitan
 * tocarse. `tests/manual-coverage.test.ts` exige que cada pantalla del menú
 * tenga su tutorial.
 *
 * Cada tour es corto (3 a 5 pasos): orienta y dice dónde está lo importante.
 * El detalle paso a paso vive en el Manual de Usuario, al que el último paso
 * del tour enlaza solo.
 */
export interface TutorialStep {
  title: string;
  description: string;
  /**
   * `data-tutorial` del elemento real a resaltar en pantalla (ver
   * `ModuleTutorial.tsx`). Un paso sin `target` (o cuyo elemento no está
   * montado — ej. queda oculto por un permiso) se muestra como tarjeta
   * centrada, sin recorte de foco.
   */
  target?: string;
  /** Lado preferido del globo respecto al elemento; se auto-ajusta si no cabe. Por defecto 'bottom'. */
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export interface TutorialModuleContent {
  /** Nombre de la pantalla mostrado en el encabezado del tutorial. */
  title: string;
  steps: TutorialStep[];
}

const header = (title: string, description: string): TutorialStep => ({ title, description, target: 'module-header' });
const primary = (title: string, description: string): TutorialStep => ({ title, description, target: 'module-primary-action' });
const search = (title: string, description: string): TutorialStep => ({ title, description, target: 'module-search' });
const note = (title: string, description: string): TutorialStep => ({ title, description });

export const TUTORIAL_CONTENT: Record<string, TutorialModuleContent> = {
  dashboard: {
    title: 'Bienvenida',
    steps: [
      header('Tu resumen del negocio', 'Al entrar ves ventas, compras, IVA y stock crítico, con la tendencia respecto al período anterior, y accesos rápidos a lo que más se usa.'),
      { title: 'El menú de tu empresa', description: 'A la izquierda están solo los módulos que tu empresa contrató y que tu rol puede usar, agrupados por área.', target: 'sidebar-nav', placement: 'right' },
      { title: 'Busca cualquier pantalla', description: 'Con Ctrl+K (Cmd+K en Mac) o este buscador saltas a cualquier pantalla escribiendo lo que necesitas: "factura", "cobranza", "stock"…', target: 'command-search' },
      { title: 'Tu asistente', description: 'Pregúntale con tus palabras cómo hacer algo, pídele cifras de tu empresa o que haga tareas por ti (crear un cliente, un producto, una tarea…). Siempre te pide confirmar antes de guardar.', target: 'assistant-button' },
      note('Tu manual', 'En Ayuda → Manual de Usuario tienes los pasos de cada módulo de tu empresa, con capturas, y puedes descargarlo en Word para imprimirlo.'),
    ],
  },
  pos: {
    title: 'Punto de Venta',
    steps: [
      header('Abre tu turno', 'Antes de vender elige la caja y declara el efectivo inicial. Las ventas descuentan stock de la bodega asociada a esa caja.'),
      note('Arma la venta', 'En "Vender" escanea el código de barras o escribe el SKU o nombre y presiona Enter. Ajusta cantidades con − y +.'),
      note('Cobra y emite la boleta', 'Elige el medio de pago (en efectivo el sistema calcula el vuelto) y presiona "Cobrar". La boleta queda lista para el ticket de 80 mm.'),
      note('Cierra la caja', 'Al terminar, en "Caja y arqueo" cuenta el efectivo, escríbelo y presiona "Cerrar caja". La diferencia queda registrada.'),
    ],
  },
  products: {
    title: 'Catálogo de Productos',
    steps: [
      header('Tu catálogo', 'Cada producto o servicio con su SKU, precio neto, código de barras, categoría y si es exento de IVA.'),
      primary('Botón "Nuevo producto"', 'Abre el formulario para crear un producto. Para cargar muchos de una vez usa Configuración → Importación Masiva.'),
      note('Exento de IVA, solo aquí', 'El sistema siempre calcula el IVA según este dato del catálogo, nunca según lo que se elija al vender.'),
      note('El stock no se escribe aquí', 'El stock entra con una compra, una importación o un ajuste en Inventario. El costo (PMP) se recalcula solo en cada compra.'),
      search('Busca por SKU o nombre', 'Encuentra cualquier producto sin recorrer toda la lista.'),
    ],
  },
  inventory: {
    title: 'Inventario',
    steps: [
      header('Existencias por bodega', 'Cada fila es un producto en una bodega con su cantidad, su costo PMP y su valor.'),
      search('Busca por SKU o nombre', 'Encuentra el stock de cualquier producto sin recorrer toda la lista.'),
      note('Kardex de un clic', 'Haz clic en una fila y abajo verás el Kardex: cada entrada, salida y ajuste con su costo y el documento que lo originó.'),
      note('Ajustes y transferencias', '"Ajuste de Stock / Entrada Directa" corrige diferencias (con su motivo) o mueve mercadería entre bodegas, sin perder trazabilidad.'),
    ],
  },
  'inventory-counts': {
    title: 'Toma de inventario',
    steps: [
      header('Cuenta y ajusta', 'Contar periódicamente detecta mermas, robos y errores antes de que lleguen al balance.'),
      note('Abre una toma', '"Nueva toma de inventario": elige la bodega y qué productos contar. Puedes seguir vendiendo mientras cuentas.'),
      note('Cuenta con lector o a mano', 'Escanea cada código (suma una unidad o las del empaque) o escribe lo contado. Guarda seguido.'),
      note('Contabiliza', 'Revisa "Con diferencia" y presiona "Contabilizar": el stock se ajusta a lo contado y queda su asiento.'),
    ],
  },
  'inventory-lots': {
    title: 'Lotes y vencimientos',
    steps: [
      header('Saldo por lote', 'Para productos con "Maneja lotes y vencimiento": cuánto queda de cada lote y cuándo vence.'),
      note('Filtra lo urgente', 'Usa Vencidos y Por vencer para decidir qué vender primero o dar de baja.'),
      note('FEFO automático', 'Las ventas consumen primero el lote que vence antes.'),
    ],
  },
  'inventory-labels': {
    title: 'Etiquetas',
    steps: [
      header('Etiquetas con código de barras', 'Para góndola o producto, en hoja A4 o en rollo de impresora de etiquetas.'),
      note('Agrega productos', 'Búscalos o pásales el lector, e indica cuántas copias de cada uno.'),
      note('Imprime a escala 100%', 'Elige el formato y presiona "Imprimir". En el diálogo usa escala 100% sin encabezados ni pies de página.'),
    ],
  },
  sales: {
    title: 'Ventas & Facturación',
    steps: [
      header('Tus documentos de venta', 'Facturas, boletas, guías, notas de crédito y débito, y cotizaciones, con folio y timbre si tu empresa cargó sus folios del SII.'),
      primary('Botón "Nueva Venta"', 'Desde aquí emites cualquier documento nuevo, o una cotización que no usa folio ni mueve stock.'),
      note('Anular, duplicar, imprimir', 'En cada fila: "Ver / Imprimir", "Duplicar" (crea un borrador igual) y "Anular" (repone stock y revierte pagos si aún no se envió al SII).'),
      note('Corregir sin borrar', 'Un documento emitido se corrige con una Nota de Crédito que lo referencia; nunca se borra.'),
      search('Busca por cliente', 'Filtra por RUT o razón social, y usa las pestañas para separar facturas de cotizaciones.'),
    ],
  },
  'sales-new': {
    title: 'Nueva venta',
    steps: [
      header('Emite un documento', 'Elige el tipo (factura, boleta, guía, nota o cotización) y la bodega de salida.'),
      note('Cliente', 'Búscalo por RUT o razón social. Si no existe, créalo ahí mismo con el botón de cliente rápido. Si tiene lista de precios, los precios se proponen solos.'),
      note('Productos y descuentos', 'Escanea o busca cada producto; para un servicio sin ficha usa "+ Agregar línea libre". El IVA sale de la ficha de cada producto.'),
      note('Forma de pago y emisión', 'Con "Crédito 30 días" queda en Cuentas por Cobrar. Presiona "Emitir Documento" o guarda un borrador para después.'),
    ],
  },
  'sales-orders': {
    title: 'Notas de venta',
    steps: [
      header('Pedidos de clientes', 'Una nota de venta reserva stock y se factura o despacha por partes.'),
      note('Crea el pedido', '"Nueva nota de venta" (o "Convertir en nota de venta" desde una cotización): cliente, bodega, fecha de entrega y productos.'),
      note('Factura o despacha lo que sale', 'Abre la nota y usa "Facturar", "Boleta" o "Guía de despacho" con lo que entregas ahora. La nota muestra lo pendiente.'),
      note('Atrasadas', 'Las notas con fecha de entrega vencida aparecen marcadas como "atrasada".'),
    ],
  },
  'price-lists': {
    title: 'Listas de precios',
    steps: [
      header('Precios por tipo de cliente', 'Mayoristas, distribuidores o VIP: cada lista con sus precios y tramos por volumen.'),
      note('Calcula en un paso', 'En la lista, "Ajuste sobre el precio base (%)" llena todos los precios (−12 = 12% bajo el catálogo). Luego ajusta a mano lo que quieras.'),
      note('Asígnala al cliente', 'En la ficha del cliente elige su lista: al venderle, los precios se proponen solos.'),
    ],
  },
  'sales-commissions': {
    title: 'Comisiones',
    steps: [
      header('Comisiones del mes', 'Venta neta (sin IVA) por vendedor y la comisión según su tasa. Las notas de crédito restan.'),
      note('Define las tasas', 'En "Tasas de comisión" escribe el % de cada vendedor y si comisiona sobre lo facturado o sobre lo cobrado.'),
      note('Cambia de mes', 'Usa las flechas para revisar meses anteriores.'),
    ],
  },
  contacts: {
    title: 'Clientes & Proveedores',
    steps: [
      header('Ficha única', 'Cada contacto con su RUT validado, datos, condiciones de crédito, lista de precios y datos bancarios.'),
      primary('Botón "Nuevo contacto"', 'Abre el formulario. "Buscar empresa con IA" te ayuda a completar los datos de una empresa a partir de su nombre o RUT.'),
      note('Portal del cliente', 'En la ficha puedes generar un enlace para que el cliente vea su saldo, descargue sus documentos y revise sus pagos.'),
      search('Busca por RUT o razón social', 'Antes de crear un contacto, búscalo: duplicarlo ensucia el historial.'),
    ],
  },
  'customer-care': {
    title: 'Fidelización',
    steps: [
      header('Clientes que vuelven', 'Cómo te encuentran, qué tan satisfechos quedan y a quién volver a contactar.'),
      note('Resumen', 'NPS, satisfacción y clientes inactivos, y el canal de origen de cada cliente ("¿cómo nos encontraste?").'),
      note('Encuestas por enlace', 'Crea un enlace por cliente y compártelo por WhatsApp: una mala nota abre un seguimiento automático.'),
      note('Seguimientos', '"Crear seguimientos de inactivos" arma la lista de clientes que dejaron de comprar, con WhatsApp listo para escribirles.'),
    ],
  },
  'invoice-archive': {
    title: 'Archivo de facturas',
    steps: [
      header('Todas tus facturas en un lugar', 'Cada factura de proveedor con su total y la foto o PDF, ordenadas por proveedor.'),
      note('Ingresa una factura', '"Ingresar factura": proveedor, total, fecha y la foto ("Tomar foto" desde el celular) o el PDF.'),
      note('Histórico por proveedor', 'Haz clic en un proveedor para ver todas sus facturas y el total comprado.'),
    ],
  },
  purchases: {
    title: 'Compras',
    steps: [
      header('Facturas de proveedores', 'Al registrar una compra con productos el stock sube, el PMP se recalcula y el saldo queda en Cuentas por Pagar.'),
      primary('Botón "Nueva Factura de Proveedor"', 'Registra la factura con sus productos (o líneas de gasto que no mueven stock).'),
      note('Aprobación', 'Si tu empresa fijó un umbral, las compras sobre él quedan "Pendiente de aprobación" hasta que alguien con permiso las apruebe.'),
      search('Busca cualquier compra', 'Filtra por proveedor (RUT o razón social).'),
    ],
  },
  'purchase-requests': {
    title: 'Solicitudes de compra',
    steps: [
      header('Pide lo que necesitas', 'Cualquier persona del equipo pide una compra; una jefatura la aprueba.'),
      note('Nueva solicitud', 'Qué se necesita, para cuándo y los ítems. Guárdala o "Enviar a aprobación".'),
      note('Cotiza y compara', 'En la solicitud agrega cotizaciones de varios proveedores: el comparativo marca el mejor precio por ítem.'),
      note('Genera las órdenes', 'Con la solicitud aprobada, "Generar OC" crea una orden de compra por proveedor adjudicado.'),
    ],
  },
  'purchase-orders': {
    title: 'Órdenes de Compra',
    steps: [
      header('Pedidos a proveedores', 'Lo que encargaste antes de que llegue la mercadería.'),
      note('Recibe por entregas', 'Abre la orden y usa "Registrar Recepción" con las cantidades que de verdad llegaron, en la bodega correcta.'),
      note('Factura lo recibido', '"Facturar" precarga la factura con lo recibido sin volver a mover stock.'),
    ],
  },
  'purchases-imports': {
    title: 'Importaciones',
    steps: [
      header('Costeo de importaciones', 'Una carpeta por embarque: FOB, tipo de cambio y costos hasta la bodega repartidos entre los productos.'),
      note('Productos y costos', 'Agrega productos con su FOB y cada costo (flete, seguro, agente, puerto) en pesos netos.'),
      note('Cierra e ingresa', '"Cerrar e ingresar a bodega" entra la mercadería a su costo real. El IVA de importación es crédito fiscal, no costo.'),
    ],
  },
  'purchases-inbox': {
    title: 'DTE recibidos',
    steps: [
      header('Facturas electrónicas de proveedores', 'Sube el XML que te llega al correo de intercambio: el sistema verifica el timbre de cada documento.'),
      note('Revisa los plazos', 'Filtra por "Por revisar", "Plazo por vencer" y "Plazo vencido": tienes 8 días para reclamar.'),
      note('Acepta, reclama o registra', 'En cada documento: "Aceptar", "Reclamar" (con motivo) o "Registrar en Compras" sin tipear las líneas.'),
    ],
  },
  manufacturing: {
    title: 'Producción',
    steps: [
      header('Órdenes de producción', 'Consumen insumos según la receta y dejan el producto terminado a su costo real.'),
      note('Nueva orden', 'Elige la receta, la cantidad, la fecha y la bodega. Si faltan insumos, la orden te avisa.'),
      note('Inicia y termina', '"Iniciar" y, al acabar, "Terminar producción" con el consumo real y la mano de obra.'),
    ],
  },
  'manufacturing-boms': {
    title: 'Recetas',
    steps: [
      header('Lista de materiales', 'Qué insumos y en qué cantidad lleva cada producto que fabricas.'),
      note('Nueva receta', 'Elige el producto terminado, cuánto produce y agrega sus insumos. Verás el costo de insumos por unidad.'),
      note('Activa', 'Solo las recetas activas se ofrecen al crear órdenes de producción.'),
    ],
  },
  'service-desk': {
    title: 'Servicio técnico',
    steps: [
      header('Tu taller', 'Equipos en taller, esperando aprobación, listos para retiro y atrasados, de un vistazo.'),
      note('Recibe un equipo', '"Recibir equipo": cliente, equipo, serie, accesorios y falla. Entrega el comprobante con el enlace de seguimiento.'),
      note('Presupuesto que el cliente aprueba', 'Diagnostica, arma el presupuesto y "Enviar presupuesto al cliente": lo aprueba desde su enlace.'),
      note('Entrega y cobro', 'Marca "Listo para retiro", genera la nota de venta del cobro, emite la boleta y "Entregar al cliente".'),
    ],
  },
  quality: {
    title: 'Calidad y procedimientos',
    steps: [
      header('Calidad sin papeles', 'Procedimientos con acuse de lectura, inspecciones por plantilla y ficha de productores.'),
      note('Procedimientos', 'Publica cómo se hacen las cosas; cada persona confirma con "Leí y entendí".'),
      note('Inspecciones', 'El resultado lo calcula el sistema con los rangos de la plantilla; si no aprueba, exige una acción correctiva.'),
      note('Productores', 'Revisa el % de lotes aprobados de cada proveedor.'),
    ],
  },
  academy: {
    title: 'Academia',
    steps: [
      header('Tu academia en un lugar', 'Calendario de clases, lista de asistencia, material para las alumnas y mensualidades.'),
      note('Calendario', 'Mira el mes o la semana con sus horas y programa clases (también repetidas cada semana) con "Programar clase".'),
      note('Pasar lista', 'Abre una clase del calendario y marca presente, atrasada, ausente o justificada. Las clases sin lista aparecen avisadas.'),
      note('Material', 'Sube documentos o presentaciones a una clase o a un grupo y envíalos al correo de las alumnas y sus apoderados.'),
      note('Alumnas e inscripciones', 'Crea la ficha de cada alumna y aprueba lo que llega por el link de inscripción.'),
      note('Mensualidad y sitio web', 'Marca cada mes como pagado y arma la página pública de tu academia.'),
    ],
  },
  tasks: {
    title: 'Tareas y delegación',
    steps: [
      header('Quién hace qué', 'Tareas con responsable, plazo y repetición.'),
      note('Rutinas que se repiten solas', 'Al marcar "Hecha" una tarea semanal o mensual, se crea la siguiente.'),
      note('Delegación', 'Escribe qué decisiones puede tomar cada persona y hasta qué monto; cualquiera puede consultarlo.'),
    ],
  },
  'web-sites': {
    title: 'Sitios web',
    steps: [
      header('Tu sitio sin código', 'Guiado por secciones con ejemplos, o con tu propio HTML.'),
      note('Nuevo sitio', 'Tres pasos: tipo de sitio, cómo armarlo y nombre. Te lo entregamos armado para ajustar.'),
      note('Qué le falta', 'Antes de publicar, la lista "Qué le falta" te dice lo obligatorio y lo recomendado.'),
      note('Publica y recibe mensajes', 'Publica en una dirección de la plataforma o en tu dominio; los mensajes del formulario llegan a la pestaña Mensajes.'),
    ],
  },
  treasury: {
    title: 'Tesorería',
    steps: [
      header('Lo que entra y sale', 'Resumen de caja y banco, y de lo que falta por cobrar y por pagar.'),
      note('Cuentas por Cobrar y por Pagar', 'Registra cobros y pagos (totales o abonos) desde cada documento pendiente.'),
      note('Herramientas del área', 'En Finanzas encuentras además Cobranza, Bancos y conciliación, Cheques y Nóminas de pago.'),
    ],
  },
  'treasury-cxc': {
    title: 'Cuentas por Cobrar',
    steps: [
      header('Lo que te deben', 'Total por cobrar, lo vencido y lo cobrado este mes, con la antigüedad de la cartera.'),
      note('Registra el cobro', '"Registrar pago" en el documento: monto (puede ser parcial), medio, fecha y la cuenta bancaria donde entró.'),
      note('Recuérdale al cliente', '"Recordar por email" le envía el detalle del documento; los recordatorios automáticos se activan en Cobranza.'),
    ],
  },
  'treasury-cxp': {
    title: 'Cuentas por Pagar',
    steps: [
      header('Lo que debes', 'Total por pagar, lo que vence en 7 días y lo ya vencido.'),
      note('Registra el pago', '"Registrar pago" en cada factura, total o parcial.'),
      note('Muchas facturas a la vez', 'Para pagar varias por transferencia, arma una Nómina de pago.'),
    ],
  },
  'treasury-cashflow': {
    title: 'Flujo de Caja',
    steps: [
      header('Ingresos y egresos reales', 'Lo que entró y salió en el período, consolidado por medio de pago.'),
      note('Elige el período', 'Usa los botones rápidos y descarga los movimientos con "Exportar CSV".'),
      note('¿Y hacia adelante?', 'Para proyectar la caja de las próximas semanas usa Caja a 13 semanas (Inteligencia de Negocio), si tu plan la incluye.'),
    ],
  },
  'treasury-collections': {
    title: 'Cobranza',
    steps: [
      header('Antigüedad de la deuda', 'Cada cliente con su saldo, lo vencido, su última gestión y su promesa de pago.'),
      note('Gestiona', '"Gestionar": registra la llamada o correo, la promesa de pago y el monto comprometido.'),
      note('Recordatorios automáticos', 'Actívalos y elige los días: cada mañana se envían solos, una vez por documento y aviso.'),
    ],
  },
  'treasury-banks': {
    title: 'Bancos y conciliación',
    steps: [
      header('Tus cuentas bancarias', 'Saldo según el banco y según tus registros, cuenta por cuenta.'),
      note('Agrega la cuenta', '"Agregar cuenta" con su saldo inicial y la fecha desde la que concilias.'),
      note('Concilia la cartola', '"Conciliar": sube la cartola, usa "Conciliar automáticamente" y resuelve lo pendiente.'),
    ],
  },
  'treasury-cheques': {
    title: 'Cheques',
    steps: [
      header('Cartera de cheques', 'Recibidos (también a fecha) y girados a proveedores.'),
      note('Registra', '"Registrar cheque" con su número, banco, monto, fecha de cobro y el documento que paga.'),
      note('Muévelo', 'Depositar, Cobrado, Protestar o Anular: el documento asociado se actualiza solo.'),
    ],
  },
  'treasury-payment-batches': {
    title: 'Nóminas de pago',
    steps: [
      header('Paga a varios proveedores de una vez', 'Elige facturas, descarga el archivo para tu banco y márcala pagada cuando el banco confirme.'),
      note('Primero, una cuenta bancaria', 'La nómina sale desde una cuenta registrada en Bancos y conciliación.'),
      note('Datos bancarios', 'Un proveedor sin datos bancarios aparece marcado: complétalos en su ficha antes de subir el archivo.'),
    ],
  },
  reports: {
    title: 'Reportes Excel',
    steps: [
      header('Todo en un Excel', 'Libro de ventas y compras, Kardex valorizado, márgenes y pagos del período, con un panel de indicadores.'),
      note('Elige el período', 'Usa los atajos (Mes en curso, Mes anterior…) y "Descargar .xlsx".'),
      note('Para tu contador', 'Mándale este Excel junto con el F29 del mes.'),
    ],
  },
  'reports-f29': {
    title: 'Formulario 29',
    steps: [
      header('Tu F29 del mes', 'IVA débito y crédito, remanente, PPM, retenciones e impuesto determinado, calculado con tus documentos reales.'),
      note('Elige mes y año', 'Cada línea trae su explicación. Es un apoyo: la declaración la presenta tu contador.'),
      note('Si no cuadra', 'Revisa borradores sin emitir, compras sin registrar y productos mal marcados como exentos.'),
    ],
  },
  'reports-rcv': {
    title: 'Registro de Compras y Ventas',
    steps: [
      header('Cuadra con el SII', 'Compara el RCV del SII con tus documentos antes de declarar.'),
      note('Importa el CSV del SII', 'Descárgalo en sii.cl (Registro de Compras y Ventas → "Descargar detalles") y súbelo con "Importar RCV del SII".'),
      note('Resuelve las diferencias', 'Documentos que faltan en el ERP, montos distintos y los que el SII no tiene.'),
    ],
  },
  budgets: {
    title: 'Presupuestos',
    steps: [
      header('Tu plan de gastos', 'El presupuesto del período por categoría.'),
      primary('Botón "Nuevo Presupuesto"', 'Ponle nombre y período; después agrega una línea por categoría con su monto.'),
      note('Avance', 'Cada línea muestra planificado, real, desviación y avance.'),
    ],
  },
  expenses: {
    title: 'Rendición de Gastos',
    steps: [
      header('Rinde tus boletas', 'Cada persona rinde sus gastos; una jefatura aprueba y finanzas reembolsa.'),
      primary('Botón "Nueva rendición"', 'Crea la rendición, agrega cada gasto y "Enviar a aprobación".'),
      note('Aprobar y reembolsar', 'Quien aprueba usa "Aprobar" o "Rechazar"; finanzas, "Marcar reembolsada" con la referencia de la transferencia.'),
    ],
  },
  'fixed-assets': {
    title: 'Activo Fijo',
    steps: [
      header('Tus bienes de uso', 'Computadores, vehículos, maquinaria y muebles con su depreciación y valor libro.'),
      primary('Botón "Registrar activo"', 'La categoría propone la vida útil del SII. El costo va neto, sin el IVA que recuperas.'),
      note('Depreciación y etiquetas', '"Contabilizar depreciación" (con Contabilidad) una vez al mes; "Etiquetas" imprime códigos para cada bien.'),
    ],
  },
  'promissory-notes': {
    title: 'Pagarés',
    steps: [
      header('Pagarés firmados', 'Cada pagaré con su deudor, monto, vencimiento y el documento escaneado.'),
      primary('Botón "Nuevo Pagaré"', 'Registra el pagaré y sube el documento firmado.'),
      note('Abonos', 'Registra cada abono hasta completar el monto.'),
    ],
  },
  'payment-plans': {
    title: 'Cuotas & Mensualidades',
    steps: [
      header('Planes de pago en cuotas', 'Para sponsors o candidatas, con vencimientos, multas y recordatorios automáticos.'),
      primary('Botón "Nuevo Plan de Pago"', 'Elige el cliente, monto, número de cuotas y frecuencia: verás cada cuota antes de guardar.'),
      note('Cobra en línea', 'Con Khipu conectado, comparte el link del portal: las familias pagan por transferencia y la cuota se marca sola.'),
    ],
  },
  fees: {
    title: 'Boletas de Honorarios',
    steps: [
      header('Honorarios de independientes', 'Registra las boletas de jurado, animadores o staff externo.'),
      primary('Botón "Registrar Boleta de Honorarios"', 'Prestador, folio, monto bruto y servicio: la retención se calcula sola.'),
      note('Pagada', 'Cuando le pagues, "Marcar como pagada".'),
    ],
  },
  'financial-statements': {
    title: 'Estados Financieros',
    steps: [
      header('Se arman solos', 'La contabilidad se genera desde ventas, compras, pagos e inventario: no digitas asientos.'),
      note('Tres vistas', 'Balance General, Estado de Resultados y Flujo de Efectivo del período que elijas.'),
      note('Falta el plan de cuentas', 'Si ves ese aviso, el Dueño o el Contador lo crea con un clic.'),
    ],
  },
  'accounting-books': {
    title: 'Libros contables',
    steps: [
      header('Diario, Mayor, Balance y Cuadraturas', 'Las vistas de la contabilidad automática, por período.'),
      note('Libro Diario y Mayor', 'Cada asiento enlaza al documento que lo originó; el Mayor muestra el saldo acumulado de una cuenta.'),
      note('Cuadraturas', 'Compara cada saldo contable con su fuente operativa: si algo no cuadra, hay un error real que revisar.'),
    ],
  },
  intelligence: {
    title: 'Radiografía 360',
    steps: [
      header('La salud de tu empresa', 'Un puntaje de 0 a 100 con su diagnóstico por dimensión, calculado con tus documentos reales.'),
      note('Señales de hoy', 'Alertas ordenadas por urgencia: ventas bajo el ritmo, cartera vencida, clientes que dejaron de comprar…'),
      note('Clientes, productos y simulador', 'Segmentación RFM, matriz de productos y un simulador para probar precios y plazos sin guardar nada.'),
    ],
  },
  'intelligence-cash': {
    title: 'Caja a 13 semanas',
    steps: [
      header('Tu caja hacia adelante', 'Todo lo comprometido con fecha: cobros, pagos, cuotas, pagarés, sueldos e IVA.'),
      note('Ingresa tu saldo', 'Escribe tu saldo actual en bancos para proyectar semana a semana.'),
      note('Anticipa el descalce', 'Si alguna semana queda negativa, la verás con tiempo para actuar.'),
    ],
  },
  'intelligence-flows': {
    title: 'Flujos del negocio',
    steps: [
      header('Tu operación de punta a punta', 'De cotización a cobro y de compra a pago, reconstruido con tus documentos.'),
      note('Cuellos de botella', 'Cada tramo con su tiempo mediano; la etapa más lenta queda marcada.'),
    ],
  },
  agents: {
    title: 'Agentes',
    steps: [
      header('Tu equipo ejecutivo virtual', 'CEO, CFO, COO y Ventas analizan tus datos reales y dejan recomendaciones.'),
      note('Tú decides', 'Revisa cada recomendación: "Marcar como revisada" o "Descartar". Ningún agente ejecuta acciones por su cuenta.'),
      note('Análisis al momento', '"Analizar ahora" pide un análisis fresco de un rol.'),
    ],
  },
  crm: {
    title: 'Embudo de negocios',
    steps: [
      header('Tus negocios por etapa', 'Auspicios, eventos, entradas corporativas y más, con monto, probabilidad y próximo paso.'),
      primary('Botón "Nueva oportunidad"', 'Registra el negocio con su marca, contacto, certamen y plan del tarifario.'),
      note('Arrastra para avanzar', 'Mueve la tarjeta de columna. Al perder un negocio, el motivo es obligatorio.'),
      note('Que no se enfríe', 'Las tarjetas sin próximo paso y las actividades vencidas se destacan.'),
    ],
  },
  'crm-list': {
    title: 'Lista de oportunidades',
    steps: [
      header('Todos tus negocios en tabla', 'Ordena por monto, probabilidad o fecha de cierre, con alertas de riesgo.'),
      note('Exporta', 'Lleva la lista filtrada a Excel.'),
    ],
  },
  'crm-tasks': {
    title: 'Agenda comercial',
    steps: [
      header('Tus seguimientos', 'Llamadas, reuniones y correos agrupados en vencidos, hoy, mañana y próximos días.'),
      note('Reprograma en un clic', 'Mueve una actividad a otra fecha sin abrir el negocio.'),
    ],
  },
  'crm-people': {
    title: 'Contactos comerciales',
    steps: [
      header('Las personas detrás de cada marca', 'Gerentes de marketing, agencias y productores con sus datos y negocios.'),
      note('Nuevo contacto', 'Registra a la persona y asóciala a sus negocios.'),
    ],
  },
  'crm-reports': {
    title: 'Reportes comerciales',
    steps: [
      header('Cómo va tu embudo', 'Pronóstico ponderado por mes y rendimiento por tipo, certamen, origen y responsable.'),
      note('Por qué pierdes', 'Los motivos de pérdida te dicen qué mejorar.'),
    ],
  },
  'hr-employees': {
    title: 'Trabajadores',
    steps: [
      header('Ficha de cada trabajador', 'Contrato, remuneración y previsión: la base de sus liquidaciones.'),
      primary('Botón "Nuevo trabajador"', 'Completa contrato, sueldo, AFP y salud.'),
      note('Todo desde la ficha', 'Préstamos y anticipos, liquidaciones, vacaciones, finiquito, certificados y el portal del trabajador.'),
    ],
  },
  'hr-payroll': {
    title: 'Remuneraciones',
    steps: [
      header('Liquidaciones del mes', 'Con AFP, salud, cesantía, impuesto único y aportes del empleador.'),
      primary('Botón "Abrir período"', 'Confirma UF, UTM, topes y tasas en previred.com: quedan guardados con el mes.'),
      note('Calcula, revisa y cierra', '"Calcular liquidaciones" las veces que quieras; descarga el libro y la planilla de cotizaciones y "Cerrar período".'),
    ],
  },
  'hr-leave': {
    title: 'Vacaciones & Permisos',
    steps: [
      header('Feriado legal al día', 'Solicitudes con aprobación y el saldo de cada trabajador.'),
      primary('Botón "Nueva solicitud"', 'Registra las fechas: el sistema cuenta los días hábiles.'),
      note('Solo lo aprobado descuenta', 'Una jefatura aprueba o rechaza; el saldo se actualiza solo.'),
    ],
  },
  'org-chart': {
    title: 'Organigrama',
    steps: [
      header('La estructura de tu equipo', 'Cargos y quién reporta a quién, en forma de árbol.'),
      note('Gestiona cargos', '"Gestionar cargos y jerarquía": crea cargos y asigna a cada colaborador su cargo y jefatura. "Sugerir con IA" propone una estructura.'),
    ],
  },
  projects: {
    title: 'Certámenes & Eventos',
    steps: [
      header('Tus certámenes', 'Cada uno con su centro de mando: preparación, candidatas, auspicios, entradas, votación, escaleta y finanzas.'),
      primary('Botón "Nuevo Proyecto"', 'Crea el certamen con su fecha de gala: todo lo demás se organiza dentro de él.'),
      note('¿Listos para la gala?', 'Dentro de cada certamen, un checklist calculado con datos reales te dice qué falta y te lleva a resolverlo.'),
      note('Sitio público y afiches', 'Desde el centro de mando publicas el sitio del certamen y creas los afiches de la campaña.'),
    ],
  },
  calendar: {
    title: 'Calendario',
    steps: [
      header('Sincroniza con Google Calendar', 'Certámenes, galas y cumpleaños de candidatas directo en tu calendario.'),
      note('Recordatorios', 'Recibe avisos antes de cada fecha importante sin revisar el sistema a diario.'),
    ],
  },
  candidates: {
    title: 'Candidatas & Staff',
    steps: [
      header('Fichas de candidatas', 'Datos, documentos, fotos, contrato de imagen e historial en un solo lugar.'),
      primary('Botón "Nueva Candidata"', 'O abre la "Convocatoria" y comparte el enlace para que se postulen solas.'),
      note('Contrato con firma electrónica', 'Desde la ficha, "Solicitar firma por correo" y sigue su estado sin salir del sistema.'),
      note('Casting, asistencia y cumplimiento', 'En el menú Candidatas tienes el Tablero de casting, la Asistencia por sesión y los Contratos firmados.'),
    ],
  },
  'candidates-casting': {
    title: 'Tablero de casting',
    steps: [
      header('De postulante a reina', 'Mueve cada ficha por las etapas del certamen.'),
      note('Numera a las oficiales', '"Numerar oficiales" asigna N° 1, 2, 3… en el orden que elijas.'),
      note('Presentación pública', '"Presentación" define número, a quién representa y la bio del sitio. Nada de la ficha privada se publica solo.'),
    ],
  },
  'candidates-attendance': {
    title: 'Asistencia',
    steps: [
      header('Asistencia por sesión', 'Talleres, ensayos y eventos, sin pasar candidata por candidata.'),
      note('Crea sesiones', '"Crear sesiones": una fecha o una serie (ej. martes y jueves).'),
      note('Pasa lista rápido', 'Todas parten presentes: desmarca solo a las ausentes y guarda.'),
    ],
  },
  'candidates-compliance': {
    title: 'Cumplimiento de Candidatas',
    steps: [
      header('Quién está al día', 'Asistencia, pagos, documentos y contrato de cada candidata en una tabla.'),
      note('Actúa sobre lo pendiente', 'Abre la ficha de quien tenga algo pendiente para resolverlo.'),
    ],
  },
  'candidates-template': {
    title: 'Plantilla: Contrato de Imagen',
    steps: [
      header('El texto del contrato', 'Es la base de cada contrato de imagen que envías a firmar.'),
      note('Cambios a futuro', 'Los cambios aplican a los contratos nuevos, no a los ya enviados.'),
    ],
  },
  contracts: {
    title: 'Contratos firmados',
    steps: [
      header('Todos tus contratos', 'Contratos de imagen y cartas de compromiso de todos los certámenes, primero lo que requiere acción.'),
      note('Filtra y reenvía', 'Filtra por estado, certamen o tipo, y copia el enlace de firma para reenviarlo.'),
    ],
  },
  sponsorships: {
    title: 'Auspicios & Marcas',
    steps: [
      header('Tus marcas auspiciadoras', 'Cada contrato con su aporte en efectivo o canje, entregables, pagos y carta de compromiso.'),
      primary('Botón "Nuevo Contrato de Auspicio"', 'O conviértelo desde un negocio ganado del CRM.'),
      note('Entregables con evidencia', 'Marca cada compromiso al cumplirlo y adjunta la foto o PDF; comparte el portal con la marca.'),
    ],
  },
  'sponsorships-packages': {
    title: 'Tarifario de Auspicios',
    steps: [
      header('Los planes que ofreces', 'Nivel, precio de lista, cupos y beneficios por certamen.'),
      note('Plantillas y copia', 'Los del tarifario general son plantillas: cópialos a un certamen con "Copiar planes desde".'),
      note('Públicos', 'Marca los planes que se muestran en el sitio del certamen y si se publica su precio.'),
    ],
  },
  'sponsorships-compliance': {
    title: 'Cumplimiento de Auspicios',
    steps: [
      header('Qué falta entregar', 'Por marca, el % de entregables completados.'),
      note('Entra al contrato', 'Abre la marca atrasada y marca lo cumplido con su evidencia.'),
    ],
  },
  'sponsorships-template': {
    title: 'Plantilla: Carta de Compromiso',
    steps: [
      header('El texto de la carta', 'Es la base de la carta de compromiso de cada auspicio nuevo.'),
      note('Cambios a futuro', 'Los cambios aplican a las cartas que generes desde ahora.'),
    ],
  },
  'production-timeline': {
    title: 'Escaleta en vivo',
    steps: [
      header('El show minuto a minuto', 'Bloques con segmento, candidata, pies técnicos y looks.'),
      note('Arma y encadena', 'Agrega bloques, reordénalos y usa "Encadenar horarios". "Imprimir escaleta" da la hoja para cabina.'),
      note('Modo show', 'A pantalla completa con cuenta regresiva y atraso acumulado; "Siguiente bloque" avanza el show.'),
    ],
  },
  'production-wardrobe': {
    title: 'Vestuario',
    steps: [
      header('Looks por candidata y bloque', 'Pruebas, entregas, devoluciones y valor declarado.'),
      note('Plan de looks', '"Generar plan de looks" crea uno por candidata oficial en cada bloque con vestuario.'),
      note('Avanza el estado', 'Pendiente → Lista → Entregada → Devuelta, con un clic.'),
    ],
  },
  'production-accreditation': {
    title: 'Acreditaciones',
    steps: [
      header('Acredita a staff y proveedores', 'Cada persona con su rol, empresa, nivel de acceso y código; con correo, recibe su QR.'),
      note('Diseño de credencial', 'Crea plantillas (fondo, colores) y descarga la credencial para imprimir.'),
      note('Check-in', 'El día del evento registra el ingreso de cada persona.'),
    ],
  },
  judging: {
    title: 'Votación & Escrutinio',
    steps: [
      header('Jurado y escrutinio', 'Rondas con criterios ponderados, un enlace por jurado y resultados en vivo.'),
      note('Rondas y criterios', '"+ Nueva Ronda" con su corte, y criterios con ponderación y puntaje máximo.'),
      note('Jurados', '"+ Registrar Nuevo Jurado" y envíale su enlace: califica desde su celular.'),
      note('Votar y cerrar', '"Votar ahora" abre la ronda; "Finalizar votaciones" calcula los resultados. Descarga el Acta PDF.'),
    ],
  },
  ticketing: {
    title: 'Venta de Entradas',
    steps: [
      header('Tus entradas', 'Tipos de entrada con precio y cupo, ventas y control de acceso.'),
      note('Confirma pagos', 'Las compras llegan reservadas: "Confirmar pago" cuando verifiques la transferencia.'),
      note('Check-in con QR', 'El día del evento escanea el QR y "Registrar ingreso".'),
    ],
  },
  'public-voting': {
    title: 'Votación Pagada',
    steps: [
      header('El público vota', 'Desde el enlace público, pagando por cada voto a su candidata favorita.'),
      note('Confirma pagos', 'Los votos cuentan cuando confirmas el pago de la orden.'),
      note('Ranking en vivo', 'Se actualiza a medida que confirmas los votos.'),
    ],
  },
  messaging: {
    title: 'Mensajería',
    steps: [
      header('Chat interno de tu equipo', 'Conversaciones cifradas, solo visibles para quienes participan.'),
      note('Nueva conversación', 'Inicia un chat individual o grupal con gente de tu empresa.'),
    ],
  },
  manual: {
    title: 'Manual de Usuario',
    steps: [
      header('Tu manual, a tu medida', 'Solo los módulos de tu empresa. "Mi rol" muestra lo que tú puedes hacer; "Toda la empresa", el manual completo para capacitar.'),
      note('Busca o navega', 'Escribe lo que necesitas (sin preocuparte de las tildes) o salta a un capítulo desde el índice.'),
      note('Descárgalo', '"Descargar Word" baja el manual con capturas de pantalla, listo para imprimir o compartir.'),
    ],
  },
  settings: {
    title: 'Configuración',
    steps: [
      header('Todo lo de tu empresa', 'Datos, folios, equipo, roles, módulos del menú, importación, automatizaciones y auditoría.'),
      note('Primeros pasos', 'Si recién empiezas: Perfil de Empresa, luego Folios del SII y después Equipo & Colaboradores.'),
    ],
  },
  'settings-company': {
    title: 'Perfil de Empresa',
    steps: [
      header('Datos y parámetros tributarios', 'Razón social, RUT, giro, logo, tasa de PPM, retención de honorarios y año fiscal.'),
      note('Reglas de operación', 'Permitir ventas con stock negativo y el umbral de aprobación de compras.'),
      note('IP permitidas, integraciones y respaldo', 'Restringe el acceso por IP, conecta integraciones y descarga el respaldo completo de tus datos.'),
    ],
  },
  'settings-modules': {
    title: 'Módulos y Menú',
    steps: [
      header('Un menú a tu medida', 'Apaga las secciones que tu equipo no usa: desaparecen del menú y del buscador.'),
      note('Sin perder nada', 'Apagar no borra datos ni cambia permisos; al encender, vuelve igual.'),
    ],
  },
  'settings-plans': {
    title: 'Planes y Módulos',
    steps: [
      header('Lo que puedes sumar a tu cuenta', 'Precios mensuales de cada plan y de cada módulo, siempre más IVA.'),
      note('Arma tu selección', 'Elige un plan o marca módulos sueltos: abajo ves el total con y sin IVA.'),
      note('Solicitar contratación', 'Envía la solicitud a Aether: un ejecutivo te contacta y activa los módulos. No se cobra nada antes.'),
    ],
  },
  'settings-users': {
    title: 'Equipo & Colaboradores',
    steps: [
      header('Tu equipo', 'Quién entra al sistema, con qué rol, y las invitaciones pendientes.'),
      note('Agrega colaboradores', '"+ Agregar Colaborador": invítalo por correo o crea su cuenta con una contraseña temporal.'),
      note('Cuando alguien se va', 'Desactívalo en vez de eliminarlo: pierde el acceso al instante y su historial queda.'),
    ],
  },
  roles: {
    title: 'Roles Personalizados',
    steps: [
      header('Crea un rol a medida', 'Marca exactamente los permisos que necesita una función, en vez de usar un rol base.'),
      note('No aplica al Dueño', 'El Dueño nunca se limita; los roles a medida son para el resto del equipo.'),
    ],
  },
  dte: {
    title: 'Folios del SII (CAF)',
    steps: [
      header('Carga tu CAF', 'Sube el XML que entrega el SII con el rango de folios para cada tipo de documento.'),
      note('Folio y timbre automáticos', 'Cada documento toma su folio del rango y se timbra solo. Sin CAF, la numeración es interna y sin validez tributaria.'),
      note('Que no se agoten', 'Revisa cuántos quedan y crea una automatización que te avise.'),
    ],
  },
  automation: {
    title: 'Automatizaciones',
    steps: [
      header('Arma una regla', 'Disparador (venta emitida, stock bajo mínimo, folios por agotarse…), condiciones opcionales y acciones.'),
      note('Acciones', 'Correo, aviso en la campanita o webhook firmado, siempre después de que la operación ya quedó guardada.'),
      note('Historial', 'Revisa en "Historial" cada vez que la regla se ejecutó.'),
    ],
  },
  import: {
    title: 'Importación Masiva',
    steps: [
      header('Carga en bloque', 'Productos, contactos, stock inicial e históricos desde Excel o CSV.'),
      note('Usa la plantilla', 'Descarga la plantilla, llénala y revisa la vista previa: nada se guarda hasta que confirmas.'),
      note('Con IA', 'También puedes escanear fotos de facturas o describir ventas en texto.'),
    ],
  },
  security: {
    title: 'Seguridad',
    steps: [
      header('Verificación en dos pasos', 'Protege tu cuenta con un código de una app además de tu contraseña.'),
      note('Dispositivos activos', 'Revisa tus sesiones abiertas y cierra la que no reconozcas.'),
    ],
  },
  profile: {
    title: 'Mi Perfil',
    steps: [
      header('Tus datos', 'Tu teléfono, tu foto y tu actividad reciente en la plataforma.'),
      note('Protege tu cuenta', 'En Configuración → Seguridad activa la verificación en dos pasos.'),
    ],
  },
  audit: {
    title: 'Auditoría',
    steps: [
      header('Quién hizo qué', 'Cada acción sensible queda registrada con quién, cuándo y qué cambió.'),
      note('Busca y exporta', 'Filtra por usuario o entidad, mira el detalle con "Ver JSON" y descarga la bitácora en Excel.'),
    ],
  },
};
