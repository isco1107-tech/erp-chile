import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ApplicationInstallProvider } from '@/components/apps/InstallApplication';
import { appMetadata, appViewport } from '@/lib/apps/manifest';

export const metadata: Metadata = appMetadata('pos');
export const viewport: Viewport = appViewport('pos');

export default function PosAppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="theme-saas-light bodega-app min-h-dvh bg-background pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-foreground">
      <ApplicationInstallProvider app="pos">{children}</ApplicationInstallProvider>
    </div>
  );
}
