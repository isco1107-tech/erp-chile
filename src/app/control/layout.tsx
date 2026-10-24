import type { ReactNode } from 'react';
export const metadata = {
  title: 'Aether Control',
  manifest: '/control/manifest.webmanifest',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Aether Control' },
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
    <div className="theme-saas-light bodega-app min-h-dvh bg-background text-foreground">
      {children}
    </div>
  );
}
