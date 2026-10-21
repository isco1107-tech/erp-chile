'use client';

import { useEffect, useState } from 'react';

export interface ImpactBlockData {
  /** "Hoy compraste a 3 productores". */
  text: string;
  /** URL pública a la que apunta el QR. */
  qrUrl: string;
  /** QR ya dibujado en el servidor (data URI). Si falta, se dibuja en el navegador. */
  qrDataUrl?: string | null;
}

/**
 * Bloque de impacto del reverso de la boleta (80 mm). Presentacional: recibe
 * el texto y la URL ya resueltos (`buildReceiptImpact` en
 * `src/modules/impact/services/impact.service.ts`). Va DENTRO de `.pos-ticket`
 * para heredar las clases `ticket-*` de globals.css; en pantalla solo se ve si
 * el ticket está en vista previa, igual que el resto de la boleta.
 *
 * `newPage` lo manda a una hoja aparte (el "reverso" cuando la impresora
 * corta por documento).
 */
export default function ImpactBlock({ text, qrUrl, qrDataUrl, newPage = false }: ImpactBlockData & { newPage?: boolean }) {
  const [clientQr, setClientQr] = useState<string | null>(null);

  useEffect(() => {
    if (qrDataUrl) return;
    let cancelled = false;
    void import('qrcode')
      .then((QRCode) => QRCode.toString(qrUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 }))
      .then((svg) => {
        if (!cancelled) setClientQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (!cancelled) setClientQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [qrDataUrl, qrUrl]);

  const qr = qrDataUrl ?? clientQr;

  return (
    <div className="ticket-center" style={newPage ? { breakBefore: 'page' } : { marginTop: '6px' }}>
      <div className="ticket-divider" />
      <p className="ticket-strong" style={{ fontSize: '12px' }}>
        {text}
      </p>
      {qr && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="Código QR con los productores de tu compra"
            style={{ width: '38mm', height: '38mm', margin: '4px auto 2px', display: 'block' }}
          />
          <p className="ticket-small">Escanea y conoce a quiénes les compraste</p>
        </>
      )}
    </div>
  );
}
