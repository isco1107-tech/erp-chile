'use client';

import { useState, type ReactNode } from 'react';
import { ArrowUpRight, Check, CircleCheck, Mail, Send } from 'lucide-react';
import s from './landing.module.css';
import { SALES_LEAD_HONEYPOT_FIELD, SALES_LEAD_SOLUTIONS, SALES_LEAD_TEAM_SIZES } from '@/lib/marketing/sales-lead-options';

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

export default function SalesContact({
  email,
  whatsapp,
  className,
  kicker = 'EL ERP QUE CALZA CON TU EMPRESA',
  heading = <>Tu próximo paso.<br /><span>A tu medida.</span></>,
  lead = 'No todas las empresas necesitan lo mismo. Cuéntanos qué quieres ordenar y te contactamos para coordinar una demo sobre tus propios procesos.',
}: {
  email: string;
  whatsapp?: string;
  /** Clase adicional para el `<section>` raíz: permite reescribir las variables
   * de color (`--ink`, `--muted`, `--h2-lg`) que consume este módulo sin forkear
   * la lógica de envío — así lo reutiliza `/empresas` sobre fondo blanco. */
  className?: string;
  kicker?: string;
  heading?: ReactNode;
  lead?: string;
}) {
  const [selected, setSelected] = useState<string[]>([SALES_LEAD_SOLUTIONS[0]]);
  const [company, setCompany] = useState('');
  const [team, setTeam] = useState<string>(SALES_LEAD_TEAM_SIZES[0]);
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const message = `Hola, equipo Aether:\n\nMe gustaría conocer el ERP y recibir una cotización.\n\nNombre: ${name.trim() || '—'}\nEmpresa: ${company.trim() || 'Por definir'}\nEquipo: ${team}\nÁreas de interés: ${selected.join(', ') || 'Necesito orientación'}\n\nGracias.`;
  const mailtoHref = `mailto:${email}?subject=${encodeURIComponent('Demo y cotización de Aether ERP')}&body=${encodeURIComponent(message)}`;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: 'sending' });
    try {
      const response = await fetch('/api/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email: contactEmail,
          phone,
          company,
          teamSize: team,
          solutions: selected,
          [SALES_LEAD_HONEYPOT_FIELD]: honeypot,
        }),
      });
      const json: { success: boolean; error?: string } = await response.json();
      if (!json.success) {
        setStatus({ kind: 'error', message: json.error ?? 'No pudimos enviar tu solicitud.' });
        return;
      }
      setStatus({ kind: 'sent' });
    } catch {
      setStatus({ kind: 'error', message: 'No pudimos conectar con el servidor.' });
    }
  }

  return (
    <section id="cotizar" className={`${s.section} ${s.contact}${className ? ` ${className}` : ''}`}>
      <div className={`${s.container} ${s.contactGrid}`}>
        <div className={s.contactCopy}>
          <p className={s.kicker}>{kicker}</p>
          <h2>{heading}</h2>
          <p>{lead}</p>
          <ul><li><Check size={18} />Una demo enfocada en tus procesos</li><li><Check size={18} />Módulos según lo que necesitas</li><li><Check size={18} />Cotización antes de contratar, sin compromiso</li></ul>
          <a href={`mailto:${email}`} className={s.contactEmail}><Mail size={17} />{email}<ArrowUpRight size={15} /></a>
        </div>

        {status.kind === 'sent' ? (
          <div className={`${s.quoteCard} ${s.quoteDone}`} role="status">
            <CircleCheck size={40} aria-hidden="true" />
            <h3>¡Solicitud recibida!</h3>
            <p>Gracias, {name.trim().split(/\s+/)[0] || 'te escribiremos pronto'}. Te contactaremos a <strong>{contactEmail}</strong> para coordinar la demo{company.trim() ? ` de ${company.trim()}` : ''}.</p>
            <button type="button" className={s.contactAlternative} onClick={() => setStatus({ kind: 'idle' })}>Enviar otra solicitud</button>
          </div>
        ) : (
          <form className={s.quoteCard} onSubmit={handleSubmit} noValidate={false}>
            <div className={s.quoteHeading}><span>HABLEMOS DE TU NEGOCIO</span><span>01 — 03</span></div>
            <fieldset><legend>01 <span>¿Qué quieres conectar?</span></legend><div className={s.solutionChoices}>{SALES_LEAD_SOLUTIONS.map(solution => <label key={solution}><input type="checkbox" checked={selected.includes(solution)} onChange={() => setSelected(current => current.includes(solution) ? current.filter(value => value !== solution) : [...current, solution])} /><span><Check size={15} />{solution}</span></label>)}</div></fieldset>
            <div className={s.quoteFields}>
              <label htmlFor="quote-company"><span>02 <strong>Tu empresa</strong></span><input id="quote-company" name="company" autoComplete="organization" maxLength={120} placeholder="Nombre de tu empresa" value={company} onChange={event => setCompany(event.target.value)} /></label>
              <label htmlFor="quote-team"><span>&nbsp;<strong>Tamaño del equipo</strong></span><select id="quote-team" name="team" value={team} onChange={event => setTeam(event.target.value)}>{SALES_LEAD_TEAM_SIZES.map(size => <option key={size}>{size}</option>)}</select></label>
            </div>
            <div className={s.quoteFields}>
              <label htmlFor="quote-name"><span>03 <strong>Tu nombre</strong></span><input id="quote-name" name="name" autoComplete="name" required minLength={2} maxLength={120} placeholder="Nombre y apellido" value={name} onChange={event => setName(event.target.value)} /></label>
              <label htmlFor="quote-email"><span>&nbsp;<strong>Correo</strong></span><input id="quote-email" name="email" type="email" autoComplete="email" required maxLength={160} placeholder="nombre@empresa.cl" value={contactEmail} onChange={event => setContactEmail(event.target.value)} /></label>
            </div>
            <div className={s.quoteFields}>
              <label htmlFor="quote-phone" className={s.quoteWide}><span>&nbsp;<strong>Teléfono</strong> (opcional)</span><input id="quote-phone" name="phone" type="tel" autoComplete="tel" maxLength={30} placeholder="+56 9 1234 5678" value={phone} onChange={event => setPhone(event.target.value)} /></label>
            </div>
            {/* Campo trampa anti-bots: fuera de pantalla y fuera del orden de tabulación. */}
            <div aria-hidden="true" className={s.honeypot}><label>Sitio web<input tabIndex={-1} autoComplete="off" name={SALES_LEAD_HONEYPOT_FIELD} value={honeypot} onChange={event => setHoneypot(event.target.value)} /></label></div>
            <button className={s.quoteSubmit} type="submit" disabled={status.kind === 'sending'}>{status.kind === 'sending' ? 'Enviando…' : 'Solicitar demo y cotización'} <Send size={17} aria-hidden="true" /></button>
            <p className={s.quoteNote}>Usamos tus datos solo para responder esta solicitud. Sin compromiso de compra.</p>
            {status.kind === 'error' && <p className={s.quoteStatus} role="alert">{status.message} Puedes <a href={mailtoHref}>escribirnos por correo</a> con tu solicitud ya redactada.</p>}
            {whatsapp && /^\d{8,15}$/.test(whatsapp) && <a className={s.contactAlternative} href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">Prefiero conversar por WhatsApp <ArrowUpRight size={14} /></a>}
          </form>
        )}
      </div>
    </section>
  );
}
