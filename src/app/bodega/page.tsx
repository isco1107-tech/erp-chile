import WarehouseMobileClient from '@/components/inventory/mobile/WarehouseMobileClient';
export const metadata = { title: 'Bodega móvil | Aether', manifest: '/bodega/manifest.webmanifest' };
export default function WarehousePage() { return <main data-warehouse-app className="theme-saas-light min-h-dvh bg-background text-foreground"><WarehouseMobileClient /></main>; }
