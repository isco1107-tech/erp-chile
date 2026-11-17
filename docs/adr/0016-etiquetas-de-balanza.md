# 0016 · Etiquetas de balanza en el POS (productos a granel)

Fecha: 2026-11-17. Estado: aceptado. Complementa el 0011 (POS multicaja) y el 0012 (operación del cajero).

## Contexto

En un supermercado la fiambrería, la carnicería, la panadería y la verdulería venden por peso. La balanza de mostrador imprime una etiqueta EAN-13 que empieza con 2 (prefijos 20–29, que GS1 reserva para uso interno de cada tienda) y que trae el número del producto en la balanza (PLU) y el peso o el precio de ESE paquete. El POS de Aether no las entendía: el cajero tenía que buscar el producto y teclear el peso, lento y con errores en la fila.

## Decisiones

1. **El formato es de la empresa, el PLU es del producto.** `CompanySettings.scaleLabelFormat` (JSON, `null` = apagado) guarda el largo del PLU (4, 5 o 6 dígitos; el valor ocupa los `10 − largo` restantes) y, por prefijo, si el valor es **peso en gramos** o **precio en pesos con IVA**. Se valida con `scaleLabelFormatSchema` (Zod estricto, listas cerradas) al guardar y otra vez al leer. `Product.scaleCode` guarda el PLU sin ceros a la izquierda (`scaleCodeKey`), único por empresa (`@@unique([companyId, scaleCode])`). Lo configura `settings:company` con el POS contratado (`updateScaleLabelFormatAction`, auditada).
2. **Lógica pura en `src/lib/pos/scale-label.ts`** y una sola entrada en el lector: `resolveScan(products, raw, search, scale)`. Orden: empaque → código de barras → SKU (coincidencias exactas) → **etiqueta de balanza** → código sin ceros → búsqueda parcial. Una coincidencia exacta manda: un producto con un EAN interno que empieza con 2 se sigue encontrando por su código. Una etiqueta de balanza que no se puede usar **no** cae en la búsqueda parcial: se explica (`scaleProblem`) y no agrega nada.
3. **Solo dígito verificador válido.** Un EAN-13 mal leído nunca agrega un peso inventado; PLU en cero o valor en cero se rechazan con su motivo. Dos productos con el mismo PLU (catálogo desactualizado) no se adivinan.
4. **La etiqueta decide producto y cantidad, nunca el precio.** El terminal manda `productId` + `quantity` como siempre y `createPosSale` cobra el precio del catálogo. Con etiquetas de peso calza exacto; con etiquetas de precio la cantidad se deduce del precio con IVA del catálogo y se redondea al gramo (`normalizeQuantity`, milésimas), así que el total puede diferir en unos pesos de lo impreso: la pantalla de configuración y el manual lo dicen y recomiendan el peso. En ambos casos la balanza debe tener los precios del catálogo.
5. **`N*etiqueta` multiplica** (dos paquetes idénticos) y dos etiquetas del mismo producto se suman en la misma línea, como cualquier producto.
6. **El paso del RUT** (`classifyRutEntry`) también reconoce la etiqueta: no queda como un RUT inválido.
7. Un producto con número de serie no puede tener PLU (se rechaza al guardar): una serie es una unidad, no un peso.
8. La importación masiva de productos acepta las columnas «Código de barras» y «PLU balanza», con duplicados dentro del archivo y contra el catálogo marcados en la vista previa.

## Lo que esto NO verifica

- **Ninguna balanza física.** Las pruebas (`tests/pos-scale-label.test.ts`) arman etiquetas con su dígito verificador. Hay balanzas que agregan un dígito verificador del precio dentro de la etiqueta o usan otro reparto de dígitos: la tarjeta de configuración trae «Probar una etiqueta» y hay que usarla con una etiqueta real antes de la primera venta.
- **Enviar precios y PLU a la balanza.** Hoy los precios se cargan a mano en la balanza. Exportar el maestro de PLU (archivo para el software de la balanza) es trabajo futuro.
- La Bodega móvil y la toma de inventario todavía no interpretan etiquetas de balanza (allí se cuenta por kilo a mano).

## Todavía no

Exportación del maestro de PLU a la balanza, lectura de etiquetas en Bodega móvil y en la toma de inventario, y etiquetas de precio con dígito verificador interno del precio.
