import { checkPageAccess } from '@/lib/auth/guards';
import MessagingClient from '@/components/messaging/MessagingClient';
import { PageAccessNotice } from '@/components/shared/PageAccessNotice';

export const metadata = { title: 'Mensajería' };

export default async function MessagingPage() {
  // Sin el módulo o sin el permiso, se explica qué falta: antes respondía «página no encontrada» (y un error
  // de React #419 por lanzar `notFound()` dentro del `loading.tsx`).
  const access = await checkPageAccess('messaging:use');
  if (access.denied) return <PageAccessNotice denied={access.denied} />;
  const { context } = access;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" data-tutorial="module-header">Mensajería</h1>
        <p className="text-sm text-muted-foreground">
          Chat interno de tu equipo. Los mensajes se guardan cifrados y nadie fuera de la conversación puede leerlos.
        </p>
      </div>
      <MessagingClient currentUserId={context.id} currentUserName={context.name} />
    </div>
  );
}
