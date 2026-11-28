# 0017 — Dominio predeterminado de la empresa

Fecha: 2026-11-29 · Estado: aceptada

## Contexto

Cada página pública (certamen, sitio web, tienda, academia) nacía en la dirección de la plataforma
(`/certamen/…`, `/web/…`, `/academia/…`). Una empresa que ya compró su dominio tenía que conectarlo página
por página, y mientras tanto sus clientes veían la dirección de Aether. Se pidió que la empresa pueda declarar
su dominio (al crearla o después) y que sus páginas nuevas nazcan ahí; un dominio comprado solo para una página
se sigue poniendo aparte.

## Decisión

- **Un dominio es de un solo destino** (`domain-lifecycle.ts`), así que el dominio de la empresa no puede ser
  «el de todas sus páginas» a la vez. Cada página nueva nace en un **subdominio** suyo, `<dirección>.<dominio>`
  (ej. `miss-temuco.miempresa.cl`). Se guarda como el `customDomain` de la página y recorre el mismo camino que un
  dominio propio: candado de unicidad, registro en Vercel, verificación por `domainServesPlatform`, redirección
  desde la dirección de la plataforma y mapa del sitio. No se tocó el proxy ni `/sitio/[host]`.
- El dominio base vive en `CompanySettings.defaultDomain` (único). Se fija con el campo `dominio` de la orden
  `empresa.crear` y se edita en Configuración → Perfil de Empresa (`settings:company`).
- `assignDefaultDomain` se pide una sola vez, cuando la página se crea, y nunca lanza: sin dominio la página
  funciona igual en la dirección de la plataforma. Solo llena una página con `customDomain: null`.
- La empresa crea **un solo registro CNAME comodín** (`*` → `cname.vercel-dns.com`); con eso cada página nueva
  queda apuntando a la plataforma sin tocar el DNS.

## Alternativas descartadas

- **Rutas bajo el dominio** (`miempresa.cl/miss-temuco`): el proxy decide solo por host y sin base de datos, y las
  páginas internas de un sitio web ya usan `/<slug>`; habría que resolver cada ruta contra la base y todo el SEO.
- **Resolver `*.dominio` sin guardar nada** en cada página: obliga a buscar la página por etiqueta entre cuatro
  tablas, con colisiones entre tipos de sitio y sin verificación por página. Guardarlo reutiliza todo lo existente.
- **Comodín en Vercel** (`*.miempresa.cl`): exige delegar los nameservers del cliente a Vercel.

## Consecuencias

- Guardar, cambiar o quitar el dominio predeterminado **no cambia las páginas que ya existen**; lo mismo con quien
  le quitó el dominio a una página (no se le vuelve a asignar). Esas páginas se cambian desde su propio panel.
- Sin `VERCEL_API_TOKEN` cada subdominio hay que agregarlo a mano en Vercel (el panel de la página lo avisa).
- Etiquetas como `mail`, `www` o `ns1` nunca se asignan (el DNS de la empresa suele usarlas); esa página queda en la
  dirección de la plataforma hasta que se le ponga otro dominio.
- Si dos páginas de una empresa piden el mismo subdominio, la segunda queda sin dominio (no se le quita a la primera).
- La Supersuite debe enviar `dominio` en `empresa.crear` para fijarlo al crear la empresa; Aether no tiene
  pantalla de alta de empresas.
