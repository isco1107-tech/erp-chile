import { Bot, DatabaseBackup, FileLock2, Fingerprint, KeyRound, Network, UserCog, Zap } from 'lucide-react';
import s from './landing.module.css';

export const guarantees = [
  { icon: Network, title: 'Cada empresa en su propio carril', text: 'Toda consulta queda acotada a tu empresa. Un usuario de otra compañía no puede leer tus datos, ni por error ni a propósito.' },
  { icon: Fingerprint, title: 'Sesiones que caducan solas', text: 'Sesión cifrada en cookies del navegador, con un máximo de 8 horas, y revalidada contra la base en cada acción: desactivar a alguien lo deja fuera al instante.' },
  { icon: KeyRound, title: 'Contraseñas que nadie puede leer', text: 'Se guardan con bcrypt, no en texto. Ni tú ni el equipo de Aether pueden recuperar una contraseña: solo restablecerla.' },
  { icon: UserCog, title: 'Permisos al nivel del detalle', text: 'Cinco roles base y roles a medida por empresa. Defines quién puede ver costos, quién emite documentos y quién solo consulta.' },
  { icon: FileLock2, title: 'Tus folios del SII, cifrados', text: 'El archivo CAF que autoriza tus folios se guarda cifrado con AES-256-GCM y su llave privada nunca sale del sistema.' },
  { icon: DatabaseBackup, title: 'Tus datos se van contigo', text: 'Exporta la información completa de tu empresa cuando quieras, en un archivo JSON limpio de contraseñas y credenciales.' },
  { icon: Bot, title: 'Agentes con visión de negocio', text: 'Asistentes para dirección, finanzas, operaciones y ventas que revisan tus datos y proponen acciones para tu equipo.' },
  { icon: Zap, title: 'El seguimiento continúa solo', text: 'Automatizaciones, notificaciones y recordatorios para las tareas recurrentes: stock bajo mínimo, folios por agotarse, un pago que no llega.' },
];

export default function Security() {
  return (
    <section id="seguridad" className={`${s.section} ${s.security}`}>
      <div className={s.container}>
        <div className={s.sectionHeading} data-reveal>
          <div>
            <p className={s.kicker}>CONFIANZA, NO BUENA FE</p>
            <h2>Tu información es tuya.<br />Y trabaja también para ti.</h2>
          </div>
          <p>Un ERP guarda lo más sensible de una empresa: sus precios, sus márgenes, sus clientes. Estas son las reglas con las que Aether lo cuida, y cómo esos mismos datos se ponen a tu favor.</p>
        </div>

        <div className={s.securityGrid}>
          {guarantees.map((item, index) => (
            <article key={item.title} data-reveal style={{ transitionDelay: `${index * 55}ms` }}>
              <span className={s.securityIcon}><item.icon size={19} aria-hidden="true" /></span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>

        <div className={s.securityStrip} data-reveal>
          <p>Y además, de fábrica:</p>
          <span>Multiempresa</span>
          <span>Invitaciones por correo</span>
          <span>Mensajería interna cifrada</span>
          <span>Empresa suspendida, acceso cerrado</span>
        </div>
      </div>
    </section>
  );
}
