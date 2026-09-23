'use client';

import { useEffect, useState } from 'react';
import { Download, Hourglass } from 'lucide-react';
import { formatCurrency } from '@/lib/chile/tax';
import type { PublicOrderView } from '@/modules/payment-plans/services/online-payment.service';
import {
  IconAlert,
  IconCheck,
  PublicCard,
  PublicCardHeader,
  PublicFooter,
  PublicPage,
  PublicRow,
  PublicShell,
  PublicStatus,
  PublicTopBar,
} from '@/components/public/PublicShell';

/**
 * Página de retorno desde Khipu (`/pagar/estado/[accessToken]`). Volver del
 * banco NO confirma nada: esta pantalla pregunta al servidor, que consulta a
 * Khipu. Mientras el pago siga en verificación refresca sola unos minutos.
 */

const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 36; // ~3 minutos

export default function InstallmentPaymentStatusClient({ accessToken }: { accessToken: string }) {
  const [order, setOrder] = useState<PublicOrderView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [polls, setPolls] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/installments/orders/${accessToken}`, { cache: 'no-store' });
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const json = (await res.json()) as { success: boolean; data?: PublicOrderView };
        if (!cancelled && json.success && json.data) setOrder(json.data);
      } catch {
        // Error de red transitorio: el próximo ciclo reintenta.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, polls]);

  useEffect(() => {
    if (order?.status !== 'PENDING' || polls >= MAX_POLLS) return;
    const timer = setTimeout(() => setPolls((p) => p + 1), POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [order, polls]);

  if (notFound) {
    return <PublicStatus accent="gold" variant="error" title="Pago no encontrado" message="Revisa que el enlace esté completo." />;
  }
  if (!order) return <PublicStatus accent="gold" variant="loading" message="Consultando el estado de tu pago…" />;

  const cuotas = order.items.map((i) => `N° ${i.installmentNumber}`).join(', ');

  const header =
    order.status === 'PAID' ? (
      <PublicCardHeader icon={<IconCheck />} eyebrow="Pago confirmado" title="¡Pago recibido!" subtitle="Te enviamos el comprobante por correo." />
    ) : order.status === 'PENDING' ? (
      <PublicCardHeader
        icon={<Hourglass size={22} strokeWidth={1.6} />}
        eyebrow="Verificando"
        title="Estamos confirmando tu pago"
        subtitle={
          polls >= MAX_POLLS
            ? 'La confirmación del banco está tardando. Cuando llegue te enviaremos el comprobante por correo; puedes cerrar esta página.'
            : 'Esto suele tardar menos de un minuto. No cierres esta página.'
        }
      />
    ) : (
      <PublicCardHeader
        icon={<IconAlert />}
        eyebrow={order.status === 'EXPIRED' ? 'Pago vencido' : 'Pago no completado'}
        title="El pago no se concretó"
        subtitle="No se hizo ningún cargo por este intento. Vuelve al link de pago para intentarlo de nuevo."
      />
    );

  return (
    <PublicPage accent="gold">
      <PublicTopBar brand={order.companyName} right="Pago de cuotas" />
      <PublicShell>
        <PublicCard glow>
          {header}
          <div className="pub-panel">
            <PublicRow label="Candidata" value={order.candidateName} />
            {order.projectName && <PublicRow label="Certamen" value={order.projectName} />}
            <PublicRow label={order.items.length === 1 ? 'Cuota' : 'Cuotas'} value={cuotas} />
            {order.receiptLabel && <PublicRow label="Comprobante" value={order.receiptLabel} />}
            <PublicRow label={order.status === 'PAID' ? 'Total pagado' : 'Total'} value={formatCurrency(order.amount)} strong />
          </div>

          <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {order.status === 'PAID' && (
              <a className="pub-btn is-primary is-full" style={{ textDecoration: 'none' }} href={`/api/public/installments/orders/${accessToken}/receipt`} target="_blank" rel="noopener">
                <Download size={16} strokeWidth={1.8} /> Descargar comprobante
              </a>
            )}
            {order.status === 'PENDING' && order.paymentUrl && (
              <a className="pub-btn is-ghost is-full" style={{ textDecoration: 'none' }} href={order.paymentUrl}>
                Volver a Khipu para terminar el pago
              </a>
            )}
          </div>
        </PublicCard>
      </PublicShell>
      <PublicFooter>{order.companyName} · Pago oficial de cuotas</PublicFooter>
    </PublicPage>
  );
}
