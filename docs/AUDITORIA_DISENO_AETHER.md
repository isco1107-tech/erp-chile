# Auditoría y rediseño de Aether ERP

Fecha: 9 de septiembre de 2026.

## Alcance

Revisión del shell autenticado, dashboard, navegación, autenticación, componentes compartidos y consultas del dashboard. Se ejecuta la suite existente de regresión. Esto no equivale a una auditoría integral de seguridad, contabilidad o integración con servicios externos.

## Dirección visual implementada

**Aether / Centro de operaciones.** Superficies marfil, tinta verde, acento vegetal y órbitas geométricas como firma visual. La composición distingue contexto, siguiente acción, prioridades, indicadores y análisis. Las órbitas son decorativas: no representan porcentajes ni resultados inventados.

- Portada con saludo y fecha chilena, empresa, cantidad real de módulos y categorías con alertas. La acción principal utiliza los permisos y módulos existentes.
- Prioridades enlazadas a inventario, compras, cobros y contratos; incluye cuotas y pagarés vencidos.
- Indicadores con cifras adaptables, tonos semánticos y jerarquía por dominio.
- Gráfico con períodos de 6 y 12 meses y estado vacío explícito.
- Navegación por grupos plegables, una sola ruta activa, ubicación contextual y salto al contenido.
- Acceso, recuperación de contraseña y demás pantallas que comparten `AuthShell` con la misma identidad.
- Colores de empresa conservados mediante los tokens existentes, incluidos diálogos y selectores que se renderizan en portales.
- Foco visible, menú móvil cerrado fuera del orden de tabulación, Escape, retorno de foco y contención del teclado al abrirlo.

Los cambios están implementados en componentes reales. Los datos de ejemplo existen exclusivamente en el script local de revisión visual, que no accede a Prisma ni modifica usuarios o sesiones.

## Hallazgos

| Prioridad | Evidencia | Resultado |
| --- | --- | --- |
| Alta | `DialogPortal`, `AlertDialogPortal` y `SelectContent` montaban contenido fuera del contenedor `.theme-saas-light`, perdiendo sus variables CSS y la paleta de empresa. | Corregido mediante `WorkspaceTheme` y `PortalTheme`. Las pantallas sin proveedor conservan su tema. |
| Media | `SidebarNav` activaba tanto una ruta padre como su descendiente; los grupos plegables no anunciaban su estado. | Se elige el enlace coincidente más específico; `aria-current`, `aria-expanded` y `aria-controls`. |
| Media | `MobileNavDrawer` solo desplazaba el menú fuera de pantalla; no gestionaba Escape, bloqueo de scroll ni foco. | Visibilidad responsive, cierre, contención y restauración de foco. |
| Media | Acción sugerida al final de una lista potencialmente extensa de indicadores. | Acción accesible en la portada, antes de los indicadores. |
| Media | Descripciones truncadas en `ActionCard` y cifras grandes con tamaño fijo. | Texto de varias líneas y cifras adaptables. |
| Media | Formulario de acceso sin autocompletado explícito ni asociación entre errores y campos. | `autocomplete`, `aria-invalid` y `aria-describedby`. |
| Media | Portada y acceso tenían lenguajes visuales distintos, con marcas de agua que competían con el contenido. | Lenguaje compartido; decoración contenida y marca de empresa discreta. |
| Alta, pendiente | `dashboard/page.tsx`: `salesDocument.findMany` aplica `take: 1000` antes de calcular indicadores y series de doce meses. | Con más de 1.000 documentos, los meses anteriores podrían quedar incompletos. Conviene agregar en base de datos por período y consultar los documentos recientes aparte. No se alteró el cálculo contable como parte del rediseño. |
| Media, pendiente | `dashboard/page.tsx`: períodos de cálculo basados en UTC, mientras el saludo y fecha visibles usan `America/Santiago`. | Revisar la definición de fecha comercial y probar límites de día/mes antes de modificar las consultas. |

## Verificación

- `npm run typecheck`: aprobado.
- `npm run lint`: 0 errores; 17 advertencias existentes en otros componentes y utilidades.
- `npm test -- --silent`: 21 suites y 362 pruebas aprobadas.
- `node scripts/verify-design.mjs`: aprobado. Monta los componentes reales en un servidor local efímero con datos de ejemplo, comprueba escritorio/móvil, selección de período, tema del diálogo, selector, navegación anidada, teclado del menú móvil y validación de acceso. Genera capturas en `.next/design-review/`.

Capturas conservadas: [dashboard de escritorio](design/dashboard-desktop.png), [dashboard móvil](design/dashboard-mobile.png), [acceso de escritorio](design/login-desktop.png) y [acceso móvil](design/login-mobile.png).

El script visual sustituye únicamente los adaptadores de navegación de Next y usa una fuente de sistema. No valida autenticación real, carga de datos de empresa ni la tipografía de `next/font`. El servidor Next ya existente en el puerto 3457 no respondió a `/login` dentro de 120 segundos durante esta revisión; la verificación visual aislada permite revisar los componentes sin cambiar ese proceso ni introducir un acceso alternativo a la aplicación.

## Continuidad

Para nuevos módulos, reutilizar los tokens semánticos y los componentes compartidos. Reservar el bloque oscuro con órbitas para vistas de resumen; tablas y formularios necesitan superficies claras y densidad útil. Mantener las acciones condicionadas por permisos y mostrar estados vacíos explícitos. Priorizar la agregación completa de ventas antes de usar el dashboard como fuente definitiva de cifras financieras en empresas de alto volumen.
