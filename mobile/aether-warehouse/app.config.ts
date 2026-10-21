import type { ExpoConfig } from 'expo/config';
const platformUrl = process.env.EXPO_PUBLIC_AETHER_URL ?? 'https://aetherp.online';
if (platformUrl && (new URL(platformUrl).protocol !== 'https:' || new URL(platformUrl).origin !== platformUrl)) throw new Error('EXPO_PUBLIC_AETHER_URL debe ser el origen HTTPS de Aether, sin barra final');
const config: ExpoConfig = {
  name: 'Aether Bodega', slug: 'aether-bodega', version: '1.0.0', orientation: 'portrait', scheme: 'aether-bodega',
  icon: '../../public/branding/app-icon-512.png',
  userInterfaceStyle: 'light',
  ios: { bundleIdentifier: 'cl.aether.bodega', supportsTablet: true },
  android: { package: 'cl.aether.bodega' },
  plugins: [
    ['expo-camera', { cameraPermission: 'Aether usa la cámara para leer códigos y etiquetas de mercadería.', recordAudioAndroid: false }],
    ['expo-sqlite', { useSQLCipher: true }], 'expo-secure-store', './plugins/with-warehouse-origin.cjs',
  ],
  extra: { platformUrl },
};
export default config;
