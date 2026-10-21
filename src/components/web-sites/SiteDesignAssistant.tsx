'use client';

import { useRef, useState } from 'react';
import { Sparkles, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TextField } from './fields';
import { proposeSiteDesignAction } from '@/modules/web-sites/actions/ai-designer.actions';
import type { DesignerRequest, DesignerProposal } from '@/lib/web-sites/ai-designer';
import SiteRenderer from './SiteRenderer';

type DesignerContext = DesignerRequest extends infer R ? R extends DesignerRequest ? Omit<R, 'instruction'> : never : never;
interface Props {
  context: DesignerContext;
  disabled: boolean;
  onApply: (proposal: DesignerProposal) => void;
}

/** La propuesta nunca se guarda ni publica por el solo hecho de recibirla. */
export function SiteDesignAssistant({ context, disabled, onApply }: Props) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<DesignerProposal | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const sequence = useRef(0);
  const pending = useRef(false);
  const stale = base !== null && base !== JSON.stringify(context);

  async function generate() {
    if (disabled || pending.current || instruction.trim().length < 10) return;
    pending.current = true;
    const id = ++sequence.current;
    const original = JSON.stringify(context);
    setBusy(true); setError(null); setProposal(null); setBase(original);
    try {
      const result = await proposeSiteDesignAction({ ...context, instruction });
      if (sequence.current !== id) return;
      if (!result.success) { setError(result.error); return; }
      setProposal(result.data);
    } catch {
      if (sequence.current === id) setError('Se interrumpió la conexión. Tus cambios siguen en el editor; vuelve a intentar la propuesta.');
    } finally {
      pending.current = false;
      if (sequence.current === id) setBusy(false);
    }
  }
  function apply() {
    if (!proposal || disabled) return;
    if (base !== JSON.stringify(context)) { setError('El contenido cambió mientras preparabas la propuesta. Genera otra usando la versión actual.'); return; }
    onApply(proposal); setProposal(null); setBase(null);
  }

  return (
    <section className="space-y-3 rounded-xl border border-primary/30 bg-card p-4" aria-label="Asistente IA de diseño web">
      <div className="flex items-center gap-2"><Sparkles aria-hidden="true" className="size-4 text-primary" /><h3 className="text-sm font-semibold">Tu diseñador web con IA</h3></div>
      <p className="text-xs text-muted-foreground">Describe el estilo, el público y qué quieres mejorar. La IA prepara una propuesta editable usando el contenido de este sitio.</p>
      <TextField label="¿Qué página quieres crear o mejorar?" value={instruction} onChange={setInstruction} max={4000} multiline rows={4} disabled={disabled || busy} placeholder="Quiero una página elegante para mi academia, con una portada impactante, pasos de inscripción claros, colores de mi marca y movimiento suave. Conserva las clases y precios actuales." />
      <div className="flex flex-wrap gap-2">
        {['Mejora la jerarquía visual y la lectura en móvil, conservando los datos actuales.', 'Dale un diseño editorial elegante con colores coherentes y llamadas a la acción claras.', 'Mejora los textos para mi público sin inventar datos ni testimonios.'].map((text, index) => <Button key={text} type="button" size="xs" variant="outline" disabled={disabled || busy} onClick={() => setInstruction(text)}>{['Mejorar móvil', 'Diseño editorial', 'Mejorar textos'][index]}</Button>)}
      </div>
      <Button type="button" size="sm" disabled={disabled || busy || instruction.trim().length < 10} onClick={() => void generate()}>{busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Sparkles aria-hidden="true" />}{busy ? 'Diseñando tu propuesta…' : 'Preparar propuesta'}</Button>
      <p className="text-xs text-muted-foreground">Usa Gemini o NVIDIA configurado en el servidor. La disponibilidad depende de la cuota del proveedor. Se envían tu requerimiento y el contenido de presentación de esta página.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {proposal && <div className="space-y-3 rounded-lg border border-border p-3" aria-live="polite">
        <p className="text-sm font-medium">{proposal.summary}</p>
        <ul className="list-disc space-y-1 pl-5 text-xs">{proposal.changes.map((change, index) => <li key={index}>{change}</li>)}</ul>
        {(proposal.target === 'web' || proposal.target === 'academy-studio' || proposal.target === 'event-studio') ? <details><summary className="cursor-pointer text-sm font-medium">Vista previa de la propuesta</summary><div className="mt-2 max-h-[32rem] overflow-auto rounded-lg border"><SiteRenderer name="Propuesta de diseño" logoUrl={null} blocks={proposal.design.blocks} theme={proposal.design.theme} slug="proposal" mode="preview" /></div></details> : <details><summary className="cursor-pointer text-sm font-medium">Revisar los textos propuestos</summary><div className="mt-2 space-y-3 text-sm">{proposal.target === 'event' ? <><p className="font-semibold">{proposal.design.publicTagline}</p><p className="whitespace-pre-wrap">{proposal.design.publicDescription}</p><p>{proposal.design.sponsorExclusivityNote}</p><p>Color: {proposal.design.publicAccent}</p></> : <><p className="font-semibold">{proposal.design.tagline}</p><p>{proposal.design.aboutTitle}</p><p className="whitespace-pre-wrap">{proposal.design.intro}</p><p className="whitespace-pre-wrap">{proposal.design.history}</p>{proposal.design.disciplines.map((d, i) => <p key={i}><strong>{d.title}</strong> · {d.text}</p>)}{proposal.design.steps.map((s, i) => <p key={i}><strong>{s.title}</strong> · {s.text}</p>)}{proposal.design.benefits.map((b, i) => <p key={i}>{b}</p>)}{proposal.design.faq.map((q, i) => <p key={i}><strong>{q.question}</strong> · {q.answer}</p>)}<p>{proposal.design.feeNote}</p><p>{proposal.design.promo}</p></>}</div></details>}
        {stale && <p role="status" className="text-xs text-warning">Editaste la página después de pedir esta propuesta. Genera una nueva para conservar los cambios.</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={disabled || stale || busy} onClick={apply}><Check aria-hidden="true" />Aplicar al editor</Button><Button type="button" size="sm" variant="outline" onClick={() => { setProposal(null); setBase(null); }}><X aria-hidden="true" />Descartar</Button></div>
        <p className="text-xs text-muted-foreground">Aplicar cambia el contenido del editor. Revisa el resultado antes de guardarlo o publicarlo.</p>
      </div>}
    </section>
  );
}
