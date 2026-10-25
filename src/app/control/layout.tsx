import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ApplicationInstallProvider } from '@/components/apps/InstallApplication';
import { appMetadata, appViewport } from '@/lib/apps/manifest';

export const metadata: Metadata = appMetadata('control');
export const viewport: Viewport = appViewport('control');

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="theme-saas-light bodega-app min-h-dvh bg-background text-foreground">
      <ApplicationInstallProvider app="control">{children}</ApplicationInstallProvider>
    </div>
  );
}
