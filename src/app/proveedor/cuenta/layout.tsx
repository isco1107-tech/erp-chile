import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ApplicationInstallProvider } from '@/components/apps/InstallApplication';
import { appMetadata, appViewport } from '@/lib/apps/manifest';

export const metadata: Metadata = appMetadata('seller');
export const viewport: Viewport = appViewport('seller');

export default function Layout({ children }: { children: ReactNode }) {
  return <ApplicationInstallProvider app="seller">{children}</ApplicationInstallProvider>;
}
