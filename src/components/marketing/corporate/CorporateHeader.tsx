import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import s from './empresas.module.css';
import MobileMenu from './MobileMenu';
import { navLinks } from './content';

/** Encabezado fijo, blanco, sin blur ni animación (ver brief §3.1). */
export default function CorporateHeader() {
  return (
    <header className={s.header}>
      <div className={s.headerInner}>
        <Link href="/empresas" aria-label="Aether ERP, inicio" className={s.brand}>
          <Image src="/branding/aether-icon.png" alt="" width={28} height={32} priority />
          <span className={s.brandName}>
            Aether <span className={s.brandSuffix}>ERP</span>
          </span>
        </Link>

        <nav className={s.desktopNav} aria-label="Navegación principal">
          {navLinks.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>

        <div className={s.headerActions}>
          <Link href="/login" className={s.btnSecondary}>
            Ingresar
          </Link>
          <a href="#cotizar" className={s.btnPrimary}>
            Solicitar demo <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>

        <MobileMenu navLinks={navLinks} />
      </div>
    </header>
  );
}
