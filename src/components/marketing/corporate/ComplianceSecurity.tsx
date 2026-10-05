import { BadgeCheck, DatabaseBackup, FileLock2, FileText, KeyRound, Network, Percent, ScanLine, TriangleAlert, UserCog } from 'lucide-react';
import s from './empresas.module.css';
import { compliance, security, trustBand } from './content';

const complianceIcons = [BadgeCheck, Percent, FileText, ScanLine];
const securityIcons = [Network, KeyRound, UserCog, FileLock2, DatabaseBackup];

/**
 * Cumplimiento SII y seguridad en una sola franja oscura, lado a lado: cada
 * columna conserva su ancla (#cumplimiento, #seguridad) y su propio titular.
 * Es la única franja oscura de la página.
 */
export default function ComplianceSecurity() {
  return (
    <section className={`${s.section} ${s.trustBand}`} aria-labelledby="confianza-title">
      <div className={s.container}>
        <div className={s.splitHeading}>
          <div>
            <p className={s.kicker}>{trustBand.kicker}</p>
            <h2 id="confianza-title" className={s.h2}>{trustBand.title}</h2>
          </div>
          <p className={s.sectionHeadingLead}>{trustBand.lead}</p>
        </div>

        <div className={s.trustColumns}>
          <div className={s.trustPanel} id="cumplimiento">
            <p className={s.trustPanelKicker}>{compliance.kicker}</p>
            <h3>{compliance.title}</h3>
            <p className={s.trustPanelLead}>{compliance.lead}</p>
            <ul className={s.pointsList}>
              {compliance.points.map((point, index) => {
                const Icon = complianceIcons[index] ?? BadgeCheck;
                return (
                  <li key={point.title} className={s.pointItem}>
                    <span className={s.pointIcon}>
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{point.title}</strong>
                      <p>{point.text}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className={s.scopeNotice} role="note">
              <TriangleAlert size={18} aria-hidden="true" />
              <p>{compliance.scopeNotice}</p>
            </div>
          </div>

          <div className={s.trustPanel} id="seguridad">
            <p className={s.trustPanelKicker}>{security.kicker}</p>
            <h3>{security.title}</h3>
            <ul className={s.pointsList}>
              {security.points.map((point, index) => {
                const Icon = securityIcons[index] ?? FileLock2;
                return (
                  <li key={point.title} className={s.pointItem}>
                    <span className={s.pointIcon}>
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{point.title}</strong>
                      <p>{point.text}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
