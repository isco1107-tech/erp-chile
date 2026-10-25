import { getAuthContext, can } from '@/lib/auth/guards';
import { moduleEnabled } from '@/lib/auth/modules';
import React, { Suspense } from 'react';
import ContactsClient from '@/components/ContactsClient';

export const metadata = { title: 'Clientes & Proveedores' };

export default async function ContactsPage() {
  const context = await getAuthContext();
  const canInviteSellers = can(context, 'settings:company') && moduleEnabled(context.features, 'hasSellerCenter');
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4" data-tutorial="module-header">Clientes & Proveedores</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando...</p>}>
        <ContactsClient canInviteSellers={canInviteSellers} />
      </Suspense>
    </div>
  );
}
