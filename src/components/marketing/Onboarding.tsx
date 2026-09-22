import { ArrowUpRight, Boxes, PhoneCall, Settings2, UploadCloud, UsersRound } from 'lucide-react';
import s from './landing.module.css';

const steps = [
  { icon: PhoneCall, title: 'Conversamos tu operación', text: 'Una demo sobre tus procesos, no sobre un catálogo de funciones: qué vendes, cómo cobras y qué quieres ordenar primero.' },
  { icon: Settings2, title: 'Configuramos tu empresa', text: 'RUT, parámetros tributarios, plan de cuentas, bodegas y los módulos que elegiste. Tu empresa queda lista para emitir.' },
  { icon: UploadCloud, title: 'Traes los datos que ya tienes', text: 'Productos, clientes, stock e historial de ventas y compras desde tus planillas Excel o CSV, revisados antes de confirmar.' },
  { icon: UsersRound, title: 'Tu equipo entra a trabajar', text: 'Invitas a cada persona con el acceso que le corresponde y el manual queda dentro del sistema, a un clic.' },
];

const factors = [
  { icon: Boxes, title: 'Los módulos que activas', text: 'Pagas por las áreas que vas a usar, no por el catálogo completo.' },
  { icon: UsersRound, title: 'Tu tamaño real', text: 'Cuántas empresas administras y cuántas personas entran al sistema.' },
  { icon: Settings2, title: 'La puesta en marcha', text: 'Qué tan acompañada necesitas la configuración y la carga inicial.' },
];

export default function Onboarding() {
  return (
    <section id="implementacion" className={`${s.section} ${s.startup}`}>
      <div className={s.container}>
        <div className={s.startupHeading} data-reveal>
          <p className={s.kicker}>05 / DE LA DECISIÓN AL PRIMER DOCUMENTO</p>
          <h2>Partir no debería ser<br /><span>el proyecto más difícil del año.</span></h2>
          <p className={s.startupLead}>Cuatro pasos, en orden, con tus datos actuales como punto de partida.</p>
        </div>

        <ol className={s.startupSteps}>
          {steps.map((step, index) => (
            <li key={step.title} data-reveal style={{ transitionDelay: `${index * 100}ms` }}>
              <div className={s.startupTop}><span className={s.startupIcon}><step.icon size={19} aria-hidden="true" /></span><span className={s.startupIndex}>0{index + 1}</span></div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>

        <div className={s.pricing} data-reveal>
          <div className={s.pricingCopy}>
            <p className={s.kicker}>Y EL VALOR, ¿CÓMO SE DEFINE?</p>
            <h3>Una cotización que se parece a tu empresa.</h3>
            <p>No hay una lista de precios que te cobre por lo que no usas. La propuesta se arma sobre tres cosas, y la revisas antes de contratar.</p>
            <a href="#cotizar">Pedir mi cotización <ArrowUpRight size={16} aria-hidden="true" /></a>
          </div>
          <ul className={s.pricingFactors}>
            {factors.map(factor => (
              <li key={factor.title}>
                <factor.icon size={18} aria-hidden="true" />
                <div><strong>{factor.title}</strong><p>{factor.text}</p></div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
