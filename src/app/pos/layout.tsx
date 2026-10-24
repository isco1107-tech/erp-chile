import type { ReactNode } from 'react';

export const metadata = { title: 'Aether POS', robots: { index: false, follow: false } };

export default function PosAppLayout({ children }: { children: ReactNode }) {
  return <div className="theme-saas-light bodega-app min-h-dvh bg-background text-foreground">{children}</div>;
}
