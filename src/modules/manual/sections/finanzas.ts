import type { ManualSection } from '../types';

/** La plata: lo que te deben, lo que debes, el banco, y los compromisos de pago de mediano plazo. */
export const FINANZAS_SECTIONS: ManualSection[] = [
  {
    id: 'tesoreria',
    key: 'hasTreasury',
    permission: 'treasury:read',
    chapter: 'Finanzas',
    title: 'Tesorería: cuentas por cobrar, por pagar y flujo de caja',
    summary:
      'Qué te deben tus clientes, qué le debes a tus proveedores y cuánto dinero entró y salió. Cada venta o compra a crédito aparece aquí sola hasta que registras su pago.',
    route: '/dashboard/treasury/cxc',
    topics: [
      {
        id: 'cxc',
        title: 'Cobrar una factura (Cuentas por Cobrar)',
        permission: 'treasury:write',
        steps: [
          'Ve a Finanzas → Cuentas por Cobrar: arriba ves el total por cobrar, lo vencido y lo cobrado este mes, y la antigüedad de la cartera.',
          'Busca el documento y presiona "Registrar pago".',
          'Ingresa el monto (puede ser un abono parcial), el medio de pago, la fecha y el N° de comprobante. Elige la cuenta bancaria donde entró: así se concilia sola al importar la cartola.',
          'El documento queda "Pagado" o en "Abono parcial" con su saldo restante.',
        ],
      },
      {
        id: 'cxp',
        title: 'Pagar a un proveedor (Cuentas por Pagar)',
        permission: 'treasury:write',
        route: '/dashboard/treasury/cxp',
        steps: [
          'Ve a Finanzas → Cuentas por Pagar: verás el total por pagar, lo que vence en los próximos 7 días y lo ya vencido.',
          'Registra el pago de cada factura con "Registrar pago", igual que en Cuentas por Cobrar.',
          'Para pagar muchas facturas de una vez por transferencia, usa Nóminas de pago.',
        ],
      },
      {
        id: 'recordatorio-pago',
        title: 'Enviar un recordatorio de pago a un cliente',
        steps: [
          'En Cuentas por Cobrar abre el menú "⋯" de la fila (junto a "Registrar pago") y elige "Recordar por email": le llega un correo al cliente con el detalle.',
          'Si en el menú aparece "Agregar correo", el cliente no tiene correo registrado: el enlace abre su ficha en Clientes & Proveedores para que lo escribas.',
          'Para recordatorios automáticos, configúralos en Finanzas → Cobranza.',
        ],
      },
      {
        id: 'flujo-caja',
        title: 'Ver el flujo de caja del período',
        route: '/dashboard/treasury/cashflow',
        steps: [
          'Ve a Finanzas → Flujo de Caja y elige el período con los botones rápidos.',
          'Verás ingresos, egresos y saldo neto, el consolidado por medio de pago y el gráfico de ingresos contra egresos.',
          'Usa "Exportar CSV" para llevar los movimientos a una planilla.',
        ],
        tip: 'Para proyectar la caja hacia adelante (13 semanas) usa Inteligencia de Negocio → Caja a 13 semanas, si tu plan lo incluye.',
      },
    ],
  },
  {
    id: 'cobranza',
    key: 'hasTreasury',
    permission: 'treasury:read',
    chapter: 'Finanzas',
    title: 'Cobranza',
    summary: 'La antigüedad de la deuda de cada cliente, las gestiones y promesas de pago, y los recordatorios automáticos por correo que trabajan por ti cada mañana.',
    route: '/dashboard/treasury/collections',
    topics: [
      {
        id: 'gestionar-cliente',
        title: 'Registrar una gestión de cobranza',
        permission: 'treasury:write',
        steps: [
          'Ve a Finanzas → Cobranza. La tabla ordena a los clientes con deuda por saldo y antigüedad, con su última gestión y promesa.',
          'Haz clic en "Gestionar" en el cliente.',
          'Elige el tipo de gestión (llamada, correo, visita…), el documento si aplica, y si prometió pagar, la fecha ("Pagará el") y el monto comprometido.',
          'Escribe el detalle (ej. "Habló con finanzas, pagará el viernes por transferencia") y presiona "Guardar gestión". El historial queda en la ficha.',
        ],
      },
      {
        id: 'recordatorios-automaticos',
        title: 'Activar los recordatorios automáticos',
        permission: 'treasury:write',
        steps: [
          'En "Recordatorios automáticos" activa la opción y elige los momentos: días antes del vencimiento, el día que vence y días después.',
          'Cada mañana se envía un correo a los clientes con documentos que llegan a uno de esos momentos. Cada documento recibe cada aviso una sola vez.',
          'Para excluir a un cliente puntual, ábrelo con "Gestionar" y usa "Pausar recordatorios automáticos". Los clientes sin correo no reciben nada.',
          '"Enviar recordatorio ahora" manda el aviso de inmediato a un cliente.',
        ],
      },
    ],
  },
  {
    id: 'bancos-conciliacion',
    key: 'hasTreasury',
    permission: 'treasury:read',
    chapter: 'Finanzas',
    title: 'Bancos y conciliación bancaria',
    summary: 'Tus cuentas bancarias con su saldo según el banco y según tus registros. Importas la cartola y el sistema concilia solo lo que calza; tú resuelves el resto con un clic.',
    route: '/dashboard/treasury/banks',
    topics: [
      {
        id: 'crear-cuenta',
        title: 'Registrar una cuenta bancaria',
        permission: 'treasury:write',
        steps: [
          'Ve a Finanzas → Bancos y conciliación y haz clic en "Agregar cuenta".',
          'Completa nombre, banco, tipo y N° de cuenta, el saldo inicial y la fecha desde la que conciliarás.',
        ],
      },
      {
        id: 'conciliar',
        title: 'Conciliar la cartola',
        permission: 'treasury:write',
        steps: [
          'En la cuenta, haz clic en "Conciliar" y sube la cartola que descargaste del banco.',
          'Presiona "Conciliar automáticamente": une cada movimiento del banco con el cobro o pago que calza.',
          'Para lo que queda "Por conciliar", acepta la sugerencia, usa "Buscar en registros" para elegir el pago correcto, o "Sin registro en libros" si el movimiento no tiene contraparte (comisiones, por ejemplo).',
          'La "Cuadratura" compara el saldo según banco con el saldo según registros. "Deshacer" revierte una conciliación equivocada.',
        ],
        tip: 'Si la cuadratura no cierra desde el inicio, revisa el saldo inicial y la fecha desde la que concilias.',
      },
    ],
  },
  {
    id: 'cheques',
    key: 'hasTreasury',
    permission: 'treasury:read',
    chapter: 'Finanzas',
    title: 'Cheques',
    summary: 'La cartera de cheques recibidos de clientes (también a fecha) y los girados a proveedores. Al depositarlos, cobrarlos o protestarlos, el documento asociado se actualiza solo.',
    route: '/dashboard/treasury/cheques',
    topics: [
      {
        id: 'registrar-cheque',
        title: 'Registrar un cheque',
        permission: 'treasury:write',
        steps: [
          'Ve a Finanzas → Cheques, elige la vista "Recibidos" o "Girados" y haz clic en "Registrar cheque".',
          'Completa N° de cheque, banco, monto, fecha de emisión y fecha de cobro, girador y el documento que paga.',
        ],
      },
      {
        id: 'mover-cheque',
        title: 'Depositar, cobrar o protestar',
        permission: 'treasury:write',
        steps: [
          'En la fila del cheque usa "Depositar" (eligiendo la cuenta de depósito), "Cobrado", "Protestar" (con el motivo) o "Anular".',
          'Un cheque protestado devuelve la deuda al documento. Filtra por Pendientes, Cobrados o Protestados para revisar la cartera.',
        ],
      },
    ],
  },
  {
    id: 'nominas-de-pago',
    key: 'hasTreasury',
    permission: 'treasury:read',
    chapter: 'Finanzas',
    title: 'Nóminas de pago a proveedores',
    summary: 'Elige las facturas a pagar, descarga el archivo para el portal de tu banco y, cuando el banco confirme, márcala pagada: cada factura queda abonada con su asiento.',
    route: '/dashboard/treasury/payment-batches',
    topics: [
      {
        id: 'armar-nomina',
        title: 'Armar y pagar una nómina',
        permission: 'treasury:write',
        steps: [
          'Primero registra al menos una cuenta bancaria en Bancos y conciliación.',
          'Ve a Finanzas → Nóminas de pago y crea una nueva: elige la cuenta de origen, la fecha de pago y "Vencen hasta" para ver las facturas.',
          'Marca las facturas a pagar ("Marcar visibles" marca todas las filtradas). Puedes pagar un monto parcial editándolo.',
          'Descarga el archivo en Excel o CSV y súbelo al portal de tu banco.',
          'Cuando el banco confirme las transferencias, marca la nómina como pagada: se registra el pago de cada factura.',
        ],
        tip: 'Un proveedor sin datos bancarios aparece marcado: complétalos en su ficha antes de subir el archivo al banco. Las facturas que no coinciden con su orden de compra quedan bloqueadas.',
      },
    ],
  },
  {
    id: 'presupuestos',
    key: 'hasBudgets',
    permission: 'budgets:read',
    chapter: 'Finanzas',
    title: 'Presupuestos',
    summary: 'El plan de gastos del período por categoría (arriendo, sueldos, insumos…), con su avance y desviación.',
    route: '/dashboard/budgets',
    topics: [
      {
        id: 'crear-presupuesto',
        title: 'Armar el presupuesto del período',
        permission: 'budgets:write',
        steps: [
          'Ve a Finanzas → Presupuestos y haz clic en "Nuevo Presupuesto".',
          'Ponle nombre (ej. "Presupuesto operativo 2026"), el inicio y término del período y su estado.',
          'Abre el presupuesto y agrega una línea por categoría con su monto planificado.',
        ],
      },
      {
        id: 'seguir-presupuesto',
        title: 'Seguir el avance',
        steps: [
          'Cada línea muestra planificado, real, desviación y avance. Arriba ves los totales.',
          'La columna Real suma los pagos de Tesorería asociados a cada línea. Una desviación positiva significa que se gastó más de lo planificado.',
        ],
      },
    ],
  },
  {
    id: 'rendicion-de-gastos',
    key: 'hasExpenseReports',
    permission: 'expenses:submit',
    chapter: 'Finanzas',
    title: 'Rendición de gastos',
    summary: 'Cada persona rinde sus boletas de gastos; una jefatura aprueba o rechaza y finanzas registra el reembolso. Nadie aprueba su propia rendición.',
    route: '/dashboard/expenses',
    topics: [
      {
        id: 'rendir',
        title: 'Rendir mis gastos',
        steps: [
          'Ve a Finanzas → Rendición de Gastos y haz clic en "Nueva rendición" (ej. "Visita a clientes en Temuco"), opcionalmente asociada a un proyecto o evento.',
          'En "Agregar gasto" registra cada gasto con fecha, categoría, descripción, tipo y N° de documento, comercio y monto.',
          'Cuando esté completa, presiona "Enviar a aprobación". Si te la rechazan verás el comentario y podrás corregirla y reenviarla.',
        ],
      },
      {
        id: 'aprobar-reembolsar',
        title: 'Aprobar y reembolsar',
        steps: [
          'Quien aprueba (permiso de aprobar rendiciones) abre la rendición y usa "Aprobar" o "Rechazar" (el comentario es obligatorio si rechazas).',
          'Finanzas abre las aprobadas y usa "Marcar reembolsada" con la referencia del reembolso (N° de transferencia o cheque).',
          'Arriba ves lo que espera aprobación, lo aprobado por reembolsar y lo reembolsado este mes, y el gasto por categoría de los últimos 90 días.',
        ],
      },
    ],
  },
  {
    id: 'activo-fijo',
    key: 'hasFixedAssets',
    permission: 'assets:read',
    chapter: 'Finanzas',
    title: 'Activo fijo',
    summary: 'Los bienes de uso de la empresa (computadores, vehículos, maquinaria, muebles) con su depreciación lineal o acelerada, su valor libro al día, mantenciones y etiqueta con código de barras.',
    route: '/dashboard/fixed-assets',
    topics: [
      {
        id: 'registrar-activo',
        title: 'Registrar un bien',
        permission: 'assets:write',
        steps: [
          'Ve a Finanzas → Activo Fijo y haz clic en "Registrar activo".',
          'Completa código (ej. AF-001), descripción y categoría: la categoría propone la vida útil de la tabla del SII (verifica la vigente).',
          'Elige el método (lineal o acelerado), el costo neto sin el IVA que recuperas, el valor residual, la fecha de adquisición, ubicación y responsable.',
        ],
      },
      {
        id: 'depreciacion',
        title: 'Contabilizar la depreciación del mes',
        permission: 'assets:write',
        steps: [
          'Con el módulo de Contabilidad, usa "Contabilizar depreciación" y elige el mes.',
          'Se crea un asiento de gasto por depreciación contra depreciación acumulada. Solo se permite uno por mes, así que revisa los bienes y sus fechas antes de confirmar.',
        ],
      },
      {
        id: 'mantenciones-etiquetas',
        route: '/dashboard/fixed-assets/labels',
        title: 'Mantenciones, etiquetas y bajas',
        permission: 'assets:write',
        steps: [
          'Abre "Ficha, mantenciones y etiqueta" del bien para registrar mantenciones (con próxima fecha para que el sistema te avise).',
          'Con el botón "Etiquetas" (arriba en Activo Fijo) imprime las etiquetas con código de barras para pegarlas en cada bien: el inventario físico se hace escaneando.',
          'Si el bien se vendió o se perdió, usa "Dar de baja" con la fecha y el precio de venta (0 si se desechó): queda el historial y el resultado de la venta.',
        ],
      },
    ],
  },
  {
    id: 'pagares',
    key: 'hasPromissoryNotes',
    permission: 'promissorynotes:read',
    chapter: 'Finanzas',
    title: 'Pagarés',
    summary: 'Registro de pagarés firmados por clientes o candidatas, con el documento escaneado, su vencimiento y los abonos recibidos.',
    route: '/dashboard/promissory-notes',
    topics: [
      {
        id: 'registrar-pagare',
        title: 'Registrar un pagaré',
        permission: 'promissorynotes:write',
        steps: [
          'Ve a Finanzas → Pagarés y haz clic en "Nuevo Pagaré".',
          'Elige el deudor (contacto) y, si respalda el compromiso de una candidata, también la candidata: se verá en su ficha.',
          'Indica monto, fechas de emisión y vencimiento, y sube el documento firmado.',
        ],
      },
      {
        id: 'abonar-pagare',
        title: 'Registrar abonos',
        permission: 'promissorynotes:write',
        steps: [
          'En el pagaré usa el registro de pago para actualizar el monto pagado y la forma de pago del abono.',
          'El pago acumulado no puede superar el monto del pagaré. Al completarse, el pagaré queda pagado.',
        ],
      },
    ],
  },
  {
    id: 'cuotas',
    key: 'hasInstallmentPlans',
    permission: 'paymentplans:read',
    chapter: 'Finanzas',
    title: 'Cuotas y mensualidades',
    summary: 'Planes de pago en cuotas para sponsors o candidatas, con vencimientos, multa por atraso, recordatorio automático y pago en línea por transferencia.',
    route: '/dashboard/payment-plans',
    topics: [
      {
        id: 'crear-plan-pago',
        title: 'Crear un plan de pago en cuotas',
        permission: 'paymentplans:write',
        steps: [
          'Ve a Finanzas → Cuotas & Mensualidades y haz clic en "Nuevo Plan de Pago".',
          'Elige el tipo de cliente (Sponsor o Candidata) y búscalo por nombre o RUT.',
          'Define monto total, número de cuotas, frecuencia y fecha de la primera cuota: verás la vista previa de cada cuota antes de guardar.',
          'Opcional: multa por atraso (% sobre la cuota vencida).',
        ],
        tip: 'El Asistente también puede crearlo: "arma un plan de $600.000 en 6 cuotas mensuales para la candidata Ana Rojas desde el 5 de noviembre".',
      },
      {
        id: 'cobrar-cuota',
        title: 'Registrar el pago de una cuota',
        permission: 'paymentplans:write',
        steps: [
          'Abre el plan y usa "Registrar pago" en la cuota: ingresa el monto pagado y guarda.',
          'Cuando todas las cuotas están pagadas, el plan queda Completado. Si el acuerdo se cae, "Cancelar plan de pago" conserva el historial de lo pagado.',
        ],
      },
      {
        id: 'pago-en-linea',
        title: 'Cobrar las cuotas en línea (Khipu)',
        permission: 'paymentplans:write',
        steps: [
          'En "Pago en línea de cuotas", el Dueño o Administrador guarda la API key de Khipu de la empresa (define a qué cuenta llega el dinero).',
          'Presiona "Generar link del portal" y compártelo: las familias ingresan el RUT de la candidata, eligen las cuotas y pagan por transferencia.',
          'Cuando Khipu confirma el pago, la cuota queda pagada sola y a quien pagó le llega el comprobante por correo.',
        ],
      },
      {
        id: 'recordatorio-mora',
        title: 'Recordatorios y multas automáticas',
        steps: [
          'El sistema envía un recordatorio por correo cuando una cuota vence y sigue impaga.',
          'Si definiste multa por atraso, se aplica sola sobre las cuotas vencidas y se ve en la columna "Multa aplicada".',
        ],
      },
    ],
  },
  {
    id: 'honorarios',
    key: 'hasFeeDocuments',
    permission: 'fees:read',
    chapter: 'Finanzas',
    title: 'Boletas de honorarios',
    summary: 'Registro de las boletas de honorarios de personas que trabajan contigo de forma independiente, con la retención de 2ª categoría calculada sola.',
    route: '/dashboard/fees',
    topics: [
      {
        id: 'registrar-boleta',
        title: 'Registrar una boleta de honorarios',
        permission: 'fees:write',
        steps: [
          'Ve a Finanzas → Boletas de Honorarios y haz clic en "Registrar Boleta de Honorarios".',
          'Busca al prestador (debe estar marcado como proveedor), escribe el folio de la boleta, la fecha, el monto bruto y la descripción del servicio. Opcional: asóciala a un proyecto.',
          'El sistema calcula la retención y el líquido a pagar con la tasa configurada en tu empresa.',
          'Cuando le pagues, usa "Marcar como pagada".',
        ],
      },
    ],
  },
];
