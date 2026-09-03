import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import ProfileClient from '@/components/settings/ProfileClient';

export const metadata = { title: 'Mi Perfil' };

export default function ProfilePage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mi Perfil</h1>
          <p className="text-sm text-muted-foreground">
            Tus datos de contacto y tu actividad reciente en la plataforma.
          </p>
        </div>
        <Link href="/dashboard/settings" className={buttonVariants({ variant: 'outline' })}>← Volver</Link>
      </div>
      <ProfileClient />
    </div>
  );
}
