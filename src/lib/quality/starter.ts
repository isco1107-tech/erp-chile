import type { QualityParameter } from './inspection';

/**
 * Contenido inicial para una elaboradora de jugos y aguas. Es un punto de
 * partida editable: los procedimientos entran como BORRADOR y las plantillas
 * sin límites numéricos, porque el rango correcto depende de la resolución
 * sanitaria de cada producto (no se inventan cifras).
 */

export interface StarterProcedure {
  title: string;
  category: 'OPERACION' | 'CALIDAD' | 'HIGIENE' | 'VENTAS' | 'ADMINISTRACION' | 'INDUCCION';
  summary: string;
  content: string;
  reviewEveryDays: number;
}

export interface StarterTemplate {
  name: string;
  kind: 'INCOMING' | 'IN_PROCESS' | 'FINISHED';
  parameters: QualityParameter[];
}

const check = (key: string, name: string): QualityParameter => ({ key, name, type: 'CHECK', required: true });
const num = (key: string, name: string, unit?: string): QualityParameter => ({ key, name, type: 'NUMBER', unit, min: null, max: null, required: true });

export const STARTER_PROCEDURES: StarterProcedure[] = [
  {
    title: 'Recepción de fruta de productores',
    category: 'OPERACION',
    summary: 'Cómo recibir, pesar, revisar y registrar la fruta que llega desde productores locales.',
    content:
      '1. Saluda al productor y recibe la guía de despacho o el documento de entrega.\n2. Revisa a la vista las jabas o bins: fruta dañada, con moho o con madurez inadecuada.\n3. Pesa la carga total y descuenta el peso de los envases.\n4. Toma una muestra y mide grados Brix y temperatura.\n5. Asigna el código de lote interno anotando al productor y la fecha de recepción.\n6. Lleva la fruta aprobada a frío o a la zona de proceso; la rechazada, aparte y avisando al productor.\n7. Firma la recepción y entrega la copia al productor.',
    reviewEveryDays: 90,
  },
  {
    title: 'Elaboración de un lote de jugo',
    category: 'OPERACION',
    summary: 'Pasos de lavado, extracción, formulación, llenado, sellado y etiquetado de un lote.',
    content:
      '1. Verifica que la zona, los recipientes y los equipos estén limpios y sanitizados.\n2. Lava y desinfecta la fruta seleccionada.\n3. Extrae el jugo o la pulpa con el equipo de la planta.\n4. Prepara la mezcla según la receta registrada en el sistema (Producción → Recetas).\n5. Aplica el tratamiento térmico definido en la ficha técnica del producto.\n6. Llena los envases limpios.\n7. Sella de inmediato y enfría el producto.\n8. Etiqueta con el código de lote y la fecha de vencimiento, y completa la inspección de llenado.',
    reviewEveryDays: 90,
  },
  {
    title: 'Higiene de la planta y del personal',
    category: 'HIGIENE',
    summary: 'Aseo personal y limpieza diaria de la planta productiva.',
    content:
      '1. Ponte la ropa de trabajo completa: cofia, mascarilla, pechera y calzado limpio.\n2. Lávate manos y antebrazos con jabón durante 20 segundos antes de tocar insumos.\n3. Al terminar el turno, retira restos orgánicos de mesones, máquinas y pisos.\n4. Aplica detergente de uso alimentario en las superficies y friega.\n5. Enjuaga con abundante agua potable hasta sacar todo el detergente.\n6. Aplica el sanitizante en mesones y equipos que tocan el producto.\n7. Anota la limpieza en la revisión de higiene del sistema.',
    reviewEveryDays: 30,
  },
  {
    title: 'Despacho a supermercados y clientes Horeca',
    category: 'VENTAS',
    summary: 'Preparación, control y entrega de pedidos a supermercados y clientes Horeca.',
    content:
      '1. Revisa el pedido y retira los productos desde bodega.\n2. Verifica que los envases estén limpios y con lote y vencimiento visibles.\n3. Si el producto va refrigerado, comprueba la temperatura del vehículo antes de cargar.\n4. Carga las cajas firmes y protegidas de golpes.\n5. Emite la guía de despacho o factura y adjunta los documentos del pedido.\n6. Coordina la llegada a la hora acordada con el cliente.\n7. Pide la firma y timbre de recepción al entregar, y guarda una copia.',
    reviewEveryDays: 90,
  },
  {
    title: 'Reclamos y devoluciones de clientes',
    category: 'VENTAS',
    summary: 'Cómo registrar, evaluar y responder un reclamo o devolución.',
    content:
      '1. Registra el reclamo: fecha, cliente, producto, lote y motivo.\n2. Pide fotos o coordina el retiro del producto afectado.\n3. Ubica el lote en bodega y aparta las unidades restantes hasta revisarlas.\n4. Revisa la muestra guardada del lote para entender la causa.\n5. Decide la respuesta: reposición, nota de crédito o rechazo fundamentado.\n6. Responde al cliente dentro de 48 horas.\n7. Anota qué se corrigió para que no se repita y registra un seguimiento en Fidelización.',
    reviewEveryDays: 60,
  },
  {
    title: 'Cierre semanal: ingresos, costos y stock',
    category: 'ADMINISTRACION',
    summary: 'Rutina semanal para tener claros los números del negocio.',
    content:
      '1. Cuenta físicamente materias primas, envases y producto terminado.\n2. Ajusta en el sistema cualquier diferencia contra el stock contado (Inventario → Toma de inventario).\n3. Registra las compras de fruta e insumos de la semana.\n4. Registra las ventas y despachos de la semana.\n5. Anota los costos de la semana: transporte, servicios e insumos menores.\n6. Revisa el margen por producto y el flujo de caja de las próximas semanas.\n7. Marca esta tarea como hecha: se repite sola la semana siguiente.',
    reviewEveryDays: 30,
  },
  {
    title: 'Inducción del primer día de un colaborador',
    category: 'INDUCCION',
    summary: 'Qué debe ver y aprender una persona nueva durante su primera semana.',
    content:
      '1. Dale la bienvenida, preséntale al equipo y explícale cómo se trabaja aquí.\n2. Entrega la ropa de trabajo y los elementos de protección.\n3. Enséñale las normas de higiene y manipulación de alimentos.\n4. Recorre con esa persona recepción, proceso, bodega y baños.\n5. Explica cómo funcionan y qué riesgos tienen las máquinas del área donde trabajará.\n6. Acompáñala en sus tareas durante los primeros tres días.\n7. Pídele que lea y confirme en el sistema los procedimientos de su área (Calidad → Procedimientos).\n8. Revisa con ella al final de la semana qué quedó claro y qué no.',
    reviewEveryDays: 180,
  },
];

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    name: 'Recepción de fruta',
    kind: 'INCOMING',
    parameters: [
      num('peso_recibido', 'Peso recibido', 'kg'),
      num('grados_brix', 'Grados Brix', '°Bx'),
      num('temperatura_fruta', 'Temperatura de la fruta', '°C'),
      check('sin_pudricion_moho', 'Sin signos de pudrición o moho'),
      check('envases_limpios', 'Envases limpios y en buen estado'),
      check('documentacion_completa', 'Documentación del productor completa'),
    ],
  },
  {
    name: 'Control durante el llenado',
    kind: 'IN_PROCESS',
    parameters: [
      num('temperatura_llenado', 'Temperatura de llenado', '°C'),
      num('grados_brix_mezcla', 'Grados Brix de la mezcla', '°Bx'),
      num('ph_mezcla', 'pH de la mezcla'),
      check('sellado_correcto', 'Sellado hermético correcto'),
      check('volumen_correcto', 'Volumen de envasado correcto'),
    ],
  },
  {
    name: 'Liberación de producto terminado',
    kind: 'FINISHED',
    parameters: [
      check('etiqueta_lote_vencimiento', 'Etiqueta con lote y vencimiento'),
      check('envase_sin_fugas', 'Envase sin deformaciones ni fugas'),
      check('color_olor_ok', 'Color y olor característicos'),
      num('temperatura_almacenamiento', 'Temperatura de almacenamiento', '°C'),
      num('unidades_lote', 'Unidades del lote', 'unid'),
    ],
  },
  {
    name: 'Revisión de higiene de la planta',
    kind: 'IN_PROCESS',
    parameters: [
      check('personal_con_indumentaria', 'Personal con ropa de trabajo completa'),
      check('equipos_desinfectados', 'Mesones y equipos desinfectados'),
      check('pisos_desagues_limpios', 'Pisos y desagües limpios'),
      check('sin_plagas_residuos', 'Sin plagas ni residuos'),
      num('concentracion_sanitizante', 'Concentración del sanitizante', 'ppm'),
    ],
  },
];
