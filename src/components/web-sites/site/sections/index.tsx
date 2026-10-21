import type { WebSiteBlock } from '@/lib/web-sites/blocks';
import type { RenderCtx } from '../context';
import type { SectionLook } from '../tone';
import { DividerSection, HeroSection, ImageSection, SplitSection, TextSection } from './basic';
import { ContactSection, CountdownSection, CtaSection, LinksSection } from './action';
import { AreasSection, ComparisonSection, HoursSection, MarqueeSection, PostsSection, TabsSection, TimelineSection } from './extra';
import { CatalogSection, FeaturesSection, PricelistSection, PricingSection, ScheduleSection, StatsSection, StepsSection, TeamSection } from './lists';
import { FormSection } from './form';
import { BeforeAfterSection, EmbedSection, GallerySection, MapSection, VideoSection } from './media';
import { FaqSection, LogosSection, QuoteSection, TestimonialsSection } from './social';

/** Contenido de una sección según su tipo. La franja (fondo, espaciado) la pone `SectionFrame`. */
export function renderSection(block: WebSiteBlock, ctx: RenderCtx, center: boolean, look: SectionLook) {
  switch (block.type) {
    case 'hero':
      return <HeroSection block={block} ctx={ctx} center={center} look={look} />;
    case 'text':
      return <TextSection block={block} ctx={ctx} center={center} />;
    case 'split':
      return <SplitSection block={block} ctx={ctx} center={center} />;
    case 'image':
      return <ImageSection block={block} ctx={ctx} center={center} />;
    case 'gallery':
      return <GallerySection block={block} ctx={ctx} center={center} />;
    case 'features':
      return <FeaturesSection block={block} ctx={ctx} center={center} />;
    case 'stats':
      return <StatsSection block={block} ctx={ctx} center={center} />;
    case 'steps':
      return <StepsSection block={block} ctx={ctx} center={center} />;
    case 'pricing':
      return <PricingSection block={block} ctx={ctx} center={center} />;
    case 'team':
      return <TeamSection block={block} ctx={ctx} center={center} />;
    case 'testimonials':
      return <TestimonialsSection block={block} ctx={ctx} center={center} />;
    case 'quote':
      return <QuoteSection block={block} ctx={ctx} center={center} />;
    case 'logos':
      return <LogosSection block={block} ctx={ctx} center={center} />;
    case 'pricelist':
      return <PricelistSection block={block} ctx={ctx} center={center} />;
    case 'catalog':
      return <CatalogSection block={block} ctx={ctx} center={center} />;
    case 'schedule':
      return <ScheduleSection block={block} ctx={ctx} center={center} />;
    case 'faq':
      return <FaqSection block={block} ctx={ctx} center={center} />;
    case 'cta':
      return <CtaSection block={block} ctx={ctx} center={center} tone={look.tone} />;
    case 'video':
      return <VideoSection block={block} ctx={ctx} center={center} />;
    case 'map':
      return <MapSection block={block} ctx={ctx} center={center} />;
    case 'countdown':
      return <CountdownSection block={block} ctx={ctx} center={center} />;
    case 'contact':
      return <ContactSection block={block} ctx={ctx} center={center} />;
    case 'divider':
      return <DividerSection block={block} ctx={ctx} center={center} />;
    case 'timeline':
      return <TimelineSection block={block} ctx={ctx} center={center} />;
    case 'comparison':
      return <ComparisonSection block={block} ctx={ctx} center={center} />;
    case 'beforeafter':
      return <BeforeAfterSection block={block} ctx={ctx} center={center} />;
    case 'links':
      return <LinksSection block={block} ctx={ctx} center={center} />;
    case 'marquee':
      return <MarqueeSection block={block} ctx={ctx} center={center} />;
    case 'tabs':
      return <TabsSection block={block} ctx={ctx} center={center} />;
    case 'hours':
      return <HoursSection block={block} ctx={ctx} center={center} />;
    case 'areas':
      return <AreasSection block={block} ctx={ctx} center={center} />;
    case 'embed':
      return <EmbedSection block={block} ctx={ctx} center={center} />;
    case 'posts':
      return <PostsSection block={block} ctx={ctx} center={center} />;
    case 'form':
      return <FormSection block={block} ctx={ctx} center={center} />;
  }
}
