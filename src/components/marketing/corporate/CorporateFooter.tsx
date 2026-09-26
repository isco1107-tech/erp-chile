import Image from 'next/image';
import Link from 'next/link';
import s from './empresas.module.css';
import { footer } from './content';

export default function CorporateFooter({ salesEmail, legalName, legalRut }: { salesEmail: string; legalName?: string; legalRut?: string }) {
  return (
    <footer className={s.footer}>
      <div className={s.container}>
        <div className={s.footerGrid}>
          <div className={s.footerBrand}>
            <Link href="/empresas" aria-label="Aether ERP, inicio" className={s.brand}>
              <Image src="/branding/aether-icon.png" alt="" width={28} height={32} />
              <span className={s.brandName}>
                Aether <span className={s.brandSuffix}>ERP</span>
              </span>
            </Link>
            <p>{footer.brandLine}</p>
          </div>

          <nav className={s.footerCol} aria-label="Producto">
            <h3>Producto</h3>
            <ul>
              {footer.productLinks.map(([href, label]) => (
                <li key={href}>
                  <a href={href}>{label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <nav className={s.footerCol} aria-label="Contacto">
            <h3>Contacto</h3>
            <ul>
              <li>
                <a href="#cotizar">Solicitar una demo</a>
              </li>
              <li>
                <a href={`mailto:${salesEmail}`}>{salesEmail}</a>
              </li>
              <li>
                <Link href="/login">Ingresar al ERP</Link>
              </li>
              <li>
                <Link href="/">También disponible para escritorio</Link>
              </li>
            </ul>
          </nav>

          <nav className={s.footerCol} aria-label="Legal">
            <h3>Legal</h3>
            <ul>
              <li>
                <Link href="/aether/privacidad">Política de privacidad</Link>
              </li>
              <li>
                <Link href="/aether/terminos">Términos de servicio</Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className={s.footerBottom}>
          <span>
            © {new Date().getFullYear()} {legalName ?? 'Aether ERP'}
            {legalRut ? ` · RUT ${legalRut}` : ''}
          </span>
          <span>Hecho en Chile, para empresas chilenas.</span>
        </div>
      </div>
    </footer>
  );
}
