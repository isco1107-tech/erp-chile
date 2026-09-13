import SessionsClient from '@/components/settings/SessionsClient';

export const metadata = { title: 'Dispositivos Activos' };

export default function SessionsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" data-tutorial="module-header">Dispositivos Activos</h1>
        <p className="text-sm text-muted-foreground">
          Cada fila es un inicio de sesión vigente. Si no reconoces uno de los tuyos, ciérralo.
        </p>
      </div>
      <SessionsClient />
    </div>
  );
}
