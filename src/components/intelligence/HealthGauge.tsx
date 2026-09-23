import type { HealthGrade } from '@/lib/intelligence/health-score';
import { cn } from '@/lib/utils';

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function toneFor(score: number): { stroke: string; text: string; label: string } {
  if (score >= 70) return { stroke: 'var(--success)', text: 'text-success', label: 'Saludable' };
  if (score >= 45) return { stroke: 'var(--warning)', text: 'text-warning', label: 'Requiere atención' };
  return { stroke: 'var(--danger)', text: 'text-danger', label: 'En riesgo' };
}

/**
 * Anillo del puntaje de salud (0-100). SVG puro: se renderiza en el servidor
 * y hereda los tokens del tema, sin depender de la librería de gráficos.
 */
export function HealthGauge({ score, grade, className }: { score: number; grade: HealthGrade; className?: string }) {
  const tone = toneFor(score);
  const offset = CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, score)) / 100);

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div className="relative size-40">
        <svg viewBox="0 0 128 128" className="size-full -rotate-90" role="img" aria-label={`Puntaje de salud ${score} de 100, nota ${grade}`}>
          <circle cx="64" cy="64" r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth="10" />
          <circle
            cx="64"
            cy="64"
            r={RADIUS}
            fill="none"
            stroke={tone.stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold tracking-[-0.03em] tabular-nums text-foreground">{score}</span>
          <span className="text-xs text-muted-foreground">de 100</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn('flex size-7 items-center justify-center rounded-md bg-muted text-sm font-bold', tone.text)}>{grade}</span>
        <span className={cn('text-sm font-semibold', tone.text)}>{tone.label}</span>
      </div>
    </div>
  );
}
