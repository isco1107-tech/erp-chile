# Marco legal y operativo de Aether ERP

Estado al 3 de octubre de 2026. Este directorio reúne las políticas que rigen la operación de la plataforma y la lista de lo que falta para ofrecerla a clientes con el menor riesgo posible.

> **No es asesoría legal.** Los textos describen lo que el sistema hace hoy y siguen prácticas habituales en Chile, pero **un abogado debe revisarlos antes de firmar el primer contrato**. Donde hay una cifra o un plazo legal que no está confirmado, el documento lo dice.

## Documentos públicos (los ve el cliente o el público)

| Documento | Dónde | Para qué |
|---|---|---|
| Términos de servicio | `/aether/terminos` (`src/app/aether/terminos/page.tsx`) | Contrato con la empresa cliente: responsabilidades, tope de responsabilidad, término, borrado de datos, IA, eventos, tribunales. |
| Política de privacidad de la plataforma | `/aether/privacidad` | Qué datos trata Aether como plataforma y cómo los protege. |
| Contrato de encargo de tratamiento | `/aether/encargado` | Obligaciones de Aether como encargado de los datos de cada cliente (Ley 21.719). |
| Subencargados | `/aether/subencargados` | Proveedores que tratan datos y dónde están. |
| Política de la postulación | `/politica-privacidad?certamen=…` | Datos de candidatas (incluye sensibles y menores). |
| Aviso de privacidad de formularios públicos | `/aviso-privacidad?flujo=…&t=…` | Entradas, votos, cuotas, portal del auspiciador y encuesta. Enlazado al pie de cada formulario. |
| Formulario de derechos | `/derechos/[token]` | Acceso, rectificación, supresión, oposición, portabilidad y bloqueo. |

**Aceptación registrada.** Cada usuario acepta los términos y la política al activar su cuenta (casilla obligatoria en `/accept-invitation`). Se guarda `User.termsAcceptedAt` y `User.termsVersion`. Al cambiar los términos o la política de la plataforma, sube `TERMS_VERSION` en `src/lib/legal/constants.ts`. Al cambiar la política de la postulación, sube `PRIVACY_POLICY_VERSION` en `src/lib/privacy/constants.ts`.

## Políticas internas (cómo opera Aether)

1. [Seguridad de la información](./politica-seguridad.md)
2. [Respuesta a incidentes y vulneraciones de datos](./respuesta-incidentes.md)
3. [Conservación, respaldos y eliminación de datos](./conservacion-y-respaldos.md)
4. [Continuidad operativa](./continuidad-operativa.md)
5. [Lista de lanzamiento legal y operativa](./lista-lanzamiento.md): lo que tienes que hacer tú, en orden.

Complementan `docs/proteccion-datos.md` (estado de cumplimiento de la Ley 21.719 dentro del sistema) y `docs/security/cloudflare.md`.
