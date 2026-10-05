'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, Download, Globe2, Laptop, Monitor, ShieldCheck, Terminal } from 'lucide-react';
import type { DesktopRelease } from '../Landing';
import s from './v2.module.css';

function DownloadOption({ platform, name, icon: Icon, releases }: {
  platform: string; name: string; icon: typeof Monitor; releases: DesktopRelease[];
}) {
  const options = releases.filter(release => release.platform === platform);
  const [architecture, setArchitecture] = useState('arm64');
  const release = options.find(option => option.architecture === architecture) ?? options[0];
  const system = platform === 'windows' ? 'Windows 10 / 11 · 64 bits' : platform === 'linux' ? 'Linux · x86_64' : 'macOS';
  const format = platform === 'windows' ? 'Instalador .exe' : platform === 'macos' ? 'Imagen .dmg' : 'AppImage';
  return (
    <li className={s.download}>
      <span className={s.downloadIcon}><Icon size={22} strokeWidth={1.4} aria-hidden="true" /></span>
      <div className={s.downloadInfo}>
        <h3>{name}</h3>
        {platform === 'macos' && options.length > 1 ? (
          <label>
            <span className={s.srOnly}>Procesador</span>
            <select value={architecture} onChange={event => setArchitecture(event.target.value)}>
              <option value="arm64">Apple Silicon (M1 o posterior)</option><option value="x64">Intel</option>
            </select>
          </label>
        ) : <p>{system}</p>}
        <p>{release ? `v${release.version} · ${(release.size / 1024 / 1024).toFixed(1)} MB · ${format}` : 'En preparación: usa Aether en tu navegador mientras tanto.'}</p>
      </div>
      {release
        ? <a className={s.downloadButton} href={`/downloads/${release.file}`} download aria-label={`Descargar para ${name}`}><Download size={17} aria-hidden="true" />Descargar</a>
        : <Link className={s.downloadButton} href="/login" aria-label={`Abrir la versión web (${name} en preparación)`}><Globe2 size={17} aria-hidden="true" />Versión web</Link>}
    </li>
  );
}

/**
 * Descargas del cliente de escritorio en una franja compacta: el texto a la
 * izquierda y una fila por sistema a la derecha (antes, tres tarjetas altas).
 */
export default function Downloads({ releases }: { releases: DesktopRelease[] }) {
  return (
    <section id="descargas" className={`${s.section} ${s.downloads}`} aria-labelledby="descargas-title">
      <div className={s.downloadsIntro}>
        <p className={s.kicker}>TAMBIÉN EN TU ESCRITORIO</p>
        <h2 id="descargas-title" className={`${s.heading} ${s.headingSmall}`}><span className={s.display}>Aether en su propia ventana.</span></h2>
        <p className={s.body}>Windows, macOS o Linux: la misma plataforma, sin pestañas de por medio. O entra desde el navegador, sin instalar nada.</p>
        <Link className={s.textLink} href="/login">Abrir Aether web <ArrowUpRight size={18} aria-hidden="true" /></Link>
      </div>
      <div>
        <ul className={s.downloadList}>
          <DownloadOption platform="windows" name="Windows" icon={Monitor} releases={releases} />
          <DownloadOption platform="macos" name="macOS" icon={Laptop} releases={releases} />
          <DownloadOption platform="linux" name="Linux" icon={Terminal} releases={releases} />
        </ul>
        <p className={s.fineprint}>
          <ShieldCheck size={14} aria-hidden="true" /> Instaladores sin firma comercial: tu sistema puede mostrar una advertencia de editor desconocido.{' '}
          {releases.length > 0 && <a href="/downloads/SHA256SUMS.txt" download>Verifica el SHA-256 <ArrowUpRight size={12} aria-hidden="true" /></a>}
        </p>
      </div>
    </section>
  );
}
