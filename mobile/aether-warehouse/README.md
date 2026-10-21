# Aether Bodega

Aplicación nativa de inventario con React Native/Expo, SQLite cifrado y OCR ML Kit empaquetado. Reutiliza los contratos y el motor de sincronización de `../../src/lib/warehouse`.

Ver [implementación y operación](../../docs/inventario-movil-implementacion.md).

```powershell
npm ci
npm run typecheck
npm run export:check
npm run android
```

Configurar `EXPO_PUBLIC_AETHER_URL` para cambiar el origen de Aether. El valor predeterminado es `https://aetherp.online`. El backend debe tener aplicada la migración de bodega y desplegadas sus rutas antes de usar la app contra ese entorno.

La primera preparación y el login necesitan conexión. Después se capturan movimientos y se leen etiquetas sin señal; la confirmación central ocurre al sincronizar. Las fotografías no se suben y se eliminan de la caché al terminar su lectura.

Se requiere una compilación nativa: Expo Go no incorpora este módulo OCR ni SQLCipher. La exportación JavaScript y TypeScript no sustituyen la comprobación de Kotlin/Swift y las pruebas de cámara en un teléfono físico.
