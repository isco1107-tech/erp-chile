import { BadgeCheck, DatabaseBackup, FileLock2, FileText, KeyRound, Network, Percent, ScanLine, TriangleAlert, UserCog } from 'lucide-react';
import s from './empresas.module.css';
import { compliance, security } from './content';

const complianceIcons = [BadgeCheck, Percent, FileText, ScanLine];
const securityIcons = [Network, KeyRound, UserCog, FileLock2, DatabaseBackup];

/**
 * Cumplimiento SII y seguridad comparten la misma franja `--corp-bg-subtle`
 * (brief §3.6), cada uno como su propia sección con ancla propia.
 */
export default function ComplianceSecurity() {
  return (
    <div className={s.complianceWrap}>
      <section className={s.section} id="cumplimiento">
        <div className={s.container}>
          <div className={s.sectionHeading}>
            <p className={s.kicker}>{compliance.kicker}</p>
            <h2 className={s.h2}>{compliance.title}</h2>
            <p className={s.sectionHeadingLead}>{compliance.lead}</p>
          </div>

          <ul className={s.pointsList}>
            {compliance.points.map((point, index) => {
              const Icon = complianceIcons[index] ?? BadgeCheck;
              return (
                <li key={point.title} className={s.pointItem}>
                  <span className={s.pointIcon}>
                    <Icon size={18} aria-hidden="true" />
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
            <TriangleAlert size={20} aria-hidden="true" />
            <p>{compliance.scopeNotice}</p>
          </div>
        </div>
      </section>

      <section className={`${s.section} ${s.securitySection}`} id="seguridad">
        <div className={s.container}>
          <div className={s.sectionHeading}>
            <p className={s.kicker}>{security.kicker}</p>
            <h2 className={s.h2}>{security.title}</h2>
          </div>

          <div className={s.securityGrid}>
            {security.points.map((point, index) => {
              const Icon = securityIcons[index] ?? FileLock2;
              return (
                <article key={point.title} className={s.securityCard}>
                  <span className={s.securityIcon}>
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <h3>{point.title}</h3>
                  <p>{point.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
