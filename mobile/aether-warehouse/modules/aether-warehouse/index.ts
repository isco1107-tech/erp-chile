import { requireNativeModule } from 'expo-modules-core';
interface AetherWarehouseModule {
  recognize(uri: string): Promise<string>;
  request(path: string, body: string | null): Promise<{ status: number; body: string }>;
}
export default requireNativeModule<AetherWarehouseModule>('AetherWarehouse');
