import type { ReactNode } from 'react';
import InstallApplication from '@/components/apps/InstallApplication';
export const metadata = {
  manifest: '/proveedor/cuenta/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Seller Center' },
  icons: { apple: '/branding/app-icon-512.png' },
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <aside className="theme-saas-light mx-auto max-w-lg px-4 pb-6">
        <InstallApplication name="Seller Center" scope="/proveedor/cuenta" />
      </aside>
    </>
  );
}
