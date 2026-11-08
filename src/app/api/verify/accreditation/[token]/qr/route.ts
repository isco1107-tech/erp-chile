import QRCode from 'qrcode';
import { getAppUrl } from '@/lib/email/mailer';

/** Solo códigos con la forma de los que genera la plataforma (UUID / cuid): el dominio no es un generador de QR para cualquier texto. */
const CODE_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Sirve el PNG del QR de una acreditación bajo una URL pública estable.
 *
 * El correo con la credencial ya NO embebe el QR como `data:` URI: Gmail (y
 * varios otros clientes) lo descartan en silencio sin mostrar ningún
 * indicio de error, así que la imagen nunca aparecía. Brevo tampoco soporta
 * adjuntos inline por `cid` en su API transaccional. Una URL `<img src>`
 * normal es lo único que funciona de forma consistente entre clientes.
 *
 * Sin lookup a la base de datos: el contenido del QR es 100% determinístico
 * a partir del `token` de la URL (siempre `/verify/accreditation/<token>`),
 * así que no hay nada sensible que validar acá — quien ya tiene el token
 * puede construir esta URL de todos modos.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!CODE_PATTERN.test(token)) return new Response('No encontrado', { status: 404 });
  const verifyUrl = `${getAppUrl()}/verify/accreditation/${token}`;
  const buffer = await QRCode.toBuffer(verifyUrl, { width: 440, margin: 1 });

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'image/png',
      // El contenido es determinístico para un mismo token, así que puede
      // cachearse de forma agresiva (clientes de correo, CDNs de imágenes).
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
