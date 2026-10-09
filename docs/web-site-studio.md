# Estudio visual y diseñador IA

El constructor de sitios generales, el sitio de la academia y el sitio público
de cada certamen/evento comparten el motor de secciones, temas y lienzos.

## Edición visual

- En sitios generales: Contenido → **Crear lienzo libre**, o abre una sección
  y entra en **Estudio de lienzo**.
- En academia y certámenes/eventos: abre **Estudio visual**. Puedes agregar las
  secciones personalizadas antes o después del sitio principal. Los formularios,
  candidatas, horarios, entradas, votos y resultados conservan su flujo nativo.
- Un lienzo puede acompañar el contenido de una sección o reemplazar su
  presentación. El contenido original se conserva.
- Agrega texto, imágenes de la biblioteca, botones y formas. Arrastra, cambia
  el tamaño desde la esquina, ajusta capas, colores, bordes, sombras y rotación.
  Las flechas mueven el elemento; Mayús mueve cinco pasos. También hay campos
  numéricos, centrado, duplicación, bloqueo y ocultación.
- Ajusta posiciones y tamaños de texto para escritorio, tablet y móvil. Las
  posiciones heredan escritorio hasta editarlas. El tamaño de texto móvil tiene
  una adaptación independiente para conservar la lectura.
- Los movimientos respetan `prefers-reduced-motion`. Las imágenes siguen
  validándose por firma al subir y por empresa al guardar.

## IA

**Tu diseñador web con IA** aparece en los tres editores y en los estudios
visuales de academia y eventos. Describe público, identidad, objetivos y los
cambios que necesitas. Revisa la explicación, los cambios y la vista previa
antes de **Aplicar al editor**. Si editas mientras llega la propuesta, debes
generar otra para evitar sobrescribir ese trabajo.

El servidor comprueba permisos y propiedad del sitio, limita solicitudes por
empresa y valida la respuesta con los mismos esquemas del editor. La generación
no escribe en la base ni publica. Al aplicar se mantiene el comportamiento de
guardado de cada editor: los sitios generales guardan borradores; academia y
certámenes publicados muestran los cambios cuando los guardas.

Se reutilizan las variables existentes de Vercel:

- `NVIDIA_API_KEY` y `NVIDIA_MODEL_REASONING`: NVIDIA cuando está configurado,
  con respaldo en Gemini ante errores, modelos retirados o cuota agotada.
- `GEMINI_API_KEY`: Gemini como proveedor o respaldo.
- `GEMINI_MODEL_WEB_DESIGNER`: modelo Gemini específico del diseñador,
  opcional. Sin él se usa `GEMINI_MODEL_LITE` o el modelo predeterminado del
  cliente compartido. No cambia los modelos de los otros agentes.

Las claves permanecen en el servidor. La disponibilidad gratuita y las cuotas
dependen de la cuenta y del modelo del proveedor; la aplicación no garantiza
gratuidad ni crea suscripciones. La propuesta debe revisarse: la validación de
estructura no sustituye la comprobación de los hechos sugeridos por un modelo.

## Despliegue y validación

La migración `20261031120000_site_design_studio` añade
`Project.publicSiteDesign` como JSONB nullable. Es aditiva y los sitios antiguos
conservan su presentación. El estudio de academia se guarda en su JSON existente;
los sitios generales guardan el lienzo dentro del estilo de la sección.

Genera Prisma y aplica las migraciones mediante el flujo habitual de despliegue
antes de ejecutar este código en producción. No ejecutes seeds contra Neon.

Pruebas específicas:

```bash
npm test -- --runTestsByPath tests/web-sites-canvas.test.tsx tests/web-sites-ai-designer.test.ts tests/web-sites-ai-actions.test.ts
```

Estas pruebas verifican geometría, persistencia, renderizado, propiedad de
imágenes, validación de respuestas, autorización y errores de proveedor. No
hacen llamadas reales a Gemini/NVIDIA ni consumen su cuota.
