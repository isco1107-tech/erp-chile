import { DatabaseBackup, FileLock2, KeyRound, ScanLine } from 'lucide-react';
import s from './empresas.module.css';
import { trustFacts } from '../content';
import { trustStripHeading } from './content';

/** Mismo orden e íconos que `TrustStrip.tsx` (la landing cinematográfica). */
const icons = [ScanLine, DatabaseBackup, FileLock2, KeyRound];

/**
 * Reemplaza a los "logos de clientes": no existen todavía, así que la prueba
 * de confianza son hechos verificables del producto (`trustFacts`, compartido
 * con la landing de `/` para que no se desincronicen). Una sola franja: el
 * título de cada hecho a la vista y su detalle debajo, en letra chica.
 */
export default function TrustFactsStrip() {
  return (
    <section className={s.trustStrip} aria-labelledby="hechos-title">
      <div className={`${s.container} ${s.trustInner}`}>
        <p id="hechos-title" className={s.trustStripLead}>{trustStripHeading}</p>
        <ul className={s.trustGrid}>
          {trustFacts.map((fact, index) => {
            const Icon = icons[index] ?? ScanLine;
            return (
              <li key={fact.title} className={s.trustItem}>
                <Icon size={18} aria-hidden="true" />
                <div>
                  <strong>{fact.title}</strong>
                  <span>{fact.text}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
