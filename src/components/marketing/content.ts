/**
 * Texto comercial compartido por la landing y sus datos estructurados
 * (JSON-LD). Vive aquí para que la respuesta que ve Google sea, palabra por
 * palabra, la que ve la persona en pantalla.
 */

export const faqs: [question: string, answer: string][] = [
  ['¿Cuánto cuesta y cómo lo contrato?', 'La cotización se prepara según los módulos y el alcance que necesita tu empresa. Selecciona tus áreas de interés en el formulario y solicita una demo por correo. Antes de contratar, podrás revisar la propuesta y resolver tus dudas con el equipo de Aether.'],
  ['¿Qué incluye Aether ERP?', 'Aether reúne gestión comercial, inventario, compras, tesorería, contabilidad y producción de eventos. Los módulos disponibles para tu empresa dependen de su configuración y de los servicios contratados.'],
  ['¿Puedo traer los datos que ya tengo?', 'Sí. Puedes cargar productos, clientes, proveedores, stock inicial e historial de ventas y compras desde planillas Excel o CSV. La carga revisa los datos antes de confirmarlos, así que no empiezas de cero ni digitas todo de nuevo.'],
  ['¿Necesito instalar algo para usarlo?', 'Puedes acceder desde el navegador. El cliente de escritorio es una alternativa para abrir Aether en una ventana propia. Ambas opciones utilizan la misma plataforma y requieren conexión a internet.'],
  ['¿La descarga incluye una cuenta o una licencia?', 'No. La descarga del cliente no tiene costo, pero para operar necesitas una cuenta activa y acceso a una empresa habilitada en Aether. Instalarlo no activa una suscripción ni crea una empresa automáticamente.'],
  ['¿Está preparado para empresas chilenas?', 'Incluye RUT, IVA, folios CAF, timbre electrónico y reportes como F29. La firma digital y el envío automático al SII todavía no están disponibles. Revisa con nuestro equipo el alcance tributario y la configuración que necesita tu empresa antes de contratar.'],
  ['¿Puedo gestionar más de una empresa?', 'Sí. Aether organiza usuarios, permisos y módulos por empresa para que cada equipo acceda a la información que le corresponde.'],
  ['¿Quién puede ver la información de mi empresa?', 'Solo las personas que invites, con el acceso que les asignes. Cada consulta queda acotada a tu empresa, las contraseñas se guardan cifradas y las acciones relevantes quedan registradas para auditoría.'],
  ['¿Puedo llevarme mis datos si me voy?', 'Sí. Cualquier persona con el permiso de exportación puede descargar la información completa de la empresa en formato JSON, sin contraseñas ni credenciales en el archivo.'],
  ['¿Por qué el sistema puede mostrar una advertencia al instalar?', 'Estos instaladores todavía no cuentan con certificados comerciales de firma. Windows puede mostrar una advertencia de editor desconocido; macOS puede solicitar autorización en Privacidad y seguridad. Si tu equipo exige aplicaciones firmadas, puedes utilizar la versión web.'],
];

export interface Plan {
  name: string;
  audience: string;
  /**
   * Precio mensual "desde", en CLP enteros y sin IVA. `null` muestra "Precio
   * según módulos". Poner aquí solo precios reales vigentes: lo que se publica
   * en el landing es una oferta comercial.
   */
  priceFrom: number | null;
  featured?: boolean;
  includes: string[];
}

export const plans: Plan[] = [
  {
    name: 'Comercio',
    audience: 'Para quien vende productos y mueve bodega: tiendas, distribuidoras y ferreterías.',
    priceFrom: null,
    includes: [
      'Ventas y facturación con folios CAF y timbre',
      'Punto de venta con boleta y arqueo de caja',
      'Inventario multibodega con costo PMP',
      'Compras, órdenes y recepción',
      'Clientes, proveedores y reportes Excel',
    ],
  },
  {
    name: 'Gestión completa',
    audience: 'Para la empresa que quiere operación, finanzas y contabilidad en el mismo sistema.',
    priceFrom: null,
    featured: true,
    includes: [
      'Todo lo del plan Comercio',
      'Cuentas por cobrar y pagar con antigüedad de saldos',
      'Contabilidad automática: diario, mayor y balance de 8 columnas',
      'F29 del período y cuadraturas contra el mayor',
      'Presupuestos, automatizaciones y agentes de IA',
    ],
  },
  {
    name: 'Eventos y certámenes',
    audience: 'Para productoras que además de producir tienen que rendir cuentas.',
    priceFrom: null,
    includes: [
      'Proyectos con presupuesto por evento',
      'Escaleta en vivo, vestuario y acreditaciones QR',
      'Auspicios con portal para cada marca',
      'Venta de entradas y votación del público',
      'Jurado con escrutinio en línea',
    ],
  },
];

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
}

/**
 * Solo testimonios REALES, con autorización escrita de quien los da. Mientras
 * la lista esté vacía, la sección no se muestra: un testimonio inventado en
 * una página comercial es publicidad engañosa.
 */
export const testimonials: Testimonial[] = [];
