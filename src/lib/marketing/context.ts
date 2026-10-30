import { createHash } from 'node:crypto';
import { plans as landingPlans } from '@/components/marketing/content';
import { getModule, type FeatureKey } from '@/lib/auth/modules';
import { UNPRICED_FEATURES } from '@/lib/pricing/catalog';
import { getShowcaseCards, getShowcaseDetail } from './module-showcase-content';
import { BRAND_VOICE, CHANNEL_RULES, MARKETING_CHANNELS } from './brand-voice';
import { CLAIM_GUARDRAILS } from './claims';
import type { CopyReviewContext } from './copy-review';

/**
 * Contexto del agente de marketing de la Supersuite (orden
 * `marketing.contexto`, ADR 0015): la única fuente de verdad de qué es
 * Aether, qué ofrece, qué pantallas reales se pueden mostrar, cómo se habla y
 * qué no se puede decir. El agente NO escribe sobre nada que no esté aquí:
 * «nunca un dato inventado» vale también para el marketing.
 *
 * Solo datos públicos (los mismos del landing y de las páginas de módulos):
 * nunca datos de empresas clientes ni de su uso. `version` es un hash del
 * contenido: si no cambió, la Supersuite puede seguir con lo que tiene.
 */

export const MARKETING_UTM_SOURCES = ['instagram', 'facebook', 'linkedin', 'tiktok', 'google', 'youtube', 'email', 'whatsapp', 'aether-badge'] as const;
export const MARKETING_UTM_MEDIUMS = ['social', 'paid', 'email', 'referral', 'bio', 'story'] as const;

export interface MarketingContextInput {
  baseUrl: string;
  salesEmail: string;
}

/** Precios que Aether publica hoy: los «desde» del landing. Vacío = se cotiza a medida. */
export function publicPrices(): number[] {
  return landingPlans.flatMap((plan) => (plan.priceFrom !== null ? [plan.priceFrom] : []));
}

/** Datos de la revisión automática de textos, coherentes con el contexto. */
export function copyReviewContext(input: MarketingContextInput): CopyReviewContext {
  const host = (() => {
    try {
      return new URL(input.baseUrl).hostname;
    } catch {
      return '';
    }
  })();
  return { preciosValidos: publicPrices(), dominiosPropios: host ? [host] : [], correosPermitidos: [input.salesEmail] };
}

export function buildMarketingContext(input: MarketingContextInput) {
  const base = input.baseUrl.replace(/\/$/, '');
  const abs = (path: string) => `${base}${path}`;
  const prices = publicPrices();

  const modulos = getShowcaseCards().map((card) => {
    const detail = getShowcaseDetail(card.slug);
    return {
      id: card.quoteId ?? card.slug,
      nombre: card.title,
      categoria: card.category,
      resumen: card.summary,
      incluidoEnLaBase: card.quoteId === null,
      pagina: abs(`/modulos/${card.slug}`),
      portada: card.cover ? abs(card.cover) : null,
      // Lo que la persona hace en cada pantalla, con sus pasos reales del manual: la materia prima de un carrusel.
      pantallas: (detail?.screens ?? []).map((screen) => ({
        id: screen.id,
        titulo: screen.title,
        resumen: screen.summary,
        captura: screen.screenshot ? abs(screen.screenshot) : null,
        temas: screen.topics.map((topic) => ({ titulo: topic.title, pasos: topic.steps })),
      })),
    };
  });

  const datos = {
    marca: {
      nombre: 'Aether ERP',
      promesa: 'Tu empresa, conectada',
      descripcion: 'ERP chileno para gestionar tu empresa en un solo sistema: ventas, inventario, compras, finanzas y contabilidad, con cumplimiento SII.',
      colores: { tinta: '#12161f', dorado: '#dbc076', blanco: '#ffffff' },
      tipografias: { titulares: 'Anton', texto: 'Geist' },
      logos: {
        completo: abs('/branding/aether-logo-full.png'),
        sobreOscuro: abs('/branding/logo-on-dark.png'),
        icono: abs('/branding/aether-icon.png'),
      },
      sitio: abs('/'),
      paginaEmpresas: abs('/empresas'),
      privacidad: abs('/aether/privacidad'),
      correoVentas: input.salesEmail,
    },
    guia: BRAND_VOICE,
    canales: Object.fromEntries(MARKETING_CHANNELS.map((canal) => [canal, CHANNEL_RULES[canal]])),
    afirmaciones: CLAIM_GUARDRAILS.map(({ id, tema, nivel, regla, porQue }) => ({ id, tema, nivel, regla, porQue })),
    oferta: {
      politicaDePrecios: prices.length
        ? { publica: true, preciosDesde: prices, nota: 'Precios netos mensuales: siempre «+ IVA».' }
        : { publica: false, preciosDesde: [], nota: 'Aether no publica precios: se cotiza a medida según los módulos. En vez de un monto, invita a cotizar (página del módulo o /empresas).' },
      planes: landingPlans.map((plan) => ({ nombre: plan.name, paraQuien: plan.audience, incluye: plan.includes, recomendado: plan.featured === true })),
      modulos,
      // Existen, pero NO se promocionan: están fuera de la oferta hasta que se les ponga precio.
      noPromocionar: UNPRICED_FEATURES.map((flag: FeatureKey) => getModule(flag).label),
    },
    enlaces: {
      parametros: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'],
      fuentes: MARKETING_UTM_SOURCES,
      medios: MARKETING_UTM_MEDIUMS,
      reglas: [
        'Todo enlace a Aether lleva utm_source (la red), utm_medium (social, paid, bio, story…), utm_campaign (id de la campaña) y utm_content (id de la pieza).',
        'Valores en minúsculas, sin tildes ni espacios (a-z, 0-9, punto, guion y guion bajo; máximo 80): el landing descarta lo demás.',
        'Lleva a la página del módulo de la pieza (`oferta.modulos[].pagina`), no a la portada, salvo piezas de marca.',
      ],
      ejemplo: `${abs('/modulos/punto-de-venta')}?utm_source=instagram&utm_medium=social&utm_campaign=pos-cierre-de-caja&utm_content=carrusel-01`,
    },
    medicion: {
      eventos: {
        landing_visita: 'Visita al landing desde un enlace con campaña (una por campaña y pestaña). Señal indicativa.',
        lead_recibido: 'Solicitud de demo o de cotización, con su referencia L-XXXXXXXX y la campaña (primer y último contacto).',
      },
      cierre: 'Ventas pega la referencia del lead en la orden empresa.crear (leadRef): así la Supersuite une publicación → lead → empresa → tarifa mensual.',
    },
  };

  const version = createHash('sha256').update(JSON.stringify(datos)).digest('hex').slice(0, 16);
  return { version, ...datos };
}

export type MarketingContext = ReturnType<typeof buildMarketingContext>;
