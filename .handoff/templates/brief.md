---
slug: {{slug}}
title: {{title}}
type: {{type}}
agent: {{agent}}
base: main
allow: {{allow}}
allowSchema: false
allowDeps: false
---

# {{title}}

## Objetivo
(Una o dos frases: qué debe quedar funcionando al terminar.)

## Contexto
(Archivos de partida, decisiones ya tomadas, módulos relacionados. Rutas, no contenido pegado.)

## Alcance
- Puedes tocar solo lo listado en `allow` del encabezado.
- Si necesitas algo fuera de eso, NO lo hagas: anótalo en RESULT.md bajo "Pendiente".

## Criterios de aceptación
- [ ] (comportamiento observable 1)
- [ ] (comportamiento observable 2)
- [ ] Pruebas nuevas o ajustadas para lo anterior
- [ ] `npm run typecheck`, `npm run lint` y `npm test` pasan

## Formato de la respuesta
Al terminar escribe `.handoff-task/RESULT.md` con: qué hiciste (5 líneas máx.), archivos tocados, decisiones no obvias, y "Pendiente" si dejaste algo.
