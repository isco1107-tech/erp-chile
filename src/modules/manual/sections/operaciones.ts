import type { ManualSection } from '../types';

/** Lo que pasa dentro de la empresa: fabricar, reparar, controlar calidad y repartir el trabajo. */
export const OPERACIONES_SECTIONS: ManualSection[] = [
  {
    id: 'produccion',
    key: 'hasProduction',
    permission: 'manufacturing:read',
    chapter: 'Operaciones',
    title: 'Producción (recetas y órdenes de producción)',
    summary:
      'Para lo que fabricas o elaboras: la receta dice qué insumos lleva cada producto, y cada orden de producción descuenta esos insumos y deja el producto terminado en bodega a su costo real (insumos al PMP más mano de obra).',
    route: '/dashboard/manufacturing',
    topics: [
      {
        id: 'crear-receta',
        title: 'Crear la receta de un producto',
        permission: 'manufacturing:write',
        route: '/dashboard/manufacturing/boms',
        steps: [
          'Ve a Operaciones → Recetas y haz clic en "Nueva receta".',
          'Busca el producto terminado, ponle nombre a la receta e indica cuánto produce (ej. 10 unidades).',
          'Agrega cada insumo con su cantidad. Abajo verás el costo de insumos por unidad.',
          'Escribe las notas del proceso si sirven, deja la receta activa y guarda.',
        ],
        tip: 'Los insumos y el producto terminado deben existir en el Catálogo de Productos antes de armar la receta.',
      },
      {
        id: 'orden-produccion',
        title: 'Fabricar con una orden de producción',
        permission: 'manufacturing:write',
        steps: [
          'Ve a Operaciones → Producción y haz clic en "Nueva orden": elige la receta, la cantidad a producir, la fecha y la bodega (de donde salen los insumos y a la que entra el producto).',
          'Abre la orden y presiona "Iniciar". La tabla de insumos muestra lo planificado y lo disponible en bodega; si falta algo, avisa antes de terminar.',
          'Al terminar, presiona "Terminar producción": confirma la cantidad producida, el consumo real de insumos y la mano de obra y otros costos.',
          'El producto entra a bodega con su costo unitario real. "Anular" cancela una orden que no se hizo (no mueve inventario).',
        ],
      },
    ],
  },
  {
    id: 'servicio-tecnico',
    key: 'hasServiceDesk',
    permission: 'service:read',
    chapter: 'Operaciones',
    title: 'Servicio técnico',
    summary:
      'Recepción de equipos, diagnóstico, presupuesto que el cliente aprueba desde su enlace, reparación y entrega. El cliente sigue el estado de su equipo sin llamar, y el cobro sale como nota de venta.',
    route: '/dashboard/service',
    topics: [
      {
        id: 'recibir-equipo',
        title: 'Recibir un equipo',
        permission: 'service:write',
        route: '/dashboard/service/new',
        steps: [
          'Ve a Operaciones → Servicio técnico y haz clic en "Recibir equipo".',
          'Registra el cliente, el equipo, su N° de serie, los accesorios que deja y la falla reportada.',
          'Al guardar se abre el comprobante para imprimir o enviar, con el enlace de seguimiento del cliente.',
        ],
        tip: 'Si el cliente no tiene correo registrado no le llegarán los avisos automáticos: compártele el enlace por WhatsApp.',
      },
      {
        id: 'diagnostico-presupuesto',
        title: 'Diagnosticar y presupuestar',
        permission: 'service:write',
        steps: [
          'Abre la orden y usa "Iniciar diagnóstico". Escribe "Qué tiene el equipo" (lo ve el cliente), asigna técnico, fecha comprometida y prioridad, y presiona "Guardar".',
          'En "Presupuesto" agrega repuestos del catálogo y "Mano de obra", y presiona "Guardar presupuesto".',
          'Usa "Enviar presupuesto al cliente": lo verá en su enlace (con IVA) y podrá aprobarlo o rechazarlo. Si lo aprueba en persona, marca "Aprobado en mesón".',
        ],
      },
      {
        id: 'reparar-entregar',
        title: 'Reparar, avisar y entregar',
        permission: 'service:write',
        steps: [
          'Con el presupuesto aprobado, "Pasar a reparación" y luego "Listo para retiro".',
          'Cada cambio de estado puede llevar una nota; marca "Visible para el cliente" si quieres que la vea en su enlace. La bitácora guarda todo el historial.',
          'Cuando retira, "Entregar al cliente".',
        ],
      },
      {
        id: 'cobrar-servicio',
        title: 'Cobrar la reparación',
        permission: 'service:write',
        steps: [
          'En la sección "Cobro", elige la bodega de los repuestos y la forma de pago y presiona "Generar nota de venta": los repuestos quedan reservados.',
          'Desde ahí usa "Emitir boleta o factura". Una reparación en garantía se cierra sin cobro.',
        ],
      },
      {
        id: 'tablero-servicio',
        title: 'Controlar el taller',
        steps: [
          'Arriba del listado ves cuántos equipos hay en taller, esperando aprobación, listos para retiro y atrasados.',
          'Filtra por estado y busca por N°, cliente, equipo o serie.',
        ],
      },
    ],
  },
  {
    id: 'calidad',
    key: 'hasQuality',
    permission: 'quality:read',
    chapter: 'Operaciones',
    title: 'Calidad y procedimientos',
    summary:
      'Procedimientos escritos con acuse de lectura del equipo, inspecciones de calidad por plantilla (materia prima, proceso y producto terminado) y la ficha de tus productores y proveedores con su % de lotes aprobados.',
    route: '/dashboard/quality',
    topics: [
      {
        id: 'procedimientos-gestionar',
        title: 'Documentar procedimientos y confirmar su lectura',
        steps: [
          'Ve a la pestaña Procedimientos. Con "Cargar paquete inicial" se crean 7 procedimientos en borrador y 4 plantillas de inspección para ajustar a tu forma de trabajar.',
          'Crea un "Nuevo procedimiento" o usa Editar. Si editas uno vigente, sube de versión y el equipo debe leerlo de nuevo.',
          'Publica el borrador cuando esté listo; usa "Marcar revisado" en los vigentes y Archivar en los que ya no se usan.',
          'Cada persona abre el procedimiento con Leer y confirma con "Leí y entendí". En cada tarjeta ves cuántas personas del equipo ya lo leyeron.',
        ],
      },
      {
        id: 'inspecciones-realizar',
        title: 'Registrar una inspección de calidad',
        permission: 'quality:write',
        steps: [
          'Ve a la pestaña Inspecciones y haz clic en "Nueva inspección".',
          'Elige la plantilla; en una de recepción elige también al productor. Agrega el número de lote.',
          'Completa cada parámetro: una medición, o "Cumple" / "No cumple". Verás "Aprobaría" o "No aprobaría" antes de guardar.',
          'Si no aprueba, anota la "Acción correctiva" (qué harás con el lote): es obligatoria y se avisa en la campanita.',
        ],
        tip: 'El resultado lo calcula el sistema con los rangos de la plantilla: no se puede "aprobar a mano" una inspección que no cumple.',
      },
      {
        id: 'productores-ver',
        title: 'Conocer a tus productores y proveedores',
        steps: [
          'Ve a la pestaña Productores: aparecen los contactos marcados como proveedor en Clientes & Proveedores.',
          'Haz clic en "Completar ficha" (o "Editar ficha") para anotar el tipo, qué te entrega y sus certificaciones.',
          'Revisa el porcentaje de lotes aprobados en las inspecciones de recepción de cada uno.',
        ],
      },
      {
        id: 'plantillas-parametros',
        title: 'Fijar los rangos de las plantillas de inspección',
        permission: 'quality:manage',
        steps: [
          'Ve a la pestaña Plantillas y haz clic en Editar.',
          'En cada medición define unidad, mínimo y máximo. Las plantillas iniciales vienen sin límites: fíjalos según la resolución sanitaria de tu producto.',
          'Agrega o quita parámetros y guarda la plantilla.',
        ],
      },
    ],
  },
  {
    id: 'tareas',
    key: 'hasTeamTasks',
    permission: 'tasks:read',
    chapter: 'Operaciones',
    title: 'Tareas y delegación',
    summary:
      'Quién hace qué y para cuándo, con rutinas que se repiten solas, y las decisiones que cada persona puede tomar sin consultar al dueño (y hasta qué monto).',
    route: '/dashboard/tasks',
    topics: [
      {
        id: 'tareas-crear-gestionar',
        title: 'Crear tareas y hacer que se repitan solas',
        steps: [
          'En la pestaña Mis tareas haz clic en "Nueva tarea".',
          'Define la fecha, la prioridad, el responsable y "Se repite" (cada día, semana o mes). Solo el dueño y los administradores pueden asignar tareas a otras personas.',
          'Con "Cargar rutinas recomendadas" se crean las rutinas de cierre semanal, stock, canal de origen, clientes inactivos y revisión de procedimientos.',
          'Usa Empezar, Hecha, Editar o Eliminar en cada tarea. Al marcar Hecha una tarea que se repite, se crea la siguiente.',
        ],
        tip: 'También puedes pedírselo al Asistente: "créame una tarea para revisar el stock todos los lunes".',
      },
      {
        id: 'tareas-equipo-ver',
        title: 'Ver las tareas del equipo y las ya cerradas',
        steps: [
          'La pestaña "Todo el equipo" muestra las tareas abiertas de todas las personas (para quien no administra, "Creadas por mí").',
          'Las vencidas se marcan en rojo y suman en el indicador de la parte superior.',
          'La pestaña Cerradas guarda las tareas hechas o canceladas.',
        ],
      },
      {
        id: 'delegacion-reglas',
        title: 'Escribir qué decisiones puede tomar cada persona',
        steps: [
          'Ve a la pestaña Delegación y haz clic en "Nueva regla" (o parte de una de las ideas sugeridas).',
          'Elige la decisión, la persona o el rol, y el monto y porcentaje máximos (vacío significa sin tope). Puedes agregar condiciones.',
          'Cualquier persona puede consultar "¿Puedo decidir esto yo?" e indicar un monto para saber si actúa sola o consulta al dueño.',
          'Las reglas orientan al equipo; los permisos de cada rol siguen mandando en el sistema.',
        ],
      },
    ],
  },
  {
    id: 'academia',
    key: 'hasAcademy',
    permission: 'academy:read',
    chapter: 'Operaciones',
    title: 'Academia',
    summary:
      'Para una academia de modelaje o similar: la ficha de cada alumna, la lista de asistencia por clase y el control de qué mensualidades están pagadas.',
    route: '/dashboard/academy',
    // Sin captura todavía: se genera con scripts/capture-manual-screenshots.ts contra una base local.
    screenshot: null,
    topics: [
      {
        id: 'academia-grupos',
        title: 'Crear los grupos de clases',
        steps: [
          'Ve a la pestaña Grupos y haz clic en "Nuevo grupo".',
          'Escribe el nombre (por ejemplo "Modelaje juvenil"), el horario y, si quieres, la mensualidad en pesos. Con ella, marcar un mes como pagado no pide el monto.',
          'Haz clic en "Guardar grupo". Solo el dueño y los administradores pueden crear o desactivar grupos.',
          'La pestaña Grupos es un tablero: una columna por grupo y una "Sin grupo". Arrastra a cada alumna a la columna de su grupo, o cámbialo con el selector de su tarjeta.',
        ],
      },
      {
        id: 'academia-inscripcion',
        title: 'Recibir inscripciones con un link',
        steps: [
          'Ve a la pestaña Inscripciones y haz clic en "Ver link de inscripción". Con "Copiar" lo llevas al portapapeles para compartirlo por WhatsApp, Instagram o tu sitio web.',
          'Quien se inscribe llena sus datos (y los de su apoderado si es menor de edad), elige un grupo de interés si quiere y acepta el aviso de privacidad. Su inscripción queda pendiente: todavía no es alumna.',
          'Te llega un aviso a la campanita y la pestaña muestra "Inscripciones" con el número por revisar.',
          'En cada inscripción elige el grupo y el primer mes de cobro, y haz clic en "Aprobar" para crear su ficha de alumna, o en "Rechazar".',
          'Si el link se difundió donde no debía, "Generar link nuevo" (solo dueño y administradores) invalida el anterior.',
        ],
        tip: 'El link solo funciona con el módulo Academia activo. Quien ya es alumna o ya tiene una inscripción pendiente no genera un duplicado.',
      },
      {
        id: 'academia-sitio',
        title: 'Publicar el sitio web de la academia',
        steps: [
          'Ve a la pestaña "Sitio web". La primera vez, escribe el nombre y la dirección del sitio (por ejemplo "academia-cr") y, si quieres partir con un borrador, haz clic en "Cargar textos de ejemplo". Luego haz clic en "Crear sitio".',
          'En "Portada" haz clic en "Subir foto" para la imagen grande de arriba. Completa la frase de portada, la promoción vigente (opcional) y "Quiénes somos".',
          'Agrega tus clases con "Agregar clase", los pasos de "Cómo funciona" con "Agregar paso", lo que recibe una alumna con "Agregar beneficio", y las preguntas con "Agregar pregunta". Con las flechas cambias el orden de cada lista.',
          'En "Carrusel de fotos" haz clic en "Agregar fotos" (puedes elegir varias). Cuenta tu historia y, si quieres, agrega a la dirección de la academia con su foto y reseña.',
          'En "Mensualidad y horarios" escribe la mensualidad si quieres publicarla (vacía = no se muestra) y decide si se muestran los grupos con su horario y cuántas alumnas tienes. Los grupos se leen en vivo de la pestaña Grupos.',
          'En "Contacto" escribe el WhatsApp, el correo y uno o varios Instagram separados por coma.',
          'Revisa "Qué le falta a tu sitio": los puntos marcados como obligatorios impiden publicar. Cuando esté listo, haz clic en "Publicar sitio". Con "Despublicar" el sitio deja de verse. Haz clic en la dirección que aparece arriba para verlo.',
        ],
        tip: 'El botón "Inscríbete" del sitio lleva al formulario de inscripción; al publicar se crea el link si aún no existía. El sitio nunca muestra alumnas, RUT, contactos ni pagos: solo lo que escribes aquí, los grupos con su horario y, si lo activas, el número de alumnas.',
      },
      {
        id: 'academia-fichas',
        title: 'Crear y consultar la ficha de una alumna',
        steps: [
          'En la pestaña Alumnas haz clic en "Nueva alumna".',
          'Completa nombre, RUT, fecha de nacimiento, dirección, contacto, contacto de emergencia, tallas (pantalón, polera, zapatos), observación especial (alergias), grupo y el "Primer mes de cobro". Si es menor de edad, agrega a su apoderado, y marca la autorización de imagen cuando la entregue.',
          'Haz clic en "Guardar ficha". Para verla de nuevo, haz clic en su nombre: muestra sus datos, los meses que debe y su asistencia.',
          'Con "Editar ficha" cambias sus datos y con "Dar de baja" (solo dueño y administradores) deja de aparecer en las listas, sin perder su historial. Con "Eliminar" (solo dueño y administradores) se borra la ficha, pero las mensualidades que pagó quedan registradas.',
        ],
        tip: 'En la lista, "Debe N meses" y "N ausencias seguidas" te avisan a quién hay que contactar.',
      },
      {
        id: 'academia-asistencia',
        title: 'Pasar lista',
        steps: [
          'Ve a la pestaña Pasar lista, elige el grupo y la fecha de la clase.',
          'Marca a cada alumna como Presente, Atrasada, Ausente o Justificada. "Todas presentes" marca a todas de una vez, y vuelves a tocar un botón para quitarlo.',
          'Haz clic en "Guardar lista". Si vuelves a abrir la misma fecha, la lista está como la dejaste.',
          'Una ausencia justificada no baja el porcentaje de asistencia de la alumna.',
        ],
      },
      {
        id: 'academia-mensualidades',
        title: 'Marcar la mensualidad pagada',
        steps: [
          'Ve a la pestaña Mensualidades y elige el mes (y, si quieres, el grupo).',
          'Cada alumna aparece como Pendiente o Pagada. Haz clic en "Marcar pagada"; si su grupo no tiene mensualidad, escribe antes el monto.',
          '"Desmarcar" deshace un pago marcado por error.',
          'Esto es solo un control interno: no emite boletas ni registra el pago en Tesorería.',
        ],
      },
    ],
  },
];
