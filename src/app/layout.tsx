import './globals.css';
import React from 'react';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from 'sonner';
import RouteProgressBar from '@/components/shared/RouteProgressBar';
import AetherBadge from '@/components/shared/AetherBadge';
import PrivateAnalytics from '@/components/shared/PrivateAnalytics';
import { appHosts } from '@/lib/hosting/custom-domain';
import ZodLocale from '@/components/shared/ZodLocale';
import '@/lib/zod-setup';

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata = {
  title: 'Aether ERP',
  description: 'ERP chileno para ventas, inventario, compras, finanzas y contabilidad.',
};

export const viewport = {
  themeColor: '#10131a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={cn("font-sans", geist.variable)}>
      <body>
        <ZodLocale />
        <RouteProgressBar />
        {children}
        <Toaster position="top-right" />
        <AetherBadge />
        <PrivateAnalytics platformHosts={appHosts()} />
      </body>
    </html>
  );
}
