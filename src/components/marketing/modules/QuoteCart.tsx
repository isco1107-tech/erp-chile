'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, CircleCheck, ClipboardList, Send, X } from 'lucide-react';
import { OPEN_QUOTE_EVENT, openQuoteDialog, useQuoteCart } from './quote-cart';
import s from './modules.module.css';

/** Mismo nombre de campo trampa que valida el servidor (`MODULE_QUOTE_HONEYPOT_FIELD`). */
const HONEYPOT_FIELD = 'website';

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; email: string; name: string } | { kind: 'error'; message: string };

export interface QuotableModule {
  id: string;
  title: string;
}

/**
 * Carrito de la cotización: una barra fija abajo mientras haya módulos
 * marcados y, al tocar «Cotizar», el formulario con los módulos elegidos y los
 * datos de contacto. El envío va a `/api/public/module-quote` (correo a
 * ventas); el `mailto:` queda solo como respaldo si el envío falla. Otros
 * botones de la página lo abren con `openQuoteDialog()`.
 */
export default function QuoteCart({ modules, salesEmail }: { modules: QuotableModule[]; salesEmail: string }) {
  const { ids, remove, clear } = useQuoteCart();
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');

  // Solo los ids que existen en la vitrina, en el orden de la vitrina.
  const selected = modules.filter((module) => ids.includes(module.id));
  const count = selected.length;

  // Con módulos marcados, la barra del carrito reemplaza a la barra fija de la landing (ver v2.module.css).
  useEffect(() => {
    document.documentElement.toggleAttribute('data-quote-cart', count > 0);
    return () => document.documentElement.removeAttribute('data-quote-cart');
  }, [count]);

  useEffect(() => {
    const onOpen = () => {
      setStatus((current) => (current.kind === 'sent' ? { kind: 'idle' } : current));
      if (!dialog.current?.open) dialog.current?.showModal();
    };
    window.addEventListener(OPEN_QUOTE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_QUOTE_EVENT, onOpen);
  }, []);

  const summary = `Hola, equipo Aether:\n\nMe interesa cotizar estos módulos:\n${selected.map((module) => `- ${module.title}`).join('\n')}\n\nNombre: ${name.trim() || '—'}\nEmpresa: ${company.trim() || '—'}\nTeléfono: ${phone.trim() || '—'}\n\nGracias.`;
  const mailtoHref = `mailto:${salesEmail}?subject=${encodeURIComponent('Cotización de módulos de Aether')}&body=${encodeURIComponent(summary)}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (count === 0) return;
    setStatus({ kind: 'sending' });
    try {
      const response = await fetch('/api/public/module-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, company, message, moduleIds: selected.map((module) => module.id), [HONEYPOT_FIELD]: honeypot }),
      });
      const json: { success: boolean; error?: string } = await response.json();
      if (!json.success) {
        setStatus({ kind: 'error', message: json.error ?? 'No pudimos enviar tu solicitud.' });
        return;
      }
      setStatus({ kind: 'sent', email: email.trim(), name: name.trim() });
      setMessage('');
      clear();
    } catch {
      setStatus({ kind: 'error', message: 'No pudimos conectar con el servidor.' });
    }
  }

  return (
    <>
      {count > 0 && (
        <div className={`${s.tokens} ${s.bar}`} role="region" aria-label="Tu cotización">
          <span className={s.barCount} aria-hidden="true">{count}</span>
          <p className={s.barText}>
            {count === 1 ? '1 módulo en tu cotización' : `${count} módulos en tu cotización`}
            <span>Sigue marcando los que te interesen</span>
          </p>
          <button type="button" className={s.barClear} onClick={clear}>Vaciar</button>
          <button type="button" className={s.primary} onClick={openQuoteDialog}>Cotizar <ArrowUpRight size={16} aria-hidden="true" /></button>
        </div>
      )}

      <dialog
        ref={dialog}
        className={`${s.tokens} ${s.dialog}`}
        aria-labelledby="cotizacion-modulos-titulo"
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      >
        <div className={s.dialogInner}>
          {status.kind === 'sent' ? (
            <div className={s.done} role="status">
              <CircleCheck size={44} aria-hidden="true" />
              <h2 id="cotizacion-modulos-titulo">¡Solicitud recibida!</h2>
              <p>Gracias{status.name ? `, ${status.name.split(/\s+/)[0]}` : ''}. Te enviaremos la cotización a <strong>{status.email}</strong> y te contactaremos para resolver tus dudas.</p>
              <button type="button" className={`${s.primary} ${s.submit}`} onClick={() => dialog.current?.close()}>Listo</button>
            </div>
          ) : (
            <>
              <div className={s.dialogHead}>
                <div>
                  <h2 id="cotizacion-modulos-titulo">Cotiza tus módulos</h2>
                  <p>Déjanos tus datos y te enviamos la cotización, sin compromiso.</p>
                </div>
                <button type="button" className={s.close} aria-label="Cerrar" onClick={() => dialog.current?.close()}><X size={20} aria-hidden="true" /></button>
              </div>

              {count > 0 ? (
                <ul className={s.selected} aria-label="Módulos elegidos">
                  {selected.map((module) => (
                    <li key={module.id}>
                      <span>{module.title}</span>
                      <button type="button" aria-label={`Quitar ${module.title}`} onClick={() => remove(module.id)}><X size={15} aria-hidden="true" /></button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={s.hint}><ClipboardList size={16} aria-hidden="true" /> Aún no eliges módulos: cierra esta ventana y marca la casilla <strong>+</strong> de los que te interesen.</p>
              )}

              <form onSubmit={handleSubmit}>
                <div className={s.fields}>
                  <label className={s.field} htmlFor="cotizacion-nombre"><span><strong>Nombre</strong></span>
                    <input id="cotizacion-nombre" name="name" autoComplete="name" required minLength={2} maxLength={120} placeholder="Nombre y apellido" value={name} onChange={(event) => setName(event.target.value)} />
                  </label>
                  <label className={s.field} htmlFor="cotizacion-empresa"><span><strong>Empresa</strong> (opcional)</span>
                    <input id="cotizacion-empresa" name="company" autoComplete="organization" maxLength={120} placeholder="Nombre de tu empresa" value={company} onChange={(event) => setCompany(event.target.value)} />
                  </label>
                  <label className={s.field} htmlFor="cotizacion-correo"><span><strong>Correo</strong></span>
                    <input id="cotizacion-correo" name="email" type="email" autoComplete="email" required maxLength={160} placeholder="nombre@empresa.cl" value={email} onChange={(event) => setEmail(event.target.value)} />
                  </label>
                  <label className={s.field} htmlFor="cotizacion-telefono"><span><strong>Teléfono o WhatsApp</strong></span>
                    <input id="cotizacion-telefono" name="phone" type="tel" autoComplete="tel" required minLength={8} maxLength={30} pattern="[+0-9\s()\-]+" placeholder="+56 9 1234 5678" value={phone} onChange={(event) => setPhone(event.target.value)} />
                  </label>
                  <label className={`${s.field} ${s.wide}`} htmlFor="cotizacion-mensaje"><span><strong>Comentario</strong> (opcional)</span>
                    <textarea id="cotizacion-mensaje" name="message" maxLength={1000} placeholder="Cuántas personas lo usarían, desde cuándo lo necesitas…" value={message} onChange={(event) => setMessage(event.target.value)} />
                  </label>
                </div>
                {/* Campo trampa anti-bots: fuera de pantalla y fuera del orden de tabulación. */}
                <div aria-hidden="true" className={s.honeypot}><label>Sitio web<input tabIndex={-1} autoComplete="off" name={HONEYPOT_FIELD} value={honeypot} onChange={(event) => setHoneypot(event.target.value)} /></label></div>
                <button type="submit" className={`${s.primary} ${s.submit}`} disabled={status.kind === 'sending' || count === 0}>
                  {status.kind === 'sending' ? 'Enviando…' : `Pedir cotización${count > 0 ? ` (${count})` : ''}`} <Send size={16} aria-hidden="true" />
                </button>
                <p className={s.formNote}>Usamos tus datos solo para enviarte esta cotización. Sin compromiso de compra.</p>
                {status.kind === 'error' && (
                  <p className={s.error} role="alert">{status.message} Puedes <a href={mailtoHref}>escribirnos por correo</a> con tu solicitud ya redactada.</p>
                )}
              </form>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
