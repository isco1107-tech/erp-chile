'use client';

import { useState } from 'react';
import { HeartHandshake } from 'lucide-react';
import { PublicButton, PublicCard, PublicCardHeader, PublicField, PublicFooter, PublicPage, PublicShell, PublicStatus, PublicTopBar } from '@/components/public/PublicShell';
import { submitSurveyAction } from '@/modules/customer-care/actions/survey-portal.actions';

const CSAT_LABELS = ['Muy mala', 'Mala', 'Regular', 'Buena', 'Excelente'];

function Choice({ label, options, value, onChange }: { label: string; options: Array<{ value: number; text: string; title?: string }>; value: number | null; onChange: (value: number) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="pub-chips">
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} title={option.title} className={`pub-chip ${value === option.value ? 'is-active' : ''}`} onClick={() => onChange(option.value)}>
          {option.text}
        </button>
      ))}
    </div>
  );
}

/** Encuesta pública de satisfacción (`/encuesta/[token]`): 3 preguntas y un comentario. */
export default function SurveyClient({ token, companyName, intro }: { token: string; companyName: string; intro: string }) {
  const [csat, setCsat] = useState<number | null>(null);
  const [nps, setNps] = useState<number | null>(null);
  const [onTime, setOnTime] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (csat === null || nps === null) {
      setError('Responde las dos primeras preguntas para enviar.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await submitSurveyAction(token, { csat, nps, deliveryOnTime: onTime ?? undefined, comment: comment.trim() || undefined });
      if (result.success) setDone(true);
      else setError(result.error);
    } finally {
      setSending(false);
    }
  }

  if (done) return <PublicStatus accent="gold" variant="success" title="¡Gracias por tu opinión!" message={`Nos ayuda a mejorar cada día. Equipo de ${companyName}.`} />;

  return (
    <PublicPage accent="gold">
      <PublicTopBar brand={companyName} />
      <PublicShell>
        <PublicCard glow>
          <PublicCardHeader icon={<HeartHandshake className="size-5" />} eyebrow="Encuesta breve" title="Tu opinión nos importa" subtitle={intro} />
          <div className="mt-2 space-y-5">
            <PublicField id="csat" label="¿Qué tan satisfecho quedaste con tu compra?">
              <Choice label="Satisfacción de 1 a 5" value={csat} onChange={setCsat} options={CSAT_LABELS.map((text, index) => ({ value: index + 1, text: `${index + 1} · ${text}` }))} />
            </PublicField>
            <PublicField id="nps" label="¿Qué tan probable es que nos recomiendes? (0 = nada, 10 = totalmente)">
              <Choice label="Recomendación de 0 a 10" value={nps} onChange={setNps} options={Array.from({ length: 11 }, (_, value) => ({ value, text: String(value) }))} />
            </PublicField>
            <PublicField id="onTime" label="¿Tu pedido llegó en el plazo acordado?" optional>
              <div role="radiogroup" aria-label="Entrega a tiempo" className="pub-chips">
                {[
                  { value: true, text: 'Sí' },
                  { value: false, text: 'No' },
                ].map((option) => (
                  <button key={option.text} type="button" role="radio" aria-checked={onTime === option.value} className={`pub-chip ${onTime === option.value ? 'is-active' : ''}`} onClick={() => setOnTime(option.value)}>
                    {option.text}
                  </button>
                ))}
              </div>
            </PublicField>
            <PublicField id="comment" label="¿Algo que quieras contarnos?" optional>
              <textarea id="comment" rows={3} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} />
            </PublicField>
            {error && (
              <p role="alert" className="pub-subtitle">
                {error}
              </p>
            )}
            <PublicButton full onClick={submit} disabled={sending}>
              {sending ? 'Enviando…' : 'Enviar mi opinión'}
            </PublicButton>
          </div>
        </PublicCard>
        <PublicFooter>Tus respuestas las ve solo el equipo de {companyName}.</PublicFooter>
      </PublicShell>
    </PublicPage>
  );
}
