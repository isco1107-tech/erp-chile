import { DatabaseBackup, FileLock2, KeyRound, ScanLine } from 'lucide-react';
import s from './empresas.module.css';
import { trustFacts } from '../content';
import { trustStripHeading } from './content';

/** Mismo orden e íconos que `TrustStrip.tsx` (la landing cinematográfica). */
const icons = [ScanLine, DatabaseBackup, FileLock2, KeyRound];

/**
 * Reemplaza a los "logos de clientes": no existen todavía, así que la prueba
 * de confianza son hechos verificables del producto (`trustFacts`, compartido
 * con la landing de `/` para que no se desincronicen).
 */
export default function TrustFactsStrip() {
  return (
    <section className={s.trustStrip} aria-label="Hechos verificables de Aether ERP">
      <div className={s.container}>
        <p className={s.trustStripLead}>{trustStripHeading}</p>
        <ul className={s.trustGrid}>
          {trustFacts.map((fact, index) => {
            const Icon = icons[index] ?? ScanLine;
            return (
              <li key={fact.title} className={s.trustItem}>
                <Icon size={18} aria-hidden="true" />
                {fact.title}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
