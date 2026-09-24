'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, Download, Globe2, Laptop, Monitor, ShieldCheck, Terminal } from 'lucide-react';
import type { DesktopRelease } from '../Landing';
import s from './v2.module.css';

function DownloadOption({ platform, name, detail, icon: Icon, releases }: {
  platform: string; name: string; detail: string; icon: typeof Monitor; releases: DesktopRelease[];
}) {
  const options = releases.filter(release => release.platform === platform);
  const [architecture, setArchitecture] = useState('arm64');
  const release = options.find(option => option.architecture === architecture) ?? options[0];
  return (
    <article className={s.download} data-reveal data-spot>
      <div className={s.downloadTop}><Icon size={26} strokeWidth={1.4} aria-hidden="true" /><span>{release ? 'Disponible' : 'En preparación'}</span></div>
      <h3>{name}</h3>
      <p>{detail}</p>
      <div className={s.downloadMeta}>
        {platform === 'macos' && options.length > 1 ? (
          <label>Procesador<select value={architecture} onChange={event => setArchitecture(event.target.value)}>
            <option value="arm64">Apple Silicon (M1 o posterior)</option><option value="x64">Intel</option>
          </select></label>
        ) : <span>{platform === 'windows' ? 'Windows 10 / 11 · 64 bits' : platform === 'linux' ? 'Linux · x86_64' : 'macOS'}</span>}
        <span>{release ? `v${release.version} · ${(release.size / 1024 / 1024).toFixed(1)} MB` : 'Usa Aether en tu navegador mientras tanto.'}</span>
      </div>
      {release
        ? <a className={s.downloadButton} href={`/downloads/${release.file}`} download><Download size={17} aria-hidden="true" />Descargar para {name}</a>
        : <Link className={s.downloadButton} href="/login"><Globe2 size={17} aria-hidden="true" />Abrir versión web</Link>}
      <span className={s.downloadFormat}>{release ? (platform === 'windows' ? 'Instalador .exe' : platform === 'macos' ? 'Imagen .dmg' : 'AppImage') : 'Sin instalación'}</span>
    </article>
  );
}

/** Descargas del cliente de escritorio: mismo contenido y comportamiento que en `/`. */
export default function Downloads({ releases }: { releases: DesktopRelease[] }) {
  return (
    <section id="descargas" className={`${s.section} ${s.downloads}`} aria-labelledby="descargas-title">
      <div className={s.sectionHead}>
        <div>
          <p className={s.kicker}>TAMBIÉN EN TU ESCRITORIO</p>
          <h2 id="descargas-title" className={`${s.heading} ${s.headingMid}`}><span className={s.display}>Aether en su propia ventana.</span></h2>
        </div>
        <p className={s.body}>Windows, macOS o Linux: la misma plataforma, sin pestañas de por medio.</p>
      </div>
      <div className={s.downloadGrid}>
        <DownloadOption platform="windows" name="Windows" detail="Tu operación, siempre a mano." icon={Monitor} releases={releases} />
        <DownloadOption platform="macos" name="macOS" detail="Aether también vive en tu Mac." icon={Laptop} releases={releases} />
        <DownloadOption platform="linux" name="Linux" detail="Tu entorno. La misma plataforma." icon={Terminal} releases={releases} />
      </div>
      <p className={s.fineprint}>
        <ShieldCheck size={14} aria-hidden="true" /> Instaladores sin firma comercial: tu sistema puede mostrar una advertencia de editor desconocido.{' '}
        {releases.length > 0 && <a href="/downloads/SHA256SUMS.txt" download>Verifica el SHA-256 <ArrowUpRight size={12} aria-hidden="true" /></a>}
      </p>
      <div className={s.webOption}>
        <div><Globe2 size={25} strokeWidth={1.4} aria-hidden="true" /><p><strong>También puedes entrar desde el navegador.</strong><span>La misma información, sin instalar nada.</span></p></div>
        <Link className={s.textLink} href="/login">Abrir Aether web <ArrowUpRight size={18} aria-hidden="true" /></Link>
      </div>
    </section>
  );
}
