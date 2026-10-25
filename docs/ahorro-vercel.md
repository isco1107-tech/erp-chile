# Tamaño de funciones y descargas en Vercel

Revisión del 25 de octubre de 2026. El usuario informó un límite de Functions
Storage de 3 GB. Este entorno puede publicar por la integración GitHub/Vercel,
pero la API administrativa de Vercel responde 403 por falta de token. No se
pudieron consultar Usage, eliminar despliegues históricos ni medir el saldo
real de la cuenta. Las mediciones siguientes son locales, no de facturación.

## Correcciones

- La lectura dinámica del manual Word partía de `public/`, lo que incluía
  también los instaladores y los recursos de marketing en la función.
  Ahora parte exclusivamente de `public/manual/screenshots/` y mantiene
  su inclusión explícita en la traza. Se excluyen descargas y marketing.
- En Linux con glibc se excluyen las variantes musl y WASM de Sharp.
  Se conservan las bibliotecas nativas que usa el runtime. Otros sistemas
  conservan su selección original de dependencias.
- Los ocho instaladores existentes (ERP 0.1.1 y POS 0.3.0) pasan a GitHub
  Releases: 191.345.834 bytes fuera de `public/`. Se verificaron los ocho
  SHA-256 mediante descargas públicas antes de retirar las copias del deploy.
  Los enlaces `/downloads/<archivo>` siguen funcionando mediante HTTP 307;
  los manifiestos y sumas de comprobación permanecen en el sitio.
- El publicador de futuras versiones valida la procedencia y cada archivo,
  publica primero la release y solo entonces actualiza los manifiestos.
  No vuelve a copiar binarios a `public/` y no sobrescribe versiones publicadas.
- El build comprueba las trazas: ningún instalador debe entrar a una función,
  el manual debe conservar sus capturas y el codec nativo debe funcionar y
  figurar en las trazas. También informa el tamaño de los archivos únicos.

Las variantes de Sharp se excluyen con `outputFileTracingExcludes`, la opción
de Next.js aplicable en Vercel, no mediante `functions.excludeFiles`.

## Medición y limpieza de la cuenta

Con el mismo entorno y versión de dependencias, la unión de archivos de las
360 trazas pasó de **321,64 MiB a 81,59 MiB** (−74,63 %). La función del manual
pasó de **227,91 MiB a 15,09 MiB**, conservando las 60 capturas. Los archivos
públicos quedaron en **34,77 MiB**. Se comprobó la conversión nativa a WebP.

Ejecutar `npm run build` contra un entorno de desarrollo seguro. El paso final
`scripts/check-function-storage.cjs` mide los archivos únicos y las rutas más
pesadas. Sumar las trazas de todas las rutas cuenta dependencias repetidas y
no equivale al almacenamiento real de Vercel, que agrupa y deduplica funciones.

Para liberar almacenamiento histórico se necesita acceso administrativo a
Vercel y revisar Usage y la retención efectiva. Conservar el despliegue actual,
una versión anterior funcional para rollback y las vistas previas que estén
en revisión; evaluar eliminar únicamente versiones obsoletas. Este cambio
no borra bases de datos, archivos de clientes ni objetos de Blob/R2 y no
revierte consumo de CPU, memoria-tiempo o transferencia ya facturado.
