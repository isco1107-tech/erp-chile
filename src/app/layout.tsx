import './globals.css';
import React from 'react';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from 'sonner';
import RouteProgressBar from '@/components/shared/RouteProgressBar';
import AetherBadge from '@/components/shared/AetherBadge';
import PrivateAnalytics from '@/components/shared/PrivateAnalytics';
import { appHosts } from '@/lib/hosting/custom-domain';
import { APPS, appIconPaths } from '@/lib/apps/registry';

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata = {
  title: 'Aether ERP',
  description: 'ERP chileno para ventas, inventario, compras, finanzas y contabilidad.',
  // Antes lo enlazaba `src/app/manifest.ts`; ahora es una ruta (necesita el origen) y se declara aquí.
  manifest: APPS.erp.manifestPath,
  // Ícono de iOS del ERP: cada app instalable tiene el suyo (`src/lib/apps/registry.ts`).
  icons: { apple: [{ url: appIconPaths('erp').apple180, sizes: '180x180', type: 'image/png' }] },
};

export const viewport = {
  themeColor: '#10131a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={cn("font-sans", geist.variable)}>
      <body>
        <RouteProgressBar />
        {children}
        <Toaster position="top-right" />
        <AetherBadge />
        <PrivateAnalytics platformHosts={appHosts()} />
      </body>
    </html>
  );
}
