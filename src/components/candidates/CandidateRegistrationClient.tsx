'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Italiana, Karla } from 'next/font/google';
import { formatRut } from '@/lib/chile/rut';
import { ARAUCANIA_COMUNAS, CANDIDATE_HONEYPOT_FIELD, candidateSelfRegistrationSchema } from '@/modules/candidates/schema';
import { getCandidateRegistrationProjectAction } from '@/modules/candidates/actions/public-registration.actions';
import type { RegistrationProjectInfo } from '@/modules/candidates/services/candidates.service';
import { CONFIG } from '@/modules/candidates/registration-config';

const italiana = Italiana({ subsets: ['latin'], weight: '400', variable: '--font-display' });
const karla = Karla({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-body' });

/**
 * ============================================================================
 * CONFIG — todo lo que la organización puede necesitar editar sin tocar el
 * resto del componente: textos, fechas de referencia, contacto y enlaces.
 * (Sección 5 del prompt del módulo: "un bloque CONFIG al inicio... para que
 * la organización pueda editarlo sin tocar el resto".)
 *
 * DESVIACIÓN DE ARQUITECTURA: el prompt original pedía una página HTML
 * autocontenida sin dependencias de build, servida en `/inscripcion/{slug}`.
 * Esta app es 100% Next.js (App Router, Server Actions, Tailwind) — no sirve
 * ningún HTML estático y no existe mecanismo de rutas fuera de ese framework.
 * Se construyó como un Client Component normal en vez de introducir un motor
 * de plantillas nuevo. La ruta pública tampoco es `/inscripcion/{slug}`: se
 * reutilizó la ruta YA EXISTENTE `/register/candidate/[token]` (con su propio
 * componente, este archivo) en vez de crear una segunda ruta pública
 * paralela — el token aleatorio de 32 bytes es el mecanismo de seguridad real
 * del link; un `slug` legible habría sido un link adivinable, un paso atrás
 * en seguridad respecto al diseño ya en producción.
 * ============================================================================
 * (El objeto CONFIG en sí vive en `registration-config.ts`, importado arriba
 * — así `/politica-privacidad`, una página de servidor, puede reusar el
 * mismo nombre del certamen y correo de contacto sin cruzar el límite
 * cliente/servidor de Next.js.)
 *
 * REDISEÑO (formulario en pasos): el formulario pasó de un solo scroll largo
 * a un wizard de 4 pasos (`FORM_STEPS`) con barra de progreso. La validación
 * completa sigue viviendo en una sola función (`validate`, la misma fuente de
 * verdad que el servidor vía `candidateSelfRegistrationSchema`) — "Siguiente"
 * simplemente filtra ese resultado a los campos visibles en el paso actual,
 * en vez de mantener una validación paralela por paso.
 */

/* Imagen de fondo del hero — una sola variable, para poder cambiarla en un
 * segundo. Por defecto es un degradado (no se inventa una foto real): pega
 * aquí una URL propia o una ruta de /public, ej. `url('/hero-temuco.jpg')`. */
const HERO_PHOTO_CSS = `linear-gradient(160deg, #0A0E24 0%, #101638 45%, #1a2354 100%)`;

const STAR_POSITIONS = [
  [4, 12], [12, 6], [22, 18], [31, 9], [41, 22], [52, 7], [63, 16], [72, 5], [83, 20], [92, 11],
  [8, 34], [18, 41], [28, 48], [38, 37], [48, 52], [58, 44], [68, 55], [78, 39], [88, 48], [96, 33],
  [6, 62], [16, 71], [26, 66], [36, 78], [46, 69], [56, 82], [66, 73], [76, 85], [86, 68], [94, 79],
] as const;

const NAV_LINKS = [
  { href: '#convocatoria', label: 'La convocatoria' },
  { href: '#requisitos', label: 'Requisitos' },
  { href: '#preguntas', label: 'Preguntas' },
  { href: '#formulario', label: 'Postular' },
] as const;

const FAQ_ITEMS = [
  {
    q: '¿Postular tiene algún costo?',
    a: 'No. Completar esta postulación es gratuito. Nunca te pediremos una transferencia ni un pago para avanzar de etapa.',
  },
  {
    q: '¿Necesito experiencia previa en pasarela o modelaje?',
    a: 'No es un requisito. Buscamos presencia, carácter y compromiso con una causa social — la preparación técnica se entrega durante el proceso a quienes avanzan.',
  },
  {
    q: '¿Qué pasa después de enviar el formulario?',
    a: 'Recibes un folio de confirmación al instante. El equipo organizador revisa todas las postulaciones y contacta por correo o teléfono a quienes avanzan a la instancia presencial de casting.',
  },
  {
    q: '¿Puedo editar mi postulación después de enviarla?',
    a: 'El formulario no permite ediciones una vez enviado. Si necesitas corregir un dato, escribe a la organización con tu folio a mano.',
  },
  {
    q: '¿Qué debo cuidar en mis fotografías?',
    a: 'Que sean recientes, con buena luz natural y sin filtros ni edición. Una de rostro (tipo carnet, fondo neutro) y una de cuerpo completo, de pie.',
  },
] as const;

type Declaraciones = { aceptaRequisitos: boolean; aceptaTratamientoDatos: boolean; aceptaBases: boolean; aceptaMarketing: boolean };

const EMPTY_FORM = {
  rut: '',
  fullName: '',
  stageName: '',
  email: '',
  phone: '',
  birthDate: '',
  comuna: '',
  direccion: '',
  heightCm: '',
  dressSize: '',
  shoeSize: '',
  ocupacion: '',
  instagram: '',
  idiomas: '',
  experiencia: '',
  motivacion: '',
  causaSocial: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  condicionesMedicas: '',
  guardianName: '',
  guardianRut: '',
};

type FormState = typeof EMPTY_FORM;

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MINOR_AGE_THRESHOLD = 18;

const FORM_STEPS = [
  { title: 'Datos personales', fields: ['fullName', 'stageName', 'rut', 'birthDate', 'email', 'phone', 'comuna', 'direccion'] },
  { title: 'Tu perfil', fields: ['heightCm', 'dressSize', 'shoeSize', 'instagram', 'ocupacion', 'idiomas', 'experiencia', 'motivacion', 'causaSocial'] },
  { title: 'Contacto y salud', fields: ['emergencyContactName', 'emergencyContactPhone', 'condicionesMedicas', 'guardianName', 'guardianRut'] },
  { title: 'Fotografías', fields: ['photoFace', 'photoFullBody'] },
  { title: 'Declaraciones', fields: ['aceptaRequisitos', 'aceptaTratamientoDatos', 'aceptaBases'] },
] as const;

function calcAge(birthDateStr: string): number | null {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hadBirthday = now.getMonth() > birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}

function useCountdown(target: Date | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const diff = target.getTime() - now;
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return { days, hours, minutes, seconds };
}

export default function CandidateRegistrationClient({ token }: { token: string }) {
  const [project, setProject] = useState<RegistrationProjectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [decl, setDecl] = useState<Declaraciones>({ aceptaRequisitos: false, aceptaTratamientoDatos: false, aceptaBases: false, aceptaMarketing: false });
  const [photoFace, setPhotoFace] = useState<File | null>(null);
  const [photoFullBody, setPhotoFullBody] = useState<File | null>(null);
  const [medicalCertificate, setMedicalCertificate] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [folio, setFolio] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [navScrolled, setNavScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const formTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const result = await getCandidateRegistrationProjectAction(token);
      if (!result.success) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setProject(result.data);
      setLoading(false);
    })();
  }, [token]);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const age = useMemo(() => calcAge(form.birthDate), [form.birthDate]);
  const closesAt = useMemo(() => (project?.registrationClosesAt ? new Date(project.registrationClosesAt) : null), [project]);
  const countdown = useCountdown(closesAt);

  /**
   * Fuente única de verdad: valida con el mismo `candidateSelfRegistrationSchema`
   * que usa el servidor (`apply/route.ts`), en vez de reimplementar las reglas
   * a mano acá. Evita que las dos copias diverjan con el tiempo (ej. un tope
   * de caracteres que se agrega en el schema y se olvida replicar en el
   * cliente) — el único costo es traducir el `form` (strings de inputs) al
   * tipo que el schema espera antes de llamar `safeParse`.
   *
   * Dos cosas quedan fuera del schema a propósito y se validan aparte:
   * - La edad mínima depende de ESTA convocatoria (`project.minCandidateAge`),
   *   no es una regla estática del tipo.
   * - Los archivos de fotografía no viajan por JSON, así que nunca fueron
   *   parte del contrato Zod (el servidor los valida por separado, por magic
   *   bytes — ver `file-signature.ts`).
   */
  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};

    const parsed = candidateSelfRegistrationSchema.safeParse({
      rut: form.rut,
      fullName: form.fullName,
      stageName: form.stageName || undefined,
      email: form.email,
      phone: form.phone,
      birthDate: form.birthDate,
      heightCm: form.heightCm ? Number(form.heightCm) : undefined,
      dressSize: form.dressSize || undefined,
      shoeSize: form.shoeSize || undefined,
      comuna: form.comuna,
      direccion: form.direccion,
      ocupacion: form.ocupacion,
      instagram: form.instagram || undefined,
      idiomas: form.idiomas || undefined,
      experiencia: form.experiencia || undefined,
      motivacion: form.motivacion,
      causaSocial: form.causaSocial,
      emergencyContactName: form.emergencyContactName || undefined,
      emergencyContactPhone: form.emergencyContactPhone || undefined,
      condicionesMedicas: form.condicionesMedicas || undefined,
      guardianName: form.guardianName || undefined,
      guardianRut: form.guardianRut || undefined,
      aceptaRequisitos: decl.aceptaRequisitos,
      aceptaTratamientoDatos: decl.aceptaTratamientoDatos,
      aceptaBases: decl.aceptaBases,
      aceptaMarketing: decl.aceptaMarketing,
    });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!errs[key]) errs[key] = issue.message;
      }
    }

    const minAge = project?.minCandidateAge ?? 18;
    if (!errs.birthDate && form.birthDate && age !== null && age < minAge) {
      errs.birthDate = `Debes tener al menos ${minAge} años cumplidos para postular.`;
    }

    if (!photoFace) errs.photoFace = 'Adjunta tu fotografía de rostro.';
    else if (photoFace.size > MAX_PHOTO_BYTES) errs.photoFace = 'La fotografía supera los 5 MB — comprímela e inténtalo de nuevo.';
    if (!photoFullBody) errs.photoFullBody = 'Adjunta tu fotografía de cuerpo entero.';
    else if (photoFullBody.size > MAX_PHOTO_BYTES) errs.photoFullBody = 'La fotografía supera los 5 MB — comprímela e inténtalo de nuevo.';

    return errs;
  }

  function goToStep(target: number) {
    setStep(target);
    formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleNext() {
    const validation = validate();
    const stepFields = FORM_STEPS[step]!.fields as readonly string[];
    const stepErrors = Object.fromEntries(Object.entries(validation).filter(([key]) => stepFields.includes(key)));
    setErrors((prev) => ({ ...prev, ...validation }));
    if (Object.keys(stepErrors).length > 0) {
      document.getElementById(Object.keys(stepErrors)[0]!)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    goToStep(Math.min(step + 1, FORM_STEPS.length - 1));
  }

  function handleBack() {
    goToStep(Math.max(step - 1, 0));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (honeypotRef.current?.value) return; // bot: se ignora sin dar pistas.

    const validation = validate();
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      const failingStep = FORM_STEPS.findIndex((s) => (s.fields as readonly string[]).some((f) => validation[f]));
      if (failingStep >= 0 && failingStep !== step) {
        goToStep(failingStep);
        return;
      }
      document.getElementById(Object.keys(validation)[0]!)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSaving(true);
    try {
      const body = new FormData();
      body.append('rut', form.rut);
      body.append('fullName', form.fullName);
      body.append('stageName', form.stageName);
      body.append('email', form.email);
      body.append('phone', form.phone);
      body.append('birthDate', form.birthDate);
      body.append('comuna', form.comuna);
      body.append('direccion', form.direccion);
      body.append('heightCm', form.heightCm);
      body.append('dressSize', form.dressSize);
      body.append('shoeSize', form.shoeSize);
      body.append('ocupacion', form.ocupacion);
      body.append('instagram', form.instagram);
      body.append('idiomas', form.idiomas);
      body.append('experiencia', form.experiencia);
      body.append('motivacion', form.motivacion);
      body.append('causaSocial', form.causaSocial);
      body.append('emergencyContactName', form.emergencyContactName);
      body.append('emergencyContactPhone', form.emergencyContactPhone);
      body.append('condicionesMedicas', form.condicionesMedicas);
      body.append('guardianName', form.guardianName);
      body.append('guardianRut', form.guardianRut);
      body.append('aceptaRequisitos', String(decl.aceptaRequisitos));
      body.append('aceptaTratamientoDatos', String(decl.aceptaTratamientoDatos));
      body.append('aceptaBases', String(decl.aceptaBases));
      body.append('aceptaMarketing', String(decl.aceptaMarketing));
      body.append(CANDIDATE_HONEYPOT_FIELD, honeypotRef.current?.value ?? '');
      if (photoFace) body.append('photoFace', photoFace);
      if (photoFullBody) body.append('photoFullBody', photoFullBody);
      if (medicalCertificate) body.append('medicalCertificate', medicalCertificate);

      const res = await fetch(`/api/public/candidates/${token}/apply`, { method: 'POST', body });
      const json = (await res.json()) as { success: boolean; data?: { folio: string }; error?: string };

      if (!json.success || !json.data) {
        setErrors({ form: json.error ?? 'No se pudo enviar tu postulación. Intenta de nuevo.' });
        document.getElementById('form-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      setFolio(json.data.folio);
    } catch {
      setErrors({ form: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo — tus datos siguen aquí.' });
    } finally {
      setSaving(false);
    }
  }

  const rootClass = `${italiana.variable} ${karla.variable} cand-insc`;

  if (loading) {
    return (
      <div className={rootClass}>
        <style>{STYLES}</style>
        <div className="cand-insc-loading">
          <span className="cand-insc-spinner" aria-hidden="true" />
          <p>Cargando…</p>
        </div>
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className={rootClass}>
        <style>{STYLES}</style>
        <div className="cand-insc-loading">
          <p>Link de inscripción inválido o expirado.</p>
          <p>Contacta a la organización del certamen para obtener uno vigente.</p>
        </div>
      </div>
    );
  }

  if (!project.isOpen) {
    return (
      <div className={rootClass}>
        <style>{STYLES}</style>
        <div className="cand-insc-loading">
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: '0.75rem' }}>{project.projectName}</p>
          <p>{project.closedReason ?? 'Esta convocatoria no está recibiendo postulaciones por el momento.'}</p>
        </div>
      </div>
    );
  }

  if (folio) {
    return (
      <div className={rootClass}>
        <style>{STYLES}</style>
        <div className="cand-insc-success">
          <span className="cand-insc-success-check" aria-hidden="true"><IconCheck /></span>
          <p className="cand-insc-success-eyebrow">¡Recibimos tu postulación!</p>
          <p className="cand-insc-success-folio">{folio}</p>
          <p className="cand-insc-success-body">
            Guarda este folio como comprobante. Te enviamos una copia a tu correo. La organización de{' '}
            <strong>{project.projectName}</strong> revisará tu postulación y se pondrá en contacto contigo si corresponde avanzar
            a la siguiente etapa.
          </p>
          <ol className="cand-insc-success-steps">
            <li>Revisamos tu postulación junto al resto del equipo organizador.</li>
            <li>Si avanzas, te contactamos por correo o teléfono para citarte a un casting presencial.</li>
            <li>Desde ahí, un grupo reducido pasa a ser candidata oficial de {project.projectName}.</li>
          </ol>
          <a className="cand-insc-success-link" href={CONFIG.privacidadUrl}>Política de privacidad</a>
        </div>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      <style>{STYLES}</style>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <header className={`cand-insc-nav ${navScrolled ? 'is-scrolled' : ''}`}>
        <div className="cand-insc-nav-inner">
          <a href="#top" className="cand-insc-nav-brand">{CONFIG.certamenNombre}</a>
          <nav className="cand-insc-nav-links" aria-label="Secciones">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}>{l.label}</a>
            ))}
          </nav>
          <a href="#formulario" className="cand-insc-nav-cta">Postular ahora</a>
          <button
            type="button"
            className="cand-insc-nav-burger"
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
        {menuOpen && (
          <nav className="cand-insc-nav-mobile" aria-label="Secciones (móvil)">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>{l.label}</a>
            ))}
          </nav>
        )}
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="cand-insc-hero" id="top">
        <div className="cand-insc-hero-veil" />
        <div className="cand-insc-star-field" aria-hidden="true">
          {STAR_POSITIONS.map(([x, y], i) => (
            <span key={i} className="cand-insc-star" style={{ left: `${x}%`, top: `${y}%` }} />
          ))}
        </div>
        <div className="cand-insc-hero-frame" aria-hidden="true">
          <span className="cand-insc-corner cand-insc-corner-tl" />
          <span className="cand-insc-corner cand-insc-corner-br" />
        </div>
        <div className="cand-insc-hero-content">
          <p className="cand-insc-hero-eyebrow cand-insc-anim" style={{ animationDelay: '0.05s' }}>
            <span className="cand-insc-live-dot" aria-hidden="true" />
            {project.companyName} · Postulaciones abiertas
          </p>
          <h1 className="cand-insc-hero-title cand-insc-anim" style={{ animationDelay: '0.15s' }}>
            {CONFIG.heroTitulo}
            <br />
            {CONFIG.certamenNombre}
          </h1>
          <p className="cand-insc-hero-tagline cand-insc-anim" style={{ animationDelay: '0.28s' }}>{CONFIG.heroBajada}</p>
          <a href="#formulario" className="cand-insc-hero-cta cand-insc-anim" style={{ animationDelay: '0.4s' }}>
            Quiero postular
          </a>

          {countdown && (
            <div className="cand-insc-countdown cand-insc-anim" style={{ animationDelay: '0.5s' }}>
              <p className="cand-insc-countdown-label">Postulaciones cierran en</p>
              <div className="cand-insc-countdown-grid">
                <CountdownUnit value={countdown.days} label="días" />
                <CountdownUnit value={countdown.hours} label="hrs" />
                <CountdownUnit value={countdown.minutes} label="min" />
                <CountdownUnit value={countdown.seconds} label="seg" />
              </div>
            </div>
          )}

          <p className="cand-insc-hero-dates cand-insc-anim" style={{ animationDelay: '0.6s' }}>
            {project.registrationClosesAt && (
              <span>Postulaciones cierran el {new Date(project.registrationClosesAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            )}
            {project.registrationClosesAt && project.eventDate && ' · '}
            {project.eventDate && <span>Casting {new Date(project.eventDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
          </p>
        </div>
      </section>

      {/* ── Datos clave ──────────────────────────────────────────────────── */}
      <section className="cand-insc-stats">
        <div className="cand-insc-stat">
          <span className="cand-insc-stat-value">{project.minCandidateAge}+</span>
          <span className="cand-insc-stat-label">Años cumplidos</span>
        </div>
        <div className="cand-insc-stat">
          <span className="cand-insc-stat-value">100%</span>
          <span className="cand-insc-stat-label">Postulación gratuita</span>
        </div>
        <div className="cand-insc-stat">
          <span className="cand-insc-stat-value">Araucanía</span>
          <span className="cand-insc-stat-label">Región requerida</span>
        </div>
        <div className="cand-insc-stat">
          <span className="cand-insc-stat-value">5 pasos</span>
          <span className="cand-insc-stat-label">Postulación en minutos</span>
        </div>
      </section>

      {/* ── Convocatoria ─────────────────────────────────────────────────── */}
      <section className="cand-insc-section cand-insc-section-dark" id="convocatoria">
        <h2 className="cand-insc-h2">La convocatoria</h2>
        <p>
          {CONFIG.certamenNombre} busca a la próxima representante de La Araucanía: una mujer con presencia, carácter y una
          causa que la mueva. No es solo un certamen de belleza — es una plataforma para dar voz a proyectos sociales
          reales durante todo tu reinado.
        </p>
        <p>
          El proceso parte con esta postulación. Con tus datos y fotografías, el equipo organizador hace una primera
          revisión y cita a una instancia presencial de casting a quienes avanzan. Desde ahí, un grupo reducido pasa a ser
          candidata oficial y se prepara junto al equipo de producción para la gala final.
        </p>
      </section>

      {/* ── Requisitos ───────────────────────────────────────────────────── */}
      <section className="cand-insc-section" id="requisitos">
        <h2 className="cand-insc-h2">Requisitos</h2>
        <ul className="cand-insc-list">
          <li><IconCheck /> Tener {project.minCandidateAge} años cumplidos, sin edad máxima.</li>
          <li><IconCheck /> Nacionalidad chilena o residencia definitiva en Chile.</li>
          <li><IconCheck /> Residir en la Región de La Araucanía.</li>
          <li><IconCheck /> Disponibilidad para asistir a ensayos y actividades de preparación.</li>
          <li><IconCheck /> No registrar condenas por crimen o simple delito.</li>
        </ul>
      </section>

      {/* ── Cómo inscribirse ─────────────────────────────────────────────── */}
      <section className="cand-insc-section cand-insc-section-dark">
        <h2 className="cand-insc-h2">Cómo inscribirte</h2>
        <ol className="cand-insc-steps">
          <li><span className="cand-insc-step-num">1</span> Reúne tus datos y dos fotografías recientes: una de rostro y una de cuerpo entero.</li>
          <li><span className="cand-insc-step-num">2</span> Completa el formulario de postulación con tus datos y tu motivación.</li>
          <li><span className="cand-insc-step-num">3</span> Recibe tu folio de confirmación al instante, por pantalla y por correo.</li>
          <li><span className="cand-insc-step-num">4</span> Espera el contacto de la organización con los siguientes pasos.</li>
        </ol>
      </section>

      {/* ── Preguntas frecuentes ─────────────────────────────────────────── */}
      <section className="cand-insc-section" id="preguntas">
        <h2 className="cand-insc-h2">Preguntas frecuentes</h2>
        <div className="cand-insc-faq">
          {FAQ_ITEMS.map((item, i) => (
            <details key={i} className="cand-insc-faq-item">
              <summary>
                {item.q}
                <IconChevron />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Formulario ───────────────────────────────────────────────────── */}
      <section className="cand-insc-section" id="formulario">
        <div ref={formTopRef} />
        <h2 className="cand-insc-h2">Formulario de postulación</h2>

        <ol className="cand-insc-progress" aria-label="Progreso de la postulación">
          {FORM_STEPS.map((s, i) => (
            <li key={s.title} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}>
              <span className="cand-insc-progress-dot">{i < step ? <IconCheck /> : i + 1}</span>
              <span className="cand-insc-progress-label">{s.title}</span>
            </li>
          ))}
        </ol>

        <form onSubmit={handleSubmit} noValidate>
          {/* Honeypot: invisible para una persona, visible para un bot. */}
          <input
            ref={honeypotRef}
            type="text"
            name={CANDIDATE_HONEYPOT_FIELD}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="cand-insc-honeypot"
          />

          {step === 0 && (
            <fieldset className="cand-insc-fieldset">
              <legend>Datos personales</legend>

              <Field id="fullName" label="Nombre completo" error={errors.fullName}>
                <input id="fullName" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} />
              </Field>

              <Field id="stageName" label="Nombre artístico o de certamen (opcional)" error={errors.stageName}>
                <input id="stageName" value={form.stageName} onChange={(e) => update('stageName', e.target.value)} />
              </Field>

              <Field id="rut" label="RUT" error={errors.rut} hint="Se formatea solo al salir del campo.">
                <input
                  id="rut"
                  value={form.rut}
                  onChange={(e) => update('rut', e.target.value)}
                  onBlur={(e) => update('rut', formatRut(e.target.value))}
                  inputMode="text"
                />
              </Field>

              <Field id="birthDate" label="Fecha de nacimiento" error={errors.birthDate} hint={age !== null ? `${age} años` : undefined}>
                <input id="birthDate" type="date" value={form.birthDate} onChange={(e) => update('birthDate', e.target.value)} />
              </Field>

              <Field id="email" label="Correo electrónico" error={errors.email}>
                <input id="email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
              </Field>

              <Field id="phone" label="Teléfono" error={errors.phone}>
                <input id="phone" type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+56 9 1234 5678" />
              </Field>

              <Field id="comuna" label="Comuna" error={errors.comuna}>
                <select id="comuna" value={form.comuna} onChange={(e) => update('comuna', e.target.value)}>
                  <option value="">Selecciona tu comuna</option>
                  {ARAUCANIA_COMUNAS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>

              <Field id="direccion" label="Dirección" error={errors.direccion}>
                <input id="direccion" value={form.direccion} onChange={(e) => update('direccion', e.target.value)} />
              </Field>
            </fieldset>
          )}

          {step === 1 && (
            <fieldset className="cand-insc-fieldset">
              <legend>Tu perfil</legend>

              <Field id="heightCm" label="Estatura (cm)" error={errors.heightCm}>
                <input id="heightCm" type="number" min={0} value={form.heightCm} onChange={(e) => update('heightCm', e.target.value)} />
              </Field>

              <Field id="dressSize" label="Talla de vestido (opcional)" error={errors.dressSize}>
                <input id="dressSize" value={form.dressSize} onChange={(e) => update('dressSize', e.target.value)} />
              </Field>

              <Field id="shoeSize" label="Talla de zapato (opcional)" error={errors.shoeSize}>
                <input id="shoeSize" value={form.shoeSize} onChange={(e) => update('shoeSize', e.target.value)} />
              </Field>

              <Field id="instagram" label="Instagram (opcional)" error={errors.instagram}>
                <input id="instagram" value={form.instagram} onChange={(e) => update('instagram', e.target.value)} placeholder="@tuusuario" />
              </Field>

              <Field id="ocupacion" label="Ocupación o estudios" error={errors.ocupacion}>
                <input id="ocupacion" value={form.ocupacion} onChange={(e) => update('ocupacion', e.target.value)} />
              </Field>

              <Field id="idiomas" label="Idiomas (opcional)" error={errors.idiomas}>
                <input id="idiomas" value={form.idiomas} onChange={(e) => update('idiomas', e.target.value)} />
              </Field>

              <Field id="experiencia" label="Experiencia previa (opcional)" error={errors.experiencia}>
                <textarea id="experiencia" rows={3} value={form.experiencia} onChange={(e) => update('experiencia', e.target.value)} />
              </Field>

              <Field
                id="motivacion"
                label="¿Por qué quieres postular?"
                error={errors.motivacion}
                hint={`${form.motivacion.trim().length} / 80 caracteres mínimos`}
              >
                <textarea id="motivacion" rows={4} value={form.motivacion} onChange={(e) => update('motivacion', e.target.value)} />
              </Field>

              <Field id="causaSocial" label="¿Qué causa social te gustaría impulsar?" error={errors.causaSocial}>
                <textarea id="causaSocial" rows={3} value={form.causaSocial} onChange={(e) => update('causaSocial', e.target.value)} />
              </Field>
            </fieldset>
          )}

          {step === 2 && (
            <fieldset className="cand-insc-fieldset">
              <legend>Contacto y salud</legend>

              <Field id="emergencyContactName" label="Contacto de emergencia — nombre" error={errors.emergencyContactName}>
                <input id="emergencyContactName" value={form.emergencyContactName} onChange={(e) => update('emergencyContactName', e.target.value)} />
              </Field>

              <Field id="emergencyContactPhone" label="Contacto de emergencia — teléfono" error={errors.emergencyContactPhone}>
                <input id="emergencyContactPhone" type="tel" value={form.emergencyContactPhone} onChange={(e) => update('emergencyContactPhone', e.target.value)} placeholder="+56 9 1234 5678" />
              </Field>

              <Field
                id="condicionesMedicas"
                label="Alergias o condiciones médicas (opcional)"
                error={errors.condicionesMedicas}
                hint="Cuéntanos si hay algo que el equipo de producción deba saber para tus ensayos y pasarela."
              >
                <textarea
                  id="condicionesMedicas"
                  rows={3}
                  value={form.condicionesMedicas}
                  onChange={(e) => update('condicionesMedicas', e.target.value)}
                />
              </Field>

              <PhotoDropzone
                id="medicalCertificate"
                label="Certificado médico (opcional)"
                hint="JPG, PNG o PDF, hasta 5 MB — solo si tienes uno para respaldar lo anterior."
                accept="image/jpeg,image/png,application/pdf"
                file={medicalCertificate}
                onChange={setMedicalCertificate}
              />

              {age !== null && age < MINOR_AGE_THRESHOLD && (
                <div className="cand-insc-guardian-block">
                  <p className="cand-insc-hint">
                    Eres menor de edad — necesitamos los datos de tu madre, padre o representante legal.
                  </p>
                  <Field id="guardianName" label="Representante legal — nombre" error={errors.guardianName}>
                    <input id="guardianName" value={form.guardianName} onChange={(e) => update('guardianName', e.target.value)} />
                  </Field>
                  <Field id="guardianRut" label="Representante legal — RUT" error={errors.guardianRut}>
                    <input
                      id="guardianRut"
                      value={form.guardianRut}
                      onChange={(e) => update('guardianRut', e.target.value)}
                      onBlur={(e) => update('guardianRut', formatRut(e.target.value))}
                    />
                  </Field>
                </div>
              )}
            </fieldset>
          )}

          {step === 3 && (
            <fieldset className="cand-insc-fieldset">
              <legend>Fotografías</legend>
              <p className="cand-insc-hint">JPG o PNG, máximo 5 MB cada una, sin filtros ni edición.</p>

              <PhotoDropzone
                id="photoFace"
                label="Fotografía de rostro"
                hint="Tipo carnet, fondo neutro, buena luz."
                file={photoFace}
                error={errors.photoFace}
                onChange={setPhotoFace}
              />

              <PhotoDropzone
                id="photoFullBody"
                label="Fotografía de cuerpo entero"
                hint="De pie, cuerpo completo visible."
                file={photoFullBody}
                error={errors.photoFullBody}
                onChange={setPhotoFullBody}
              />
            </fieldset>
          )}

          {step === 4 && (
            <fieldset className="cand-insc-fieldset">
              <legend>Declaraciones</legend>

              <label className="cand-insc-checkbox" htmlFor="aceptaRequisitos">
                <input
                  id="aceptaRequisitos"
                  type="checkbox"
                  checked={decl.aceptaRequisitos}
                  onChange={(e) => setDecl((d) => ({ ...d, aceptaRequisitos: e.target.checked }))}
                />
                <span>Declaro que cumplo los requisitos de esta convocatoria y que los datos entregados son verídicos.</span>
              </label>
              {errors.aceptaRequisitos && <p className="cand-insc-error">{errors.aceptaRequisitos}</p>}

              <label className="cand-insc-checkbox" htmlFor="aceptaTratamientoDatos">
                <input
                  id="aceptaTratamientoDatos"
                  type="checkbox"
                  checked={decl.aceptaTratamientoDatos}
                  onChange={(e) => setDecl((d) => ({ ...d, aceptaTratamientoDatos: e.target.checked }))}
                />
                <span>
                  Autorizo el tratamiento de mis datos personales por parte de la organización, conforme a su{' '}
                  <a href={CONFIG.privacidadUrl} target="_blank" rel="noreferrer">política de privacidad</a>.
                </span>
              </label>
              {errors.aceptaTratamientoDatos && <p className="cand-insc-error">{errors.aceptaTratamientoDatos}</p>}

              <label className="cand-insc-checkbox" htmlFor="aceptaBases">
                <input
                  id="aceptaBases"
                  type="checkbox"
                  checked={decl.aceptaBases}
                  onChange={(e) => setDecl((d) => ({ ...d, aceptaBases: e.target.checked }))}
                />
                <span>
                  He leído y acepto las <a href={CONFIG.basesUrl} target="_blank" rel="noreferrer">bases del certamen</a>.
                </span>
              </label>
              {errors.aceptaBases && <p className="cand-insc-error">{errors.aceptaBases}</p>}

              <label className="cand-insc-checkbox" htmlFor="aceptaMarketing">
                <input
                  id="aceptaMarketing"
                  type="checkbox"
                  checked={decl.aceptaMarketing}
                  onChange={(e) => setDecl((d) => ({ ...d, aceptaMarketing: e.target.checked }))}
                />
                <span>Quiero recibir novedades y comunicaciones del certamen (opcional).</span>
              </label>
            </fieldset>
          )}

          {errors.form && <p id="form-error" className="cand-insc-error cand-insc-error-form">{errors.form}</p>}

          <div className="cand-insc-form-nav">
            {step > 0 ? (
              <button type="button" className="cand-insc-btn-ghost" onClick={handleBack} disabled={saving}>
                Atrás
              </button>
            ) : <span />}

            {step < FORM_STEPS.length - 1 ? (
              <button type="button" className="cand-insc-submit" onClick={handleNext}>
                Siguiente
              </button>
            ) : (
              <button type="submit" className="cand-insc-submit" disabled={saving}>
                {saving ? 'Enviando…' : 'Enviar mi postulación'}
              </button>
            )}
          </div>
        </form>
      </section>

      {/* ── Pie ──────────────────────────────────────────────────────────── */}
      <footer className="cand-insc-footer">
        <p className="cand-insc-footer-brand">{CONFIG.certamenNombre}</p>
        <p>{project.companyName}</p>
        <p className="cand-insc-footer-links">
          <a href={`mailto:${CONFIG.contactoEmail}`}><IconMail /> {CONFIG.contactoEmail}</a>
          <a href={CONFIG.contactoWhatsapp} target="_blank" rel="noreferrer"><IconWhatsapp /> WhatsApp</a>
          <a href={CONFIG.contactoInstagram} target="_blank" rel="noreferrer"><IconInstagram /> Instagram</a>
          <a href={CONFIG.basesUrl} target="_blank" rel="noreferrer">Bases</a>
          <a href={CONFIG.privacidadUrl} target="_blank" rel="noreferrer">Privacidad</a>
        </p>
      </footer>
    </div>
  );
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="cand-insc-countdown-unit">
      <span className="cand-insc-countdown-value">{String(value).padStart(2, '0')}</span>
      <span className="cand-insc-countdown-unit-label">{label}</span>
    </div>
  );
}

function PhotoDropzone({
  id,
  label,
  hint,
  file,
  error,
  onChange,
  accept = 'image/jpeg,image/png',
}: {
  id: string;
  label: string;
  hint: string;
  file: File | null;
  error?: string;
  onChange: (file: File | null) => void;
  /** Por defecto solo imágenes (fotografías) — el certificado médico además acepta PDF. */
  accept?: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isImage = file ? file.type.startsWith('image/') : false;

  useEffect(() => {
    if (!file || !isImage) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  function pickFile(f: File | undefined | null) {
    if (!f) return;
    if (f.size > MAX_PHOTO_BYTES) {
      setLocalError('El archivo supera los 5 MB — comprímelo e inténtalo de nuevo.');
      return;
    }
    const allowed = accept.split(',').map((t) => t.trim());
    if (!allowed.includes(f.type)) {
      setLocalError(accept.includes('pdf') ? 'El archivo debe ser JPG, PNG o PDF.' : 'El archivo debe ser JPG o PNG.');
      return;
    }
    setLocalError(null);
    onChange(f);
  }

  const shownError = error || localError || undefined;

  return (
    <div className="cand-insc-field">
      <label htmlFor={id}>{label}</label>
      <div
        className={`cand-insc-dropzone ${dragOver ? 'is-dragover' : ''} ${shownError ? 'is-invalid' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          className="cand-insc-dropzone-input"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        {file ? (
          <div className="cand-insc-dropzone-preview">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" />
            ) : (
              <span className="cand-insc-dropzone-filebadge" aria-hidden="true"><IconDocument /></span>
            )}
            <div className="cand-insc-dropzone-preview-info">
              <span>{file.name}</span>
              <button
                type="button"
                className="cand-insc-dropzone-remove"
                onClick={(e) => { e.stopPropagation(); setLocalError(null); onChange(null); }}
              >
                <IconClose /> Quitar
              </button>
            </div>
          </div>
        ) : (
          <div className="cand-insc-dropzone-empty">
            <IconUpload />
            <p>Arrastra tu archivo aquí o haz clic para elegirlo</p>
            <p className="cand-insc-hint">{hint}</p>
          </div>
        )}
      </div>
      {shownError && <p className="cand-insc-error">{shownError}</p>}
    </div>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="cand-insc-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <p className="cand-insc-hint">{hint}</p>}
      {error && <p className="cand-insc-error">{error}</p>}
    </div>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
      <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true" className="cand-insc-faq-chevron">
      <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true">
      <path d="M12 15V4M12 4L7.5 8.5M12 4l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDocument() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <path d="M7 3.5h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14 3.5v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 6.5L12 13l8.5-6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconWhatsapp() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M12.01 2C6.48 2 2 6.36 2 11.75c0 1.94.56 3.75 1.53 5.28L2 22l5.14-1.48a10.2 10.2 0 0 0 4.87 1.23h.01c5.53 0 10.01-4.36 10.01-9.75C22.03 6.36 17.54 2 12.01 2Zm5.86 13.88c-.25.68-1.42 1.3-1.96 1.36-.5.06-1.13.09-1.83-.11-.42-.12-.96-.31-1.65-.6-2.9-1.24-4.8-4.1-4.94-4.29-.14-.19-1.18-1.55-1.18-2.96 0-1.4.75-2.09 1.02-2.38.27-.28.58-.35.78-.35.19 0 .39 0 .55.01.18.01.42-.07.65.5.25.6.85 2.07.92 2.22.07.15.12.32.02.51-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.61.17.3.75 1.24 1.62 2.01 1.11 1 2.05 1.31 2.35 1.46.3.15.47.13.65-.08.18-.21.75-.88.95-1.18.2-.3.4-.25.66-.15.27.1 1.71.81 2 .96.29.15.48.22.55.34.07.13.07.71-.18 1.39Z" />
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

const STYLES = `
.cand-insc {
  --indigo-deep: #101638;
  --indigo-black: #0A0E24;
  --champagne: #E3C88F;
  --old-gold: #A8823F;
  --ivory: #F7F4EF;
  --copihue: #8E1B32;
  --hero-photo: ${HERO_PHOTO_CSS};
  font-family: var(--font-body), sans-serif;
  color: var(--ivory);
  background: var(--indigo-black);
}
.cand-insc h1, .cand-insc h2 { font-family: var(--font-display), serif; font-weight: 400; }

.cand-insc-loading, .cand-insc-success {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
  background: var(--indigo-black);
  color: var(--ivory);
}
.cand-insc-spinner {
  width: 2rem; height: 2rem;
  border: 2px solid rgba(227,200,143,0.25);
  border-top-color: var(--champagne);
  border-radius: 50%;
  margin-bottom: 1rem;
  animation: cand-insc-spin 0.8s linear infinite;
}
@keyframes cand-insc-spin { to { transform: rotate(360deg); } }
.cand-insc-success-check {
  width: 3.5rem; height: 3.5rem;
  border: 1px solid var(--champagne);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--champagne);
  margin-bottom: 1rem;
}
.cand-insc-success-check svg { width: 22px; height: 22px; }
.cand-insc-success-eyebrow { letter-spacing: 0.04em; color: var(--champagne); margin-bottom: 0.5rem; }
.cand-insc-success-folio {
  font-family: var(--font-display), serif;
  font-size: clamp(2rem, 6vw, 3.5rem);
  color: var(--champagne);
  border: 1px solid var(--old-gold);
  padding: 0.75rem 1.5rem;
  margin: 0.5rem 0 1.5rem;
}
.cand-insc-success-body { max-width: 32rem; line-height: 1.6; }
.cand-insc-success-steps {
  text-align: left;
  max-width: 28rem;
  margin: 1.75rem 0 0.5rem;
  padding-left: 1.25rem;
  line-height: 1.7;
  color: var(--ivory);
  opacity: 0.9;
}
.cand-insc-success-link { margin-top: 1.5rem; color: var(--champagne); font-size: 0.85rem; }

/* ── Nav ── */
.cand-insc-nav {
  position: sticky;
  top: 0;
  z-index: 50;
  background: transparent;
  transition: background 0.25s ease, border-color 0.25s ease, backdrop-filter 0.25s ease;
  border-bottom: 1px solid transparent;
}
.cand-insc-nav.is-scrolled {
  background: rgba(10,14,36,0.92);
  backdrop-filter: blur(8px);
  border-bottom-color: rgba(227,200,143,0.18);
}
.cand-insc-nav-inner {
  max-width: 72rem;
  margin: 0 auto;
  padding: 0.9rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 1.5rem;
}
.cand-insc-nav-brand {
  font-family: var(--font-display), serif;
  color: var(--champagne);
  text-decoration: none;
  font-size: 1.05rem;
  margin-right: auto;
}
.cand-insc-nav-links { display: flex; gap: 1.5rem; }
.cand-insc-nav-links a { color: var(--ivory); opacity: 0.85; text-decoration: none; font-size: 0.88rem; }
.cand-insc-nav-links a:hover { opacity: 1; color: var(--champagne); }
.cand-insc-nav-cta {
  border: 1px solid var(--champagne);
  color: var(--champagne);
  text-decoration: none;
  padding: 0.5rem 1.1rem;
  font-size: 0.85rem;
  white-space: nowrap;
  transition: background 0.2s, color 0.2s;
}
.cand-insc-nav-cta:hover { background: var(--champagne); color: var(--indigo-black); }
.cand-insc-nav-burger { display: none; flex-direction: column; gap: 4px; background: none; border: none; padding: 0.5rem; cursor: pointer; }
.cand-insc-nav-burger span { width: 20px; height: 2px; background: var(--champagne); display: block; }
.cand-insc-nav-mobile { display: none; }
@media (max-width: 780px) {
  .cand-insc-nav-links, .cand-insc-nav-cta { display: none; }
  .cand-insc-nav-burger { display: flex; }
  .cand-insc-nav-mobile.cand-insc-nav-mobile {
    display: flex; flex-direction: column;
    background: rgba(10,14,36,0.98);
    padding: 0.5rem 1.5rem 1.25rem;
    border-top: 1px solid rgba(227,200,143,0.18);
  }
  .cand-insc-nav-mobile a { color: var(--ivory); text-decoration: none; padding: 0.6rem 0; border-bottom: 1px solid rgba(247,244,239,0.08); font-size: 0.95rem; }
}

/* ── Hero ── */
.cand-insc-hero {
  position: relative;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--hero-photo);
  background-size: cover;
  background-position: center;
  margin-top: -73px;
  padding-top: 73px;
}
.cand-insc-hero-veil { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10,14,36,0.55) 0%, rgba(10,14,36,0.82) 100%); }
.cand-insc-hero-frame { position: absolute; inset: clamp(1rem, 4vw, 2.5rem); border: 1px solid var(--old-gold); pointer-events: none; }
.cand-insc-corner { position: absolute; width: 22px; height: 22px; border: 2px solid var(--champagne); }
.cand-insc-corner-tl { top: -2px; left: -2px; border-right: none; border-bottom: none; }
.cand-insc-corner-br { bottom: -2px; right: -2px; border-left: none; border-top: none; }
.cand-insc-star-field { position: absolute; inset: 0; pointer-events: none; }
.cand-insc-star { position: absolute; width: 2px; height: 2px; background: var(--champagne); border-radius: 50%; opacity: 0.6; }
.cand-insc-hero-content { position: relative; z-index: 1; max-width: 46rem; padding: 2rem; text-align: center; }
.cand-insc-hero-eyebrow {
  color: var(--champagne); font-size: 0.85rem; margin: 0 0 1rem;
  display: inline-flex; align-items: center; gap: 0.5rem;
}
.cand-insc-live-dot {
  width: 7px; height: 7px; border-radius: 50%; background: #4ADE80;
  box-shadow: 0 0 0 rgba(74,222,128,0.5);
  animation: cand-insc-pulse 1.8s infinite;
}
@keyframes cand-insc-pulse {
  0% { box-shadow: 0 0 0 0 rgba(74,222,128,0.5); }
  70% { box-shadow: 0 0 0 6px rgba(74,222,128,0); }
  100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); }
}
.cand-insc-hero-title { font-size: clamp(2.2rem, 7vw, 4.5rem); line-height: 1.1; margin: 0 0 1.25rem; }
.cand-insc-hero-tagline { font-size: 1.05rem; line-height: 1.6; color: var(--ivory); opacity: 0.9; margin: 0 0 2rem; }
.cand-insc-hero-cta {
  display: inline-block;
  border: 1px solid var(--champagne);
  color: var(--champagne);
  padding: 0.85rem 2.2rem;
  text-decoration: none;
  font-size: 0.95rem;
  letter-spacing: 0.02em;
  transition: background 0.2s, color 0.2s;
}
.cand-insc-hero-cta:hover { background: var(--champagne); color: var(--indigo-black); }
.cand-insc-hero-dates { margin-top: 1.75rem; font-size: 0.85rem; color: var(--champagne); opacity: 0.85; }

.cand-insc-countdown { margin-top: 2rem; }
.cand-insc-countdown-label { font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--champagne); opacity: 0.8; margin: 0 0 0.6rem; }
.cand-insc-countdown-grid { display: flex; gap: 0.6rem; justify-content: center; }
.cand-insc-countdown-unit {
  display: flex; flex-direction: column; align-items: center;
  border: 1px solid rgba(227,200,143,0.35);
  padding: 0.5rem 0.7rem;
  min-width: 3.2rem;
}
.cand-insc-countdown-value { font-family: var(--font-display), serif; font-size: 1.4rem; color: var(--champagne); }
.cand-insc-countdown-unit-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.75; }

@keyframes cand-insc-fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
.cand-insc-anim { opacity: 0; animation: cand-insc-fade-up 0.7s ease-out forwards; }
@media (prefers-reduced-motion: reduce) { .cand-insc-anim { animation: none; opacity: 1; } }

/* ── Stats ── */
.cand-insc-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: var(--ivory);
  color: var(--indigo-black);
}
.cand-insc-stat {
  padding: 1.75rem 1rem;
  text-align: center;
  border-right: 1px solid rgba(10,14,36,0.1);
  display: flex; flex-direction: column; gap: 0.3rem;
}
.cand-insc-stat:last-child { border-right: none; }
.cand-insc-stat-value { font-family: var(--font-display), serif; font-size: clamp(1.1rem, 3vw, 1.5rem); color: var(--copihue); }
.cand-insc-stat-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; }
@media (max-width: 640px) {
  .cand-insc-stats { grid-template-columns: repeat(2, 1fr); }
  .cand-insc-stat:nth-child(2) { border-right: none; }
}

/* ── Secciones ── */
.cand-insc-section { max-width: 42rem; margin: 0 auto; padding: 4rem 1.5rem; line-height: 1.7; }
.cand-insc-section-dark { background: var(--indigo-deep); max-width: none; }
.cand-insc-section-dark > * { max-width: 42rem; margin-left: auto; margin-right: auto; }
.cand-insc-section:not(.cand-insc-section-dark) { background: var(--ivory); color: var(--indigo-black); }
.cand-insc-h2 { font-size: clamp(1.5rem, 4vw, 2rem); margin: 0 0 1.25rem; color: var(--old-gold); }
.cand-insc-section:not(.cand-insc-section-dark) .cand-insc-h2 { color: var(--copihue); }
.cand-insc-list { list-style: none; padding: 0; margin: 0; }
.cand-insc-list li {
  padding: 0.7rem 0; border-bottom: 1px solid rgba(10,14,36,0.1);
  display: flex; align-items: center; gap: 0.65rem;
}
.cand-insc-list li svg { flex-shrink: 0; color: var(--copihue); }
.cand-insc-steps { list-style: none; padding: 0; margin: 0; counter-reset: step; }
.cand-insc-steps li { display: flex; gap: 1rem; align-items: flex-start; padding: 0.75rem 0; }
.cand-insc-step-num {
  flex-shrink: 0;
  width: 2rem; height: 2rem;
  border: 1px solid var(--champagne);
  color: var(--champagne);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display), serif;
}

/* ── FAQ ── */
.cand-insc-faq { display: flex; flex-direction: column; gap: 0.6rem; }
.cand-insc-faq-item {
  border: 1px solid rgba(10,14,36,0.12);
  padding: 0.2rem 1rem;
}
.cand-insc-faq-item summary {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 0.9rem 0;
  cursor: pointer;
  font-weight: 700;
  list-style: none;
}
.cand-insc-faq-item summary::-webkit-details-marker { display: none; }
.cand-insc-faq-chevron { transition: transform 0.2s; flex-shrink: 0; color: var(--copihue); }
.cand-insc-faq-item[open] .cand-insc-faq-chevron { transform: rotate(180deg); }
.cand-insc-faq-item p { margin: 0 0 1rem; opacity: 0.85; line-height: 1.6; }

/* ── Progreso del formulario ── */
.cand-insc-progress {
  list-style: none;
  display: flex;
  margin: 0 0 2.5rem;
  padding: 0;
  counter-reset: step;
}
.cand-insc-progress li {
  flex: 1;
  display: flex; flex-direction: column; align-items: center;
  text-align: center;
  position: relative;
  font-size: 0.72rem;
  opacity: 0.55;
}
.cand-insc-progress li::before {
  content: '';
  position: absolute;
  top: 1rem; left: -50%; width: 100%; height: 1px;
  background: rgba(10,14,36,0.15);
  z-index: 0;
}
.cand-insc-progress li:first-child::before { display: none; }
.cand-insc-progress li.is-done, .cand-insc-progress li.is-current { opacity: 1; }
.cand-insc-progress li.is-done::before { background: var(--copihue); }
.cand-insc-progress-dot {
  position: relative; z-index: 1;
  width: 2rem; height: 2rem;
  border-radius: 50%;
  border: 1px solid rgba(10,14,36,0.25);
  background: var(--ivory);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display), serif;
  margin-bottom: 0.4rem;
}
.cand-insc-progress li.is-current .cand-insc-progress-dot { border-color: var(--copihue); color: var(--copihue); }
.cand-insc-progress li.is-done .cand-insc-progress-dot { background: var(--copihue); border-color: var(--copihue); color: var(--ivory); }
.cand-insc-progress-label { max-width: 6rem; }
@media (max-width: 480px) { .cand-insc-progress-label { display: none; } }

/* ── Formulario ── */
.cand-insc-fieldset { border: none; padding: 0; margin: 0 0 2rem; }
.cand-insc-fieldset legend { font-family: var(--font-display), serif; font-size: 1.3rem; color: var(--copihue); padding: 0 0 1rem; width: 100%; border-bottom: 1px solid var(--old-gold); margin-bottom: 1.25rem; }
.cand-insc-field { margin-bottom: 1.1rem; }
.cand-insc-field label { display: block; font-size: 0.85rem; font-weight: 700; margin-bottom: 0.3rem; }
.cand-insc-field input, .cand-insc-field select, .cand-insc-field textarea {
  width: 100%;
  border: 1px solid var(--indigo-deep);
  background: #fff;
  color: var(--indigo-black);
  padding: 0.65rem 0.75rem;
  font-family: var(--font-body), sans-serif;
  font-size: 0.95rem;
  border-radius: 2px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.cand-insc-field input:focus-visible, .cand-insc-field select:focus-visible, .cand-insc-field textarea:focus-visible {
  outline: none;
  border-color: var(--copihue);
  box-shadow: 0 0 0 3px rgba(142,27,50,0.12);
}
.cand-insc-field input[aria-invalid="true"] { border-color: var(--copihue); }
.cand-insc-hint { font-size: 0.78rem; color: var(--old-gold); margin: 0.3rem 0 0; }
.cand-insc-error { font-size: 0.8rem; color: var(--copihue); margin: 0.3rem 0 0; font-weight: 700; }
.cand-insc-error-form { border: 1px solid var(--copihue); padding: 0.75rem 1rem; margin-bottom: 1.5rem; }
.cand-insc-guardian-block {
  border-top: 1px dashed rgba(10,14,36,0.2);
  margin-top: 1.5rem;
  padding-top: 1.25rem;
}
.cand-insc-checkbox { display: flex; gap: 0.6rem; align-items: flex-start; margin-bottom: 0.75rem; font-size: 0.9rem; line-height: 1.5; }
.cand-insc-checkbox input { margin-top: 0.2rem; }
.cand-insc-checkbox a { color: var(--copihue); }
.cand-insc-honeypot { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }

/* ── Dropzone ── */
.cand-insc-dropzone {
  border: 1.5px dashed var(--old-gold);
  background: rgba(168,130,63,0.04);
  padding: 1.5rem 1rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.cand-insc-dropzone:hover, .cand-insc-dropzone.is-dragover { border-color: var(--copihue); background: rgba(142,27,50,0.04); }
.cand-insc-dropzone.is-invalid { border-color: var(--copihue); border-style: solid; }
.cand-insc-dropzone-input { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.cand-insc-dropzone-empty { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; color: var(--old-gold); }
.cand-insc-dropzone-empty p { margin: 0; font-size: 0.9rem; color: var(--indigo-black); }
.cand-insc-dropzone-preview { display: flex; align-items: center; gap: 1rem; text-align: left; }
.cand-insc-dropzone-preview img { width: 4.5rem; height: 4.5rem; object-fit: cover; border-radius: 4px; border: 1px solid var(--old-gold); }
.cand-insc-dropzone-filebadge {
  width: 4.5rem; height: 4.5rem; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px; border: 1px solid var(--old-gold);
  color: var(--old-gold); background: rgba(168,130,63,0.08);
}
.cand-insc-dropzone-preview-info { display: flex; flex-direction: column; gap: 0.4rem; overflow: hidden; }
.cand-insc-dropzone-preview-info > span { font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 14rem; }
.cand-insc-dropzone-remove {
  display: inline-flex; align-items: center; gap: 0.3rem;
  border: 1px solid var(--copihue); color: var(--copihue);
  background: none; padding: 0.3rem 0.6rem; font-size: 0.78rem; cursor: pointer; width: fit-content;
}
.cand-insc-dropzone-remove:hover { background: var(--copihue); color: var(--ivory); }

/* ── Navegación del wizard ── */
.cand-insc-form-nav { display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; gap: 1rem; }
.cand-insc-btn-ghost {
  background: none; border: 1px solid var(--indigo-black); color: var(--indigo-black);
  padding: 0.85rem 1.5rem; font-size: 0.95rem; cursor: pointer;
}
.cand-insc-btn-ghost:hover { background: rgba(10,14,36,0.06); }
.cand-insc-submit {
  border: 1px solid var(--copihue);
  background: var(--copihue);
  color: var(--ivory);
  padding: 0.9rem 2rem;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  margin-left: auto;
}
.cand-insc-submit:hover { filter: brightness(1.08); }
.cand-insc-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.cand-insc-submit:focus-visible, .cand-insc-btn-ghost:focus-visible { outline: 2px solid var(--old-gold); outline-offset: 2px; }
@media (max-width: 420px) {
  .cand-insc-submit { padding: 0.9rem 1.2rem; }
}

/* ── Pie ── */
.cand-insc-footer { background: var(--indigo-black); padding: 2.5rem 1.5rem; text-align: center; font-size: 0.85rem; }
.cand-insc-footer-brand { font-family: var(--font-display), serif; font-size: 1.2rem; color: var(--champagne); margin-bottom: 0.3rem; }
.cand-insc-footer-links { display: flex; flex-wrap: wrap; gap: 1.25rem; justify-content: center; margin-top: 1rem; }
.cand-insc-footer-links a { color: var(--champagne); text-decoration: none; display: inline-flex; align-items: center; gap: 0.4rem; }
.cand-insc-footer-links a:hover { text-decoration: underline; }

@media (max-width: 380px) {
  .cand-insc-section, .cand-insc-hero-content { padding-left: 1rem; padding-right: 1rem; }
}
`;
