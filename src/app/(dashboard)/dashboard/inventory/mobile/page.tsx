import QRCode from 'qrcode';
import Link from 'next/link';
import { Bot, ExternalLink, PackagePlus, Smartphone, Users } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { platformBaseUrl } from '@/lib/hosting/custom-domain';
import { MODE_DEFINITIONS, MOBILE_MODES } from '@/lib/warehouse-mobile/modes';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getMobileOverview } from '@/modules/warehouse-mobile/services/overview.service';

export const metadata = { title: 'Bodega móvil' };

/**
 * Para quien administra: cómo abrir la app del bodeguero en un celular, si la
 * identificación por foto está disponible y qué se ha hecho desde la app. La app
 * en sí vive en `/bodega` (fuera del panel, instalable en el teléfono).
 */
export default async function MobileWarehousePage() {
  const context = await getAuthContext();
  const url = `${platformBaseUrl()}/bodega`;
  const [overview, qr] = await Promise.all([getMobileOverview(context.companyId), QRCode.toDataURL(url, { margin: 1, width: 224, errorCorrectionLevel: 'M' })]);
  const canSeeActivity = can(context, 'inventory:write');
  const { vision, activity } = overview;

  const visionBadge =
    vision.status === 'ok' ? (
      <StatusBadge tone="success">Disponible</StatusBadge>
    ) : vision.status === 'disabled' ? (
      <StatusBadge tone="neutral">Desactivada</StatusBadge>
    ) : (
      <StatusBadge tone="warning">Sin configurar</StatusBadge>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventario"
        title="Bodega móvil"
        description="La app del bodeguero: recibe, descuenta y traslada productos desde el celular, con cámara y lector de códigos. Funciona aunque se vaya la señal y lo registrado llega solo al Kardex."
        actions={
          <Link href="/bodega" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted">
            <ExternalLink className="size-4" /> Abrir la app
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Movimientos esta semana" value={String(activity.total)} icon={Smartphone} hint={`Últimos ${activity.days} días, desde la app`} />
        <KpiCard label="Productos creados desde el celular" value={String(activity.createdProducts)} icon={PackagePlus} hint="Complétales precio y categoría" tone={activity.createdProducts > 0 ? 'warning' : 'neutral'} />
        <KpiCard label="Fotos identificadas con IA (24 h)" value={String(vision.usedLast24h)} icon={Bot} hint={`Tope diario: ${vision.limits.companyPerDay}`} tone="info" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Abrir en el celular</CardTitle>
            <CardDescription>Cada bodeguero entra con su propio usuario. Necesita un rol con permiso de inventario (por ejemplo, Bodeguero).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={`Código QR para abrir ${url}`} width={160} height={160} className="rounded-lg border border-border bg-white p-1" />
              <div className="min-w-0 space-y-1 text-sm">
                <p className="text-muted-foreground">Escanea el código con la cámara del celular, o escribe esta dirección:</p>
                <p className="font-mono text-sm font-medium break-all">{url}</p>
              </div>
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Abre la dirección en el navegador del celular e inicia sesión.</li>
              <li>
                <strong className="text-foreground">Android:</strong> menú del navegador → «Instalar app». <strong className="text-foreground">iPhone:</strong> Compartir → «Agregar a inicio».
              </li>
              <li>Al abrirla por primera vez, acepta el permiso de la cámara.</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Identificar productos con una foto</CardTitle>
              {visionBadge}
            </div>
            <CardDescription>
              Si el producto no tiene código de barras (o no se lee), el bodeguero le saca una foto y la IA propone qué producto es o los datos para crearlo. Siempre lo revisa la persona antes de guardar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {vision.status === 'not-configured' ? <p className="rounded-lg bg-warning-soft p-3 text-warning">Falta configurar la llave de la IA (GEMINI_API_KEY) en el servidor. Mientras tanto, la app funciona con código de barras y búsqueda a mano.</p> : null}
            {vision.status === 'disabled' ? <p className="rounded-lg bg-muted p-3">La identificación por foto está desactivada en este servidor (WAREHOUSE_VISION_ENABLED).</p> : null}
            <p>
              <strong className="text-foreground">Para que la IA no se sature:</strong> primero se usa el código de barras (sin IA); la misma foto no se lee dos veces; y hay topes por minuto —{' '}
              {vision.limits.userPerMinute} por persona, {vision.limits.companyPerMinute} por empresa y {vision.limits.platformPerMinute} en toda la plataforma—. Si se llega al tope, la foto queda en espera en el celular y se identifica sola, sin bloquear el trabajo.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Qué puede hacer el bodeguero</CardTitle>
          <CardDescription>Cada movimiento queda en el Kardex marcado como «App bodega» y en Auditoría.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {MOBILE_MODES.map((mode) => (
              <li key={mode} className="rounded-lg border border-border p-3">
                <p className="font-medium">{MODE_DEFINITIONS[mode].label}</p>
                <p className="text-muted-foreground">{MODE_DEFINITIONS[mode].hint}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {canSeeActivity ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4" /> Quién la usó esta semana
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activity.byUser.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no hay movimientos enviados desde la app.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {activity.byUser.map((user) => (
                    <li key={user.userId} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate font-medium">{user.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {user.count} {user.count === 1 ? 'movimiento' : 'movimientos'} · último {new Date(user.lastAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'America/Santiago' })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Productos creados desde el celular</CardTitle>
              <CardDescription>El bodeguero los da de alta con lo que ve en el envase. Revisa precio, categoría y costo en el Catálogo.</CardDescription>
            </CardHeader>
            <CardContent>
              {overview.recentProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ninguno esta semana.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {overview.recentProducts.map((product) => (
                    <li key={product.productId} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{product.name}</span>
                        <span className="block text-xs text-muted-foreground">{product.sku}</span>
                      </span>
                      {product.missingPrice ? <StatusBadge tone="warning">Falta precio</StatusBadge> : null}
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/dashboard/products" className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
                Ir al Catálogo de Productos
              </Link>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
