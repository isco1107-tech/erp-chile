import React, { Suspense } from 'react';
import ContactsClient from '@/components/ContactsClient';

export const metadata = { title: 'Contactos' };

export default function ContactsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Contactos (Clientes & Proveedores)</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando...</p>}>
        <ContactsClient />
      </Suspense>
    </div>
  );
}
