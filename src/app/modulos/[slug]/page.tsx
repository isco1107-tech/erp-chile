import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ModulePage from '@/components/marketing/modules/ModulePage';
import { SHOWCASE_MODULES } from '@/lib/marketing/module-showcase';
import { getShowcaseCards, getShowcaseDetail } from '@/lib/marketing/module-showcase-content';
import { getSalesEmail } from '@/lib/marketing/sales-lead';
import { getAppUrl } from '@/lib/email/mailer';

/** Cuántos módulos de la misma área se sugieren al pie. */
const RELATED_COUNT = 4;

// Las páginas se generan al compilar; un slug fuera de la vitrina es 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return SHOWCASE_MODULES.map((module) => ({ slug: module.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const detail = getShowcaseDetail(slug);
  if (!detail) return {};
  const { card } = detail;
  const title = `${card.title} | Módulos de Aether ERP`;
  return {
    metadataBase: new URL(getAppUrl()),
    title,
    description: card.summary,
    alternates: { canonical: `/modulos/${card.slug}` },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description: card.summary,
      type: 'website',
      locale: 'es_CL',
      siteName: 'Aether ERP',
      url: `/modulos/${card.slug}`,
      ...(card.cover ? { images: [{ url: card.cover, width: 1366, height: 854, alt: `Pantalla de ${card.title}` }] } : {}),
    },
  };
}

export default async function ModuloPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = getShowcaseDetail(slug);
  if (!detail) notFound();

  const cards = getShowcaseCards();
  const related = cards.filter((card) => card.category === detail.card.category && card.slug !== slug).slice(0, RELATED_COUNT);
  const quotable = cards.flatMap((card) => (card.quoteId ? [{ id: card.quoteId, title: card.title }] : []));

  return <ModulePage detail={detail} related={related} quotable={quotable} salesEmail={getSalesEmail()} legalName={process.env.AETHER_LEGAL_NAME} />;
}
