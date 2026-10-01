import React from 'react';
import { checkPageAccess } from '@/lib/auth/guards';
import { PageAccessNotice } from '@/components/shared/PageAccessNotice';

// Ventas viene con el Core: ya no cuelga de ningún módulo, solo del permiso.
export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const access = await checkPageAccess('sales:read');
  if (access.denied) return <PageAccessNotice denied={access.denied} />;
  return <>{children}</>;
}
