import s from './landing.module.css';
import { testimonials } from './content';

/** No renderiza nada mientras no haya testimonios reales cargados en `content.ts`. */
export default function Testimonials() {
  if (testimonials.length === 0) return null;
  return (
    <section className={`${s.section} ${s.testimonials}`} aria-labelledby="testimonios-titulo">
      <div className={s.container}>
        <div data-reveal>
          <p className={s.kicker}>LO QUE DICEN NUESTROS CLIENTES</p>
          <h2 id="testimonios-titulo">Empresas que ya ordenaron su operación.</h2>
        </div>
        <div className={s.testimonialGrid}>
          {testimonials.map((item) => (
            <figure key={`${item.name}-${item.company}`} className={s.testimonial} data-reveal>
              <blockquote>“{item.quote}”</blockquote>
              <figcaption>
                <strong>{item.name}</strong>
                <span>
                  {item.role} · {item.company}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
