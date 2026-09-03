import QRCode from 'qrcode';

/**
 * Sirve el PNG del QR de una entrada bajo una URL pública estable.
 *
 * A diferencia de `verify/accreditation/[token]/qr`, el contenido codificado
 * NO es una URL de verificación: es directamente el propio `qrCode`
 * (`TicketSale.qrCode`, un `crypto.randomUUID()` único) — el control de
 * acceso lo hace el staff escaneando y buscando ese string en el panel
 * interno (`checkInTicketAction`), no una página pública de verificación.
 *
 * Sin lookup a la base de datos: el PNG es 100% determinístico a partir del
 * `qrCode` de la URL, así que no hay nada sensible que validar acá — quien ya
 * tiene el código puede construir esta URL de todos modos, y el código en sí
 * no revela nada (es un UUID aleatorio, no contiene datos del comprador).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ qrCode: string }> }) {
  const { qrCode } = await params;
  const buffer = await QRCode.toBuffer(qrCode, { width: 440, margin: 1 });

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
