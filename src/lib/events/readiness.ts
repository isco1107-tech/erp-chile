import { formatCurrency } from '@/lib/chile/tax';

/**
 * "¿Listos para la gala?" — checklist de preparación de un certamen.
 *
 * Función pura sobre un resumen de conteos que arma el servicio del centro
 * de mando: no consulta la base ni guarda nada, cada ítem se deriva de datos
 * reales en cada lectura (mismo criterio que el resto de estados derivados
 * del sistema). Solo aparecen los ítems de los módulos que la empresa tiene
 * contratados: a quien no compró Jurado no se le exige configurar jurados.
 */

export type ReadinessStatus = 'ok' | 'warn' | 'todo';

export type ReadinessArea = 'general' | 'candidates' | 'judging' | 'production' | 'sponsorships' | 'ticketing' | 'voting' | 'site';

export const READINESS_AREA_LABELS: Record<ReadinessArea, string> = {
  general: 'Datos del evento',
  candidates: 'Candidatas',
  judging: 'Jurado y escrutinio',
  production: 'Producción en vivo',
  sponsorships: 'Auspicios',
  ticketing: 'Entradas',
  voting: 'Votación del público',
  site: 'Sitio público',
};

export interface ReadinessItem {
  id: string;
  area: ReadinessArea;
  label: string;
  status: ReadinessStatus;
  detail: string;
  href: string;
}

export interface PageantReadinessInput {
  projectId: string;
  now: Date;
  galaDate: Date | null;
  venueName: string | null;
  modules: {
    candidates: boolean;
    judging: boolean;
    production: boolean;
    sponsorships: boolean;
    ticketing: boolean;
    voting: boolean;
    projects: boolean;
  };
  candidates: {
    official: number;
    applicantsToReview: number;
    numbered: number;
    withPhoto: number;
    contractsSigned: number;
  };
  judging: {
    rounds: number;
    roundsWithValidWeights: number;
    hasFinalRound: boolean;
    judges: number;
  };
  production: {
    stageBlocks: number;
    wardrobeItems: number;
    wardrobeNotReady: number;
    accreditations: number;
  };
  sponsorships: {
    confirmed: number;
    deliverablesTotal: number;
    deliverablesDone: number;
    deliverablesOverdue: number;
    cashCommitted: number;
    cashCollected: number;
    agreementsPendingSignature: number;
  };
  ticketing: {
    ticketTypes: number;
    linkActive: boolean;
    ordersPendingPayment: number;
  };
  voting: {
    linkActive: boolean;
  };
  site: {
    published: boolean;
    hasCover: boolean;
  };
}

export interface ReadinessReport {
  items: ReadinessItem[];
  /** 0-100: `ok` vale 1, `warn` medio punto, `todo` cero. */
  score: number;
  /** Días calendario hasta la gala (negativo si ya pasó); `null` sin fecha. */
  daysToGala: number | null;
  /** Pendientes duros (`todo`) cuando la gala está a 14 días o menos. */
  critical: ReadinessItem[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CRITICAL_WINDOW_DAYS = 14;
const RECOMMENDED_JUDGES = 3;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildPageantReadiness(input: PageantReadinessInput): ReadinessReport {
  const { projectId, modules } = input;
  const items: ReadinessItem[] = [];
  const add = (item: ReadinessItem) => items.push(item);
  const projectHref = `/dashboard/projects/${projectId}`;

  add({
    id: 'gala-date',
    area: 'general',
    label: 'Fecha y hora de la gala',
    status: input.galaDate ? 'ok' : 'todo',
    detail: input.galaDate ? 'Definida' : 'Sin fecha: la cuenta regresiva y el modo show no tienen referencia',
    href: `${projectHref}/edit`,
  });
  add({
    id: 'venue',
    area: 'general',
    label: 'Recinto de la gala',
    status: input.venueName ? 'ok' : 'warn',
    detail: input.venueName ?? 'Sin recinto informado',
    href: `${projectHref}/edit`,
  });

  if (modules.candidates) {
    const c = input.candidates;
    add({
      id: 'candidates-official',
      area: 'candidates',
      label: 'Candidatas oficiales confirmadas',
      status: c.official > 0 ? 'ok' : 'todo',
      detail:
        c.official > 0
          ? `${plural(c.official, 'oficial', 'oficiales')}${c.applicantsToReview > 0 ? ` · ${plural(c.applicantsToReview, 'postulación', 'postulaciones')} por revisar` : ''}`
          : c.applicantsToReview > 0
            ? `${plural(c.applicantsToReview, 'postulación', 'postulaciones')} esperando revisión de casting`
            : 'Todavía no hay candidatas oficiales',
      href: '/dashboard/candidates',
    });
    if (c.official > 0) {
      add({
        id: 'candidates-numbered',
        area: 'candidates',
        label: 'Numeración oficial asignada',
        status: c.numbered >= c.official ? 'ok' : 'warn',
        detail: c.numbered >= c.official ? 'Todas numeradas' : `Faltan ${c.official - c.numbered} por numerar`,
        href: '/dashboard/candidates/casting',
      });
      add({
        id: 'candidates-photos',
        area: 'candidates',
        label: 'Foto oficial de cada candidata',
        status: c.withPhoto >= c.official ? 'ok' : 'warn',
        detail: c.withPhoto >= c.official ? 'Completas' : `Faltan ${c.official - c.withPhoto} fotos`,
        href: '/dashboard/candidates',
      });
      add({
        id: 'candidates-contracts',
        area: 'candidates',
        label: 'Contratos de imagen firmados',
        status: c.contractsSigned >= c.official ? 'ok' : c.contractsSigned > 0 ? 'warn' : 'todo',
        detail: `${c.contractsSigned} de ${c.official} firmados`,
        href: '/dashboard/candidates/compliance',
      });
    }
  }

  if (modules.judging) {
    const j = input.judging;
    add({
      id: 'judging-rounds',
      area: 'judging',
      label: 'Rondas del certamen',
      status: j.rounds === 0 ? 'todo' : j.hasFinalRound ? 'ok' : 'warn',
      detail: j.rounds === 0 ? 'Sin rondas configuradas' : j.hasFinalRound ? plural(j.rounds, 'ronda', 'rondas') : 'Falta marcar cuál es la ronda final',
      href: '/dashboard/judging',
    });
    if (j.rounds > 0) {
      const invalid = j.rounds - j.roundsWithValidWeights;
      add({
        id: 'judging-weights',
        area: 'judging',
        label: 'Ponderaciones que suman 100%',
        status: invalid === 0 ? 'ok' : 'todo',
        detail: invalid === 0 ? 'Todas las rondas cuadran' : `${plural(invalid, 'ronda', 'rondas')} con categorías que no suman 100%`,
        href: '/dashboard/judging',
      });
    }
    add({
      id: 'judging-judges',
      area: 'judging',
      label: 'Jurados con acceso',
      status: j.judges >= RECOMMENDED_JUDGES ? 'ok' : j.judges > 0 ? 'warn' : 'todo',
      detail:
        j.judges === 0
          ? 'Sin jurados invitados'
          : j.judges < RECOMMENDED_JUDGES
            ? `${plural(j.judges, 'jurado', 'jurados')} — se recomiendan al menos ${RECOMMENDED_JUDGES}`
            : plural(j.judges, 'jurado', 'jurados'),
      href: '/dashboard/judging',
    });
  }

  if (modules.production) {
    const p = input.production;
    add({
      id: 'production-run-of-show',
      area: 'production',
      label: 'Escaleta de la gala',
      status: p.stageBlocks > 0 ? 'ok' : 'todo',
      detail: p.stageBlocks > 0 ? plural(p.stageBlocks, 'bloque', 'bloques') : 'Sin bloques cargados',
      href: '/dashboard/production/timeline',
    });
    add({
      id: 'production-wardrobe',
      area: 'production',
      label: 'Vestuario listo',
      status: p.wardrobeItems === 0 ? 'warn' : p.wardrobeNotReady === 0 ? 'ok' : 'warn',
      detail:
        p.wardrobeItems === 0
          ? 'Sin looks registrados'
          : p.wardrobeNotReady === 0
            ? `${plural(p.wardrobeItems, 'look', 'looks')} listos`
            : `${plural(p.wardrobeNotReady, 'look', 'looks')} todavía pendientes`,
      href: '/dashboard/production/wardrobe',
    });
    add({
      id: 'production-accreditations',
      area: 'production',
      label: 'Acreditaciones emitidas',
      status: p.accreditations > 0 ? 'ok' : 'todo',
      detail: p.accreditations > 0 ? plural(p.accreditations, 'credencial', 'credenciales') : 'Sin credenciales emitidas',
      href: '/dashboard/production/accreditation',
    });
  }

  if (modules.sponsorships) {
    const s = input.sponsorships;
    add({
      id: 'sponsors-confirmed',
      area: 'sponsorships',
      label: 'Auspiciadores confirmados',
      status: s.confirmed > 0 ? 'ok' : 'todo',
      detail: s.confirmed > 0 ? plural(s.confirmed, 'marca', 'marcas') : 'Sin auspicios confirmados',
      href: '/dashboard/sponsorships',
    });
    if (s.deliverablesTotal > 0) {
      add({
        id: 'sponsors-deliverables',
        area: 'sponsorships',
        label: 'Compromisos con marcas',
        status: s.deliverablesOverdue > 0 ? 'todo' : s.deliverablesDone >= s.deliverablesTotal ? 'ok' : 'warn',
        detail:
          s.deliverablesOverdue > 0
            ? `${plural(s.deliverablesOverdue, 'entregable vencido', 'entregables vencidos')} · ${s.deliverablesDone}/${s.deliverablesTotal} cumplidos`
            : `${s.deliverablesDone}/${s.deliverablesTotal} cumplidos`,
        href: '/dashboard/sponsorships/compliance',
      });
    }
    if (s.cashCommitted > 0) {
      add({
        id: 'sponsors-collection',
        area: 'sponsorships',
        label: 'Cobranza de auspicios',
        status: s.cashCollected >= s.cashCommitted ? 'ok' : 'warn',
        detail: `Cobrado ${formatCurrency(s.cashCollected)} de ${formatCurrency(s.cashCommitted)}`,
        href: '/dashboard/sponsorships',
      });
    }
    if (s.agreementsPendingSignature > 0) {
      add({
        id: 'sponsors-agreements',
        area: 'sponsorships',
        label: 'Cartas de compromiso firmadas',
        status: 'warn',
        detail: `${plural(s.agreementsPendingSignature, 'carta', 'cartas')} esperando firma`,
        href: '/dashboard/sponsorships/compliance',
      });
    }
  }

  if (modules.ticketing) {
    const t = input.ticketing;
    add({
      id: 'tickets-setup',
      area: 'ticketing',
      label: 'Venta de entradas abierta',
      status: t.ticketTypes > 0 && t.linkActive ? 'ok' : t.ticketTypes > 0 ? 'warn' : 'todo',
      detail: t.ticketTypes === 0 ? 'Sin tipos de entrada' : t.linkActive ? plural(t.ticketTypes, 'tipo de entrada', 'tipos de entrada') : 'Falta generar el link de venta',
      href: '/dashboard/ticketing',
    });
    if (t.ordersPendingPayment > 0) {
      add({
        id: 'tickets-pending',
        area: 'ticketing',
        label: 'Pagos de entradas por confirmar',
        status: 'warn',
        detail: `${plural(t.ordersPendingPayment, 'orden', 'órdenes')} esperando confirmación`,
        href: '/dashboard/ticketing',
      });
    }
  }

  if (modules.voting) {
    add({
      id: 'voting-link',
      area: 'voting',
      label: 'Votación del público habilitada',
      status: input.voting.linkActive ? 'ok' : 'warn',
      detail: input.voting.linkActive ? 'Link de votación activo' : 'Falta generar el link de votación',
      href: '/dashboard/voting',
    });
  }

  if (modules.projects) {
    add({
      id: 'site-published',
      area: 'site',
      label: 'Micrositio del certamen publicado',
      status: input.site.published ? (input.site.hasCover ? 'ok' : 'warn') : 'warn',
      detail: input.site.published ? (input.site.hasCover ? 'Publicado' : 'Publicado sin imagen de portada') : 'Sin publicar',
      href: `${projectHref}/site`,
    });
  }

  const points = items.reduce((sum, item) => sum + (item.status === 'ok' ? 1 : item.status === 'warn' ? 0.5 : 0), 0);
  const score = items.length === 0 ? 0 : Math.round((points / items.length) * 100);
  const daysToGala = input.galaDate ? Math.ceil((input.galaDate.getTime() - input.now.getTime()) / DAY_MS) : null;
  const critical = daysToGala !== null && daysToGala <= CRITICAL_WINDOW_DAYS && daysToGala >= 0 ? items.filter((item) => item.status === 'todo') : [];

  return { items, score, daysToGala, critical };
}
