import { getAuthContext, can } from '@/lib/auth/guards';
import { moduleEnabled } from '@/lib/auth/modules';
import React, { Suspense } from 'react';
import ContactsClient from '@/components/ContactsClient';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata = { title: 'Clientes & Proveedores' };

export default async function ContactsPage() {
  const context = await getAuthContext();
  const canInviteSellers = can(context, 'settings:company') && moduleEnabled(context.features, 'hasSellerCenter');
  return (
    <div className="space-y-4">
      <PageHeader title="Clientes & Proveedores" />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando...</p>}>
        <ContactsClient canInviteSellers={canInviteSellers} />
      </Suspense>
    </div>
  );
}
