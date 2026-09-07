import { notFound } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import MessagingClient from '@/components/messaging/MessagingClient';

export const metadata = { title: 'Mensajería' };

export default async function MessagingPage() {
  const context = await getAuthContext();
  if (!can(context, 'messaging:use')) notFound();

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Mensajería</h1>
        <p className="text-sm text-muted-foreground">
          Chat interno de tu equipo. Los mensajes se guardan cifrados y nadie fuera de la conversación puede leerlos.
        </p>
      </div>
      <MessagingClient currentUserId={context.id} currentUserName={context.name} />
    </div>
  );
}
