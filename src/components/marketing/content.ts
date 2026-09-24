/**
 * Texto comercial compartido por la landing y sus datos estructurados
 * (JSON-LD). Vive aquí para que la respuesta que ve Google sea, palabra por
 * palabra, la que ve la persona en pantalla.
 */

export const faqs: [question: string, answer: string][] = [
  ['¿Cuánto cuesta y cómo lo contrato?', 'La cotización se prepara según los módulos y el alcance que necesita tu empresa. Selecciona tus áreas de interés en el formulario y solicita una demo por correo. Antes de contratar, podrás revisar la propuesta y resolver tus dudas con el equipo de Aether.'],
  ['¿Qué incluye Aether ERP?', 'Aether reúne gestión comercial, inventario, compras, tesorería, contabilidad y producción de certámenes y eventos. Los módulos disponibles para tu empresa dependen de su configuración y de los servicios contratados.'],
  ['¿Puedo traer los datos que ya tengo?', 'Sí. Puedes cargar productos, clientes, proveedores, stock inicial e historial de ventas y compras desde planillas Excel o CSV. La carga revisa los datos antes de confirmarlos, así que no empiezas de cero ni digitas todo de nuevo.'],
  ['¿Necesito instalar algo para usarlo?', 'Puedes acceder desde el navegador. El cliente de escritorio es una alternativa para abrir Aether en una ventana propia. Ambas opciones utilizan la misma plataforma y requieren conexión a internet.'],
  ['¿La descarga incluye una cuenta o una licencia?', 'No. La descarga del cliente no tiene costo, pero para operar necesitas una cuenta activa y acceso a una empresa habilitada en Aether. Instalarlo no activa una suscripción ni crea una empresa automáticamente.'],
  ['¿Está preparado para empresas chilenas?', 'Incluye RUT, IVA, folios CAF, timbre electrónico y reportes como F29. La firma digital y el envío automático al SII todavía no están disponibles. Revisa con nuestro equipo el alcance tributario y la configuración que necesita tu empresa antes de contratar.'],
  ['¿Puedo gestionar más de una empresa?', 'Sí. Aether organiza usuarios, permisos y módulos por empresa para que cada equipo acceda a la información que le corresponde.'],
  ['¿Quién puede ver la información de mi empresa?', 'Solo las personas que invites, con el acceso que les asignes. Cada consulta queda acotada a tu empresa, las contraseñas se guardan cifradas y las acciones relevantes quedan registradas para auditoría.'],
  ['¿Puedo llevarme mis datos si me voy?', 'Sí. Cualquier persona con el permiso de exportación puede descargar la información completa de la empresa en formato JSON, sin contraseñas ni credenciales en el archivo.'],
  ['¿Por qué el sistema puede mostrar una advertencia al instalar?', 'Estos instaladores todavía no cuentan con certificados comerciales de firma. Windows puede mostrar una advertencia de editor desconocido; macOS puede solicitar autorización en Privacidad y seguridad. Si tu equipo exige aplicaciones firmadas, puedes utilizar la versión web.'],
];

export interface TrustFact {
  title: string;
  text: string;
}

/**
 * Reemplaza a los testimonios: sin clientes que citar todavía, la prueba de
 * confianza son hechos verificables del producto (cada uno debe poder
 * comprobarse leyendo el código, no una promesa de marketing).
 */
export const trustFacts: TrustFact[] = [
  { title: 'Timbre electrónico verificable', text: 'Cada DTE se firma con la llave del propio CAF y se puede comprobar sin conexión.' },
  { title: 'Respaldo completo por empresa', text: 'Exporta toda tu información en un archivo JSON, sin contraseñas ni credenciales.' },
  { title: 'Registro de auditoría', text: 'Las acciones que importan quedan con fecha, autor y detalle.' },
  { title: 'Datos cifrados de fábrica', text: 'Contraseñas con bcrypt y folios CAF con AES-256-GCM: nunca en texto plano.' },
];
