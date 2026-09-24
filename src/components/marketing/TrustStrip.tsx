import { DatabaseBackup, FileLock2, KeyRound, ScanLine } from 'lucide-react';
import s from './landing.module.css';
import { trustFacts } from './content';

const icons = [ScanLine, DatabaseBackup, FileLock2, KeyRound];

/**
 * Reemplaza a los testimonios (no hay clientes citables todavía): una franja
 * compacta de hechos verificables del producto, no una promesa de marketing.
 */
export default function TrustStrip() {
  return (
    <section className={s.valueStrip} aria-label="Hechos verificables de Aether">
      <div className={s.container}>
        <p><strong>Hechos, no promesas.</strong> Así se comporta Aether con tu información.</p>
        {trustFacts.map((fact, index) => {
          const Icon = icons[index] ?? ScanLine;
          return (
            <span key={fact.title}>
              <Icon size={18} aria-hidden="true" />
              {fact.title}
            </span>
          );
        })}
      </div>
    </section>
  );
}
