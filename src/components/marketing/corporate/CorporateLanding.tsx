import s from './empresas.module.css';
import CorporateHeader from './CorporateHeader';
import Hero from './Hero';
import TrustFactsStrip from './TrustFactsStrip';
import Benefits from './Benefits';
import ModulesSection from './ModulesSection';
import ComplianceSecurity from './ComplianceSecurity';
import Implementation from './Implementation';
import EventsSection from './EventsSection';
import FaqSection from './FaqSection';
import CtaBand from './CtaBand';
import SalesContact from '../SalesContact';
import CorporateFooter from './CorporateFooter';
import { contactForm } from './content';

/**
 * Landing corporativa `/empresas`: blanca, sobria, estática. Server Component
 * salvo `MobileMenu` (dentro de `CorporateHeader`) y `SalesContact`, que ya es
 * `'use client'`. Distinta de la cinematográfica de `/`, que no se toca.
 */
export default function CorporateLanding({ salesEmail, salesWhatsapp, legalName, legalRut }: {
  salesEmail: string;
  salesWhatsapp?: string;
  legalName?: string;
  legalRut?: string;
}) {
  return (
    <div className={s.corporate}>
      <a className={s.skip} href="#contenido">Ir al contenido</a>

      <CorporateHeader />
      <Hero />
      <TrustFactsStrip />
      <Benefits />
      <ModulesSection />
      <ComplianceSecurity />
      <Implementation />
      <EventsSection />
      <FaqSection />
      <CtaBand />
      <SalesContact
        email={salesEmail}
        whatsapp={salesWhatsapp}
        className={s.formVariant}
        heading={contactForm.heading}
        lead={contactForm.lead}
      />
      <CorporateFooter salesEmail={salesEmail} legalName={legalName} legalRut={legalRut} />
    </div>
  );
}
