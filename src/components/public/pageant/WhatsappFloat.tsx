import { Whatsapp } from './icons';

/**
 * Botón flotante de WhatsApp (abajo a la izquierda) con un mensaje listo para
 * enviar. El número es el del certamen (`Project.publicWhatsapp`); sin número
 * configurado no se muestra.
 */
export function WhatsappFloat({ href, label }: { href: string; label: string }) {
  return (
    <a className="pgs-wa-float" href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
      <Whatsapp />
    </a>
  );
}
