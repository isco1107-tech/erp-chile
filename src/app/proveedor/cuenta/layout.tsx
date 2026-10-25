import type { ReactNode } from 'react';
import { ApplicationInstallProvider } from '@/components/apps/InstallApplication';
export const metadata = {
  manifest: '/proveedor/cuenta/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Seller Center' },
  icons: { apple: '/branding/app-icon-512.png' },
};
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
  themeColor: '#12161f',
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <ApplicationInstallProvider scope="/proveedor/cuenta">
      <div className="seller-center-app">{children}</div>
    </ApplicationInstallProvider>
  );
}
