export interface SurveyAnswer {
  csat: number | null;
  nps: number | null;
}

export interface SurveyMetrics {
  /** Encuestas con al menos una respuesta. */
  responses: number;
  /** NPS entero de -100 a 100; `null` si nadie contestó la pregunta de recomendación. */
  nps: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  /** Promedio de satisfacción (1-5) con un decimal; `null` si nadie contestó. */
  csat: number | null;
  csatResponses: number;
}

/** 9-10 promotor, 7-8 pasivo, 0-6 detractor (definición estándar del NPS). */
export function npsCategory(score: number): 'promoter' | 'passive' | 'detractor' {
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'passive';
  return 'detractor';
}

/**
 * Métricas de satisfacción. Una métrica sin datos se omite (`null`), nunca se
 * rellena con un valor inventado: un NPS de 0 con cero respuestas
 * engañaría más que mostrar "sin datos".
 */
export function computeSurveyMetrics(answers: SurveyAnswer[]): SurveyMetrics {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  let csatSum = 0;
  let csatCount = 0;
  let responses = 0;
  for (const answer of answers) {
    if (answer.nps === null && answer.csat === null) continue;
    responses += 1;
    if (answer.nps !== null) {
      const category = npsCategory(answer.nps);
      if (category === 'promoter') promoters += 1;
      else if (category === 'passive') passives += 1;
      else detractors += 1;
    }
    if (answer.csat !== null) {
      csatSum += answer.csat;
      csatCount += 1;
    }
  }
  const npsTotal = promoters + passives + detractors;
  return {
    responses,
    nps: npsTotal === 0 ? null : Math.round(((promoters - detractors) / npsTotal) * 100),
    promoters,
    passives,
    detractors,
    csat: csatCount === 0 ? null : Math.round((csatSum / csatCount) * 10) / 10,
    csatResponses: csatCount,
  };
}

/** Una respuesta que merece llamada: detractor del NPS o satisfacción baja. */
export function needsFollowUp(answer: SurveyAnswer): boolean {
  return (answer.nps !== null && answer.nps <= 6) || (answer.csat !== null && answer.csat <= 2);
}
