import React, { Suspense } from 'react';
import ContactsClient from '@/components/ContactsClient';
import { PageHeader } from '@/components/ui/PageHeader';
import { SCREEN_PURPOSES } from '@/modules/manual/knowledge';

export const metadata = { title: 'Clientes & Proveedores' };

export default function ContactsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Clientes & Proveedores" description={SCREEN_PURPOSES.contacts} />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando...</p>}>
        <ContactsClient />
      </Suspense>
    </div>
  );
}
