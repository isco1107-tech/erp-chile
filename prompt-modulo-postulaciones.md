# Prompt — Módulo de postulaciones de candidatas

> Pegar completo en Claude Code, ubicado en la raíz del repositorio del ERP.

---

Vas a implementar un módulo completo de postulaciones de candidatas en este ERP: la página pública de inscripción, el endpoint que la recibe, el almacenamiento y el panel de administración interno. Es para la franquicia de un certamen de belleza en Temuco, Región de La Araucanía, Chile.

## Reglas de trabajo

- Primero **lee el repositorio y entiende sus convenciones**: estructura de carpetas, capa de acceso a datos, sistema de rutas, autenticación, permisos, motor de plantillas y estilo de las vistas existentes. Sigue esas convenciones. No introduzcas un patrón, librería o framework nuevo si el proyecto ya resuelve eso de otra forma.
- Si algún punto de esta especificación choca con la arquitectura actual, **adáptalo y anótalo** en el resumen final en vez de forzarlo.
- No modifiques módulos ajenos a esta funcionalidad.
- No hagas preguntas intermedias. Ejecuta todo y entrégame el resumen al final.
- Todo el texto visible para el usuario va en español de Chile.

---

## 1. Modelo de datos

Crea las migraciones correspondientes.

### `convocatorias`
Permite reutilizar el módulo cada año y tener más de un formulario vivo.

`id` PK · `nombre` varchar(150) · `slug` varchar(80) UNIQUE · `token_publico` char(32) UNIQUE · `fecha_apertura` datetime · `fecha_cierre` datetime · `estado` enum(`borrador`,`abierta`,`cerrada`,`archivada`) · `edad_minima` smallint (default 18) · `cupo_maximo` int NULL · `created_at` · `updated_at`

### `postulaciones`

`id` PK · `convocatoria_id` FK → `convocatorias.id` ON DELETE RESTRICT · `folio` varchar(20) UNIQUE · `nombre_completo` varchar(180) · `rut` varchar(12) *(normalizado, sin puntos ni guion)* · `fecha_nacimiento` date · `email` varchar(180) · `telefono` varchar(30) · `comuna` varchar(80) · `direccion` varchar(200) · `estatura_cm` smallint · `ocupacion` varchar(150) · `instagram` varchar(80) NULL · `idiomas` varchar(200) NULL · `experiencia` text NULL · `motivacion` text · `causa_social` text · `estado` enum(`recibida`,`en_revision`,`citada_casting`,`preseleccionada`,`finalista`,`descartada`) · `motivo_descarte` varchar(255) NULL · `puntaje` decimal(4,2) NULL · `acepta_marketing` boolean · `ip_origen` varchar(45) · `user_agent` varchar(255) · `created_at` · `updated_at`

Restricción `UNIQUE (convocatoria_id, rut)` — una postulación por persona por convocatoria.
Índices en `convocatoria_id`, `estado`, `created_at` y `rut`.

### `postulacion_archivos`
`id` · `postulacion_id` FK ON DELETE CASCADE · `tipo` enum(`rostro`,`cuerpo_entero`,`documento`) · `nombre_original` · `ruta_almacenada` · `mime` · `tamano_bytes` · `hash_sha256` · `created_at`

### `postulacion_historial`
Bitácora de auditoría: `id` · `postulacion_id` · `usuario_id` FK a usuarios del ERP (nullable para acciones del sistema) · `accion` · `valor_anterior` · `valor_nuevo` · `created_at`.
Se escribe en cada cambio de estado, edición y descarga de fotografía.

---

## 2. Folio y transaccionalidad

Formato `TMC-{año}-{correlativo de 4 dígitos}` → `TMC-2027-0043`.

**No lo generes con `SELECT MAX(folio)+1`.** Usa una secuencia de base de datos, o una fila contador con `SELECT ... FOR UPDATE`, dentro de la misma transacción que inserta la postulación. Si dos personas envían el formulario en el mismo segundo no pueden recibir el mismo folio.

Insertar la postulación, guardar los archivos y escribir el historial va todo dentro de **una sola transacción con rollback**. Si falla la escritura de una fotografía no puede quedar una postulación huérfana sin fotos.

---

## 3. Endpoint público

`POST /postular/{token_publico}` — sin autenticación, accesible desde internet, recibe `multipart/form-data`.

Valida **en el servidor** (la validación del navegador es comodidad, no seguridad):

- La convocatoria existe, está `abierta`, y la fecha actual cae entre apertura y cierre. Si no, responde 403 con mensaje claro.
- RUT válido por módulo 11 y no duplicado en esta convocatoria. Si ya existe, responde 409 indicándolo.
- Edad calculada ≥ `edad_minima` a la fecha de envío.
- Correo con formato válido y largo máximo en todos los campos de texto.
- Las tres declaraciones obligatorias vienen marcadas.
- Archivos: máximo 5 MB cada uno, y verifica el **tipo MIME real leyendo los primeros bytes**, no la extensión ni el header del navegador. Solo JPEG y PNG. Renombra a un UUID; nunca uses el nombre original en la ruta.

Protecciones:

- Límite de envíos por IP (5 por hora) contra spam automatizado.
- Campo honeypot oculto: si viene con contenido, responde 200 y descarta silenciosamente.
- Consultas preparadas en todo. Nada de SQL concatenado.
- Escapa el texto al mostrarlo en el panel: la motivación es texto libre de origen público.

Respuesta exitosa: `200` con `{"folio": "TMC-2027-0043"}`.

Después de confirmar la transacción —y fuera de ella, para que un fallo de SMTP no revierta la postulación— encola dos correos: confirmación con el folio a la candidata, y aviso de nueva postulación a la organización.

---

## 4. Almacenamiento de fotografías

Guárdalas **fuera del directorio público del servidor web**, inaccesibles adivinando una URL. Sírvelas por una ruta autenticada del ERP que verifique sesión y permisos, y que registre cada descarga en `postulacion_historial`.

---

## 5. Página pública de inscripción

Una página autocontenida, servida en `/inscripcion/{slug}`, responsiva y sin dependencias de build.

### Contenido, en este orden

1. **Hero** a pantalla completa con imagen de fondo, nombre del certamen, título, bajada, botón que baja al formulario, y una línea con la fecha de cierre y la fecha de casting.
2. **Convocatoria** — dos o tres párrafos sobre qué es y cómo funciona el proceso.
3. **Requisitos** — lista: 18 años cumplidos sin edad máxima; nacionalidad chilena o residencia definitiva; residir en La Araucanía; disponibilidad para ensayos; sin condenas por crimen o simple delito.
4. **Cómo inscribirse** — cuatro pasos numerados: reunir datos y fotos, completar el formulario, recibir el folio, esperar el contacto.
5. **Formulario**, agrupado en cuatro bloques:
   - *Datos personales*: nombre completo, RUT, fecha de nacimiento, correo, teléfono, comuna (select con las comunas de La Araucanía), dirección.
   - *Perfil*: estatura en cm, Instagram (opcional), ocupación o estudios, idiomas (opcional), experiencia previa (opcional), motivación (mínimo 80 caracteres, con contador visible), causa social que impulsaría.
   - *Fotografías*: rostro y cuerpo entero, JPG o PNG, máximo 5 MB, sin filtros.
   - *Declaraciones*: cumple requisitos y datos verídicos; autoriza tratamiento de datos; acepta las bases. Más una casilla opcional de marketing, separada de las anteriores.
6. **Pie** con contacto, WhatsApp, Instagram, bases y política de privacidad.

### Comportamiento

- Validación en el navegador antes de enviar: RUT con dígito verificador por módulo 11 y autoformateo al salir del campo; edad ≥ 18 calculada desde la fecha de nacimiento; correo; peso de archivos; declaraciones obligatorias. Los mensajes de error van bajo cada campo, en español y explicando cómo corregir, no "campo inválido".
- Al enviar, deshabilita el botón, y al recibir respuesta muestra una pantalla de éxito con el folio destacado.
- Si el envío falla, mensaje que diga qué pasó y qué hacer, dejando el formulario intacto con los datos escritos.
- Un bloque `CONFIG` al inicio del script con endpoint, nombre del certamen, textos del hero, fechas, correos y enlaces, para que la organización pueda editarlos sin tocar el resto.
- La imagen de fondo del hero debe salir de una sola variable CSS al inicio del archivo, comentada, para poder cambiarla en un segundo.

### Dirección visual

No hagas una landing genérica. Concretamente:

- **Paleta**: noche indigo profunda `#101638` / `#0A0E24` como base, champán `#E3C88F` y oro viejo `#A8823F` como acento, blanco hueso `#F7F4EF` para las secciones claras, y un carmín de copihue `#8E1B32` para acciones y errores — es la flor nacional y de la zona, así que ancla la página a la región en vez de ser un dorado de catálogo.
- **Tipografía**: `Italiana` para títulos y números, `Karla` para el cuerpo, desde Google Fonts. Nada de Playfair ni Cormorant.
- **Hero**: la imagen manda. Encuádrala con un filete dorado interior con marcas en las esquinas opuestas, un campo de estrellas discreto y estático, y el título en Italiana muy grande sobre un velo oscuro. Una sola animación de entrada escalonada al cargar, nada más.
- Campos de formulario **sin border-radius**, con borde de un pixel. Nada de tarjetas redondeadas con sombra gris. La estructura se marca con filetes y espacio, no con cajas.
- Sin etiquetas en mayúsculas rastreadas sobre cada título, sin flechas `→` pegadas a los botones, sin degradados decorativos, sin animaciones al hacer scroll en cada sección.
- Los pasos van numerados porque son una secuencia real; ningún otro listado lleva números.
- Piso de calidad: responsiva hasta 360px, foco de teclado visible, `prefers-reduced-motion` respetado, contraste suficiente, `<label>` real asociado a cada campo.

### Copy

Escríbelo tú, en español de Chile, tratando de usted informal (tuteo). Directo y cálido, sin lenguaje de marketing inflado. Los botones dicen lo que hacen: "Enviar mi postulación", no "Enviar".

---

## 6. Panel de administración

Dentro del ERP, respetando el sistema de permisos existente:

- **Listado** con filtros por convocatoria, estado, comuna y rango de edad; búsqueda por nombre, RUT o folio; paginación del lado del servidor. No traigas todo a memoria.
- **Ficha individual** con todos los datos, las fotografías, el historial de cambios y un campo de notas internas.
- **Cambio de estado** con motivo obligatorio al descartar. Cada cambio queda registrado con el usuario que lo hizo.
- **Exportación a Excel o CSV** de las postulaciones filtradas, sin fotografías.
- **Gestión de convocatorias**: crear, abrir, cerrar, y generar el link público con botón de copiar y contador de postulaciones recibidas.
- **Permisos**: el acceso a datos de contacto y fotografías debe requerir un permiso distinto del de solo lectura del listado.

---

## 7. Protección de datos

El módulo trata datos personales de terceros, incluyendo domicilio e imagen, bajo la Ley 19.628 y la Ley 21.719:

- Registra en `postulacion_historial` quién consulta y descarga fotografías.
- Implementa una acción de **eliminación** que borre la postulación y sus archivos físicos, para responder a una solicitud de la titular.
- Implementa una **purga por retención**: comando programable que elimine postulaciones descartadas con más de N meses. N configurable.
- Nunca envíes fotografías por correo ni las expongas en enlaces sin caducidad.
- Nunca escribas datos de la candidata en logs de aplicación.

---

## 8. Entregable

Al terminar, entrégame un resumen con:

1. Archivos creados y modificados.
2. Migraciones a ejecutar y en qué orden.
3. La ruta pública generada y cómo obtener el link de una convocatoria.
4. Permisos nuevos que hay que asignar a los roles.
5. Variables de entorno o configuración que debo completar (SMTP, ruta de almacenamiento de archivos, etc.).
6. Puntos donde te desviaste de esta especificación por la arquitectura existente, y por qué.
