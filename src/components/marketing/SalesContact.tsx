'use client';

import { useState } from 'react';
import { ArrowUpRight, Check, Mail, Send } from 'lucide-react';
import s from './landing.module.css';

const solutions = ['Ventas e inventario', 'Finanzas y contabilidad', 'Eventos y producción'];

export default function SalesContact({ email, whatsapp }: { email: string; whatsapp?: string }) {
  const [selected, setSelected] = useState<string[]>([solutions[0]]);
  const [company, setCompany] = useState('');
  const [team, setTeam] = useState('1 a 5 personas');
  const [prepared, setPrepared] = useState(false);
  const message = `Hola, equipo Aether:\n\nMe gustaría conocer el ERP y recibir una cotización.\n\nEmpresa: ${company.trim() || 'Por definir'}\nEquipo: ${team}\nÁreas de interés: ${selected.join(', ') || 'Necesito orientación'}\n\nQuisiera coordinar una demostración y conocer los módulos, el valor y las opciones de implementación para mi empresa.\n\nGracias.`;
  const href = `mailto:${email}?subject=${encodeURIComponent('Demo y cotización de Aether ERP')}&body=${encodeURIComponent(message)}`;

  return (
    <section id="cotizar" className={`${s.section} ${s.contact}`}>
      <div className={`${s.container} ${s.contactGrid}`}>
        <div className={s.contactCopy}>
          <p className={s.kicker}>EL ERP QUE CALZA CON TU EMPRESA</p>
          <h2>Tu próximo paso.<br /><span>A tu medida.</span></h2>
          <p>No todas las empresas necesitan lo mismo. Cuéntanos qué quieres ordenar y conversemos sobre una configuración para tu operación.</p>
          <ul><li><Check size={18} />Una demo enfocada en tus procesos</li><li><Check size={18} />Módulos según lo que necesitas</li><li><Check size={18} />Cotización antes de contratar</li></ul>
          <a href={`mailto:${email}`} className={s.contactEmail}><Mail size={17} />{email}<ArrowUpRight size={15} /></a>
        </div>
        <form className={s.quoteCard} onSubmit={event => { event.preventDefault(); window.location.href = href; setPrepared(true); }}>
          <div className={s.quoteHeading}><span>HABLEMOS DE TU NEGOCIO</span><span>01 — 03</span></div>
          <fieldset><legend>01 <span>¿Qué quieres conectar?</span></legend><div className={s.solutionChoices}>{solutions.map(solution => <label key={solution}><input type="checkbox" checked={selected.includes(solution)} onChange={() => setSelected(current => current.includes(solution) ? current.filter(value => value !== solution) : [...current, solution])} /><span><Check size={15} />{solution}</span></label>)}</div></fieldset>
          <div className={s.quoteFields}><label htmlFor="quote-company"><span>02 <strong>Tu empresa</strong></span><input id="quote-company" name="company" autoComplete="organization" maxLength={120} placeholder="Nombre de tu empresa" value={company} onChange={event => setCompany(event.target.value)} /></label><label htmlFor="quote-team"><span>03 <strong>Tu equipo</strong></span><select id="quote-team" name="team" value={team} onChange={event => setTeam(event.target.value)}><option>1 a 5 personas</option><option>6 a 20 personas</option><option>21 a 50 personas</option><option>Más de 50 personas</option></select></label></div>
          <div className={s.quoteSummary}><span>Tu punto de partida</span><p>{selected.length ? selected.join(' + ') : 'Una conversación para encontrar tu solución'}</p><strong>Cotización a medida</strong></div>
          <button className={s.quoteSubmit} type="submit">Solicitar demo y cotización <Send size={17} /></button>
          <p className={s.quoteNote}>Se abrirá tu correo con la solicitud preparada. Tú decides cuándo enviarla. Sin compromiso de compra.</p>
          {prepared && <p className={s.quoteStatus} role="status">Envía el mensaje desde tu aplicación de correo para completar la solicitud. Si no se abrió, escríbenos a <a href={href}>{email}</a>.</p>}
          {whatsapp && /^\d{8,15}$/.test(whatsapp) && <a className={s.contactAlternative} href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">Prefiero conversar por WhatsApp <ArrowUpRight size={14} /></a>}
        </form>
      </div>
    </section>
  );
}
