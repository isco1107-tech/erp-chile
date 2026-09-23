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

/** Cinta que separa el hero del resto: los cuatro hechos que más se preguntan. */
const RIBBON_ITEMS = [
  'Postulación 100% gratuita',
  'Región de La Araucanía',
  'Sin experiencia previa requerida',
  'Casting presencial',
  'Folio inmediato',
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

/**
 * Revelado al hacer scroll: marca `is-revealed` en todo elemento con
 * `data-reveal` cuando entra en viewport. Un solo observer para toda la
 * página (en vez de un hook por sección) y `unobserve` al revelar, para que
 * el efecto no se repita al subir y bajar.
 *
 * `deps` fuerza a re-observar cuando el árbol cambia (ej. al pasar de la
 * pantalla de carga a la página completa, o al cambiar de paso del wizard).
 */
function useScrollReveal(deps: readonly unknown[]) {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-revealed)'));
    if (nodes.length === 0) return;

    // Sin IntersectionObserver (o con motion reducida) se muestra todo de una
    // vez: el contenido nunca debe quedar invisible por un efecto decorativo.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      for (const node of nodes) node.classList.add('is-revealed');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
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
  const [scrollPct, setScrollPct] = useState(0);
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
    const onScroll = () => {
      setNavScrolled(window.scrollY > 80);
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setScrollPct(scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const age = useMemo(() => calcAge(form.birthDate), [form.birthDate]);
  const closesAt = useMemo(() => (project?.registrationClosesAt ? new Date(project.registrationClosesAt) : null), [project]);
  const countdown = useCountdown(closesAt);

  useScrollReveal([loading, notFound, folio, step]);

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
          <span className="cand-insc-success-rays" aria-hidden="true" />
          <span className="cand-insc-success-check" aria-hidden="true"><IconCheck /></span>
          <p className="cand-insc-success-eyebrow">¡Recibimos tu postulación!</p>
          <p className="cand-insc-success-folio-label">Tu folio</p>
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
        <span className="cand-insc-nav-progress" style={{ transform: `scaleX(${scrollPct / 100})` }} aria-hidden="true" />
        <div className="cand-insc-nav-inner">
          <a href="#top" className="cand-insc-nav-brand">
            <IconCrown />
            {CONFIG.certamenNombre}
          </a>
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
            <span
              key={i}
              className="cand-insc-star"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                animationDelay: `${(i % 7) * 0.55}s`,
                animationDuration: `${3.4 + (i % 5) * 0.7}s`,
                transform: `scale(${i % 3 === 0 ? 1.6 : 1})`,
              }}
            />
          ))}
        </div>
        <span className="cand-insc-hero-sheen" aria-hidden="true" />
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
            <span className="cand-insc-hero-title-lead">{CONFIG.heroTitulo}</span>
            <span className="cand-insc-hero-title-main">{CONFIG.certamenNombre}</span>
          </h1>
          <div className="cand-insc-ornament cand-insc-anim" style={{ animationDelay: '0.22s' }} aria-hidden="true">
            <span />
            <IconDiamond />
            <span />
          </div>
          <p className="cand-insc-hero-tagline cand-insc-anim" style={{ animationDelay: '0.28s' }}>{CONFIG.heroBajada}</p>
          <div className="cand-insc-hero-actions cand-insc-anim" style={{ animationDelay: '0.4s' }}>
            <a href="#formulario" className="cand-insc-hero-cta">
              Quiero postular
              <IconArrow />
            </a>
            <a href="#convocatoria" className="cand-insc-hero-cta-ghost">Conocer la convocatoria</a>
          </div>

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

        <a href="#convocatoria" className="cand-insc-scroll-cue" aria-label="Bajar a la convocatoria">
          <span />
        </a>
      </section>

      {/* ── Cinta ────────────────────────────────────────────────────────── */}
      <div className="cand-insc-ribbon" aria-hidden="true">
        <div className="cand-insc-ribbon-track">
          {[0, 1].map((copy) => (
            <span key={copy} className="cand-insc-ribbon-group">
              {RIBBON_ITEMS.map((item) => (
                <span key={item} className="cand-insc-ribbon-item">
                  <IconDiamond />
                  {item}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* ── Datos clave ──────────────────────────────────────────────────── */}
      <section className="cand-insc-stats" data-reveal>
        {[
          { value: `${project.minCandidateAge}+`, label: 'Años cumplidos' },
          { value: '$0', label: 'Costo de postulación' },
          { value: 'Araucanía', label: 'Región requerida' },
          { value: `${FORM_STEPS.length} pasos`, label: 'Postulación en minutos' },
        ].map((stat) => (
          <div key={stat.label} className="cand-insc-stat">
            <span className="cand-insc-stat-value">{stat.value}</span>
            <span className="cand-insc-stat-label">{stat.label}</span>
          </div>
        ))}
      </section>

      {/* ── Convocatoria ─────────────────────────────────────────────────── */}
      <section className="cand-insc-section cand-insc-section-dark" id="convocatoria" data-reveal>
        <p className="cand-insc-kicker">La convocatoria</p>
        <h2 className="cand-insc-h2">Más que una corona: una plataforma.</h2>
        <p>
          {CONFIG.certamenNombre} busca a la próxima representante de La Araucanía: una mujer con presencia, carácter y una
          causa que la mueva. No es solo un certamen de belleza — es una plataforma para dar voz a proyectos sociales
          reales durante todo tu reinado.
        </p>
        <blockquote className="cand-insc-quote">
          Buscamos presencia, carácter y una causa que te mueva. La preparación técnica la entregamos nosotros.
        </blockquote>
        <p>
          El proceso parte con esta postulación. Con tus datos y fotografías, el equipo organizador hace una primera
          revisión y cita a una instancia presencial de casting a quienes avanzan. Desde ahí, un grupo reducido pasa a ser
          candidata oficial y se prepara junto al equipo de producción para la gala final.
        </p>
      </section>

      {/* ── Requisitos ───────────────────────────────────────────────────── */}
      <section className="cand-insc-section" id="requisitos" data-reveal>
        <p className="cand-insc-kicker">Requisitos</p>
        <h2 className="cand-insc-h2">Lo que necesitas para postular</h2>
        <ul className="cand-insc-list">
          {[
            `Tener ${project.minCandidateAge} años cumplidos, sin edad máxima.`,
            'Nacionalidad chilena o residencia definitiva en Chile.',
            'Residir en la Región de La Araucanía.',
            'Disponibilidad para asistir a ensayos y actividades de preparación.',
            'No registrar condenas por crimen o simple delito.',
          ].map((req) => (
            <li key={req}>
              <span className="cand-insc-list-mark" aria-hidden="true"><IconCheck /></span>
              {req}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Cómo inscribirse ─────────────────────────────────────────────── */}
      <section className="cand-insc-section cand-insc-section-dark" data-reveal>
        <p className="cand-insc-kicker">Paso a paso</p>
        <h2 className="cand-insc-h2">Cómo inscribirte</h2>
        <ol className="cand-insc-steps">
          {[
            { t: 'Reúne tu material', d: 'Tus datos y dos fotografías recientes: una de rostro y una de cuerpo entero.' },
            { t: 'Completa el formulario', d: 'Cinco pasos cortos con tus datos, tu motivación y tu causa social.' },
            { t: 'Recibe tu folio', d: 'Al instante, por pantalla y por correo. Es tu comprobante de postulación.' },
            { t: 'Espera el contacto', d: 'La organización revisa todo y cita a casting presencial a quienes avanzan.' },
          ].map((s, i) => (
            <li key={s.t}>
              <span className="cand-insc-step-num">{i + 1}</span>
              <span className="cand-insc-step-body">
                <span className="cand-insc-step-title">{s.t}</span>
                <span className="cand-insc-step-desc">{s.d}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Preguntas frecuentes ─────────────────────────────────────────── */}
      <section className="cand-insc-section" id="preguntas" data-reveal>
        <p className="cand-insc-kicker">Dudas</p>
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
      <section className="cand-insc-section cand-insc-section-form" id="formulario">
        <div ref={formTopRef} />
        <p className="cand-insc-kicker">Postulación</p>
        <h2 className="cand-insc-h2">Formulario de postulación</h2>
        <p className="cand-insc-form-lead">
          Toma unos minutos. Puedes avanzar paso a paso — nada se envía hasta el último.
        </p>

        <div className="cand-insc-form-card">
          <div className="cand-insc-progress-head">
            <span className="cand-insc-progress-step">Paso {step + 1} de {FORM_STEPS.length}</span>
            <span className="cand-insc-progress-name">{FORM_STEPS[step]!.title}</span>
          </div>
          <div className="cand-insc-progress-bar" aria-hidden="true">
            <span style={{ width: `${((step + 1) / FORM_STEPS.length) * 100}%` }} />
          </div>

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
        </div>
      </section>

      {/* Barra fija en móvil: en un formulario largo el CTA queda fuera de
          pantalla la mayor parte del scroll. Solo aparece una vez pasado el
          hero, para no tapar el primer impacto de la página. */}
      <div className={`cand-insc-sticky-cta ${navScrolled ? 'is-visible' : ''}`}>
        <span>
          <strong>{CONFIG.certamenNombre}</strong>
          Postulación gratuita
        </span>
        <a href="#formulario">Postular</a>
      </div>

      {/* ── Pie ──────────────────────────────────────────────────────────── */}
      <footer className="cand-insc-footer">
        <div className="cand-insc-ornament" aria-hidden="true">
          <span />
          <IconDiamond />
          <span />
        </div>
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

function IconCrown() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M3 8.5l3.5 3L12 4.5l5.5 7 3.5-3-1.8 10H4.8L3 8.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" />
    </svg>
  );
}

function IconDiamond() {
  return (
    <svg viewBox="0 0 12 12" width="9" height="9" fill="currentColor" aria-hidden="true">
      <path d="M6 0l1.6 4.4L12 6l-4.4 1.6L6 12l-1.6-4.4L0 6l4.4-1.6L6 0Z" />
    </svg>
  );
}

function IconArrow() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true" className="cand-insc-arrow">
      <path d="M4 10h11M11 5.5l4.5 4.5L11 14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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

/**
 * Hoja de estilo de la landing de inscripción. Vive en un `<style>` inyectado
 * y no en Tailwind a propósito: esta página es una pieza de marca del
 * certamen (tipografía display, paleta champagne/copihue, ornamentos) y no
 * comparte tokens con el resto del ERP — ver la nota de arquitectura arriba.
 */
const STYLES = `
.cand-insc {
  --indigo-deep: #101638;
  --indigo-black: #070A1C;
  --indigo-veil: #0C1130;
  --champagne: #E9D2A0;
  --champagne-bright: #F6E7C4;
  --old-gold: #A8823F;
  --ivory: #FBF9F5;
  --ivory-warm: #F3EEE5;
  --copihue: #8E1B32;
  --copihue-bright: #B3243F;
  --ink: #171326;
  --ink-soft: #5B5468;
  --hero-photo: ${HERO_PHOTO_CSS};
  font-family: var(--font-body), sans-serif;
  color: var(--ivory);
  background: var(--indigo-black);
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}
.cand-insc h1, .cand-insc h2, .cand-insc h3 { font-family: var(--font-display), serif; font-weight: 400; }
.cand-insc *::selection { background: rgba(233,210,160,0.28); color: var(--ivory); }

/* ── Revelado al hacer scroll ─────────────────────────────────────────── */
.cand-insc [data-reveal] {
  opacity: 0;
  transform: translateY(26px);
  transition: opacity 0.85s cubic-bezier(0.16,1,0.3,1), transform 0.85s cubic-bezier(0.16,1,0.3,1);
}
.cand-insc [data-reveal].is-revealed { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .cand-insc [data-reveal] { opacity: 1; transform: none; transition: none; }
}

/* ── Pantallas de estado ──────────────────────────────────────────────── */
.cand-insc-loading, .cand-insc-success {
  position: relative;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2.5rem 1.5rem;
  background:
    radial-gradient(ellipse 60% 45% at 50% 0%, rgba(168,130,63,0.18), transparent 70%),
    var(--indigo-black);
  color: var(--ivory);
  overflow: hidden;
}
.cand-insc-loading p { color: rgba(251,249,245,0.72); line-height: 1.6; max-width: 30rem; }
.cand-insc-spinner {
  width: 2.25rem; height: 2.25rem;
  border: 2px solid rgba(233,210,160,0.22);
  border-top-color: var(--champagne);
  border-radius: 50%;
  margin-bottom: 1.25rem;
  animation: cand-insc-spin 0.8s linear infinite;
}
@keyframes cand-insc-spin { to { transform: rotate(360deg); } }

.cand-insc-success-rays {
  position: absolute; top: 50%; left: 50%;
  width: 46rem; height: 46rem; transform: translate(-50%, -50%);
  background: conic-gradient(from 0deg, transparent 0deg, rgba(233,210,160,0.09) 12deg, transparent 24deg,
    transparent 36deg, rgba(233,210,160,0.09) 48deg, transparent 60deg);
  -webkit-mask-image: radial-gradient(circle, #000 0%, transparent 62%);
  mask-image: radial-gradient(circle, #000 0%, transparent 62%);
  animation: cand-insc-rays 60s linear infinite;
  pointer-events: none;
}
@keyframes cand-insc-rays { to { transform: translate(-50%, -50%) rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .cand-insc-success-rays { animation: none; } }

.cand-insc-success > * { position: relative; z-index: 1; }
.cand-insc-success-check {
  width: 3.75rem; height: 3.75rem;
  border: 1px solid var(--champagne);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--champagne);
  margin-bottom: 1.25rem;
  box-shadow: 0 0 48px -10px rgba(233,210,160,0.65);
  animation: cand-insc-pop 0.6s cubic-bezier(0.16,1,0.3,1) both;
}
@keyframes cand-insc-pop { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: none; } }
.cand-insc-success-check svg { width: 24px; height: 24px; }
.cand-insc-success-eyebrow {
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--champagne); margin: 0 0 1.75rem;
}
.cand-insc-success-folio-label {
  margin: 0; font-size: 0.7rem; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(251,249,245,0.5);
}
.cand-insc-success-folio {
  font-family: var(--font-display), serif;
  font-size: clamp(2.25rem, 7vw, 3.75rem);
  letter-spacing: 0.06em;
  color: var(--champagne-bright);
  border-top: 1px solid rgba(168,130,63,0.6);
  border-bottom: 1px solid rgba(168,130,63,0.6);
  padding: 0.6rem 2rem;
  margin: 0.5rem 0 1.75rem;
}
.cand-insc-success-body { max-width: 34rem; line-height: 1.7; color: rgba(251,249,245,0.82); margin: 0; }
.cand-insc-success-steps {
  text-align: left;
  max-width: 30rem;
  margin: 2rem 0 0.5rem;
  padding-left: 1.25rem;
  line-height: 1.75;
  color: rgba(251,249,245,0.75);
  font-size: 0.92rem;
}
.cand-insc-success-steps li::marker { color: var(--champagne); }
.cand-insc-success-link {
  margin-top: 1.75rem; color: var(--champagne); font-size: 0.82rem;
  text-decoration: none; border-bottom: 1px solid rgba(233,210,160,0.35); padding-bottom: 2px;
}
.cand-insc-success-link:hover { color: var(--champagne-bright); border-color: var(--champagne-bright); }

/* ── Nav ──────────────────────────────────────────────────────────────── */
.cand-insc-nav {
  position: sticky;
  top: 0;
  z-index: 50;
  background: transparent;
  transition: background 0.3s ease, border-color 0.3s ease, backdrop-filter 0.3s ease;
  border-bottom: 1px solid transparent;
}
.cand-insc-nav.is-scrolled {
  background: rgba(7,10,28,0.86);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  border-bottom-color: rgba(233,210,160,0.16);
}
.cand-insc-nav-progress {
  position: absolute; bottom: -1px; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--old-gold), var(--champagne-bright));
  transform-origin: left center;
  transition: transform 0.12s linear;
  opacity: 0;
}
.cand-insc-nav.is-scrolled .cand-insc-nav-progress { opacity: 1; }
.cand-insc-nav-inner {
  max-width: 72rem;
  margin: 0 auto;
  padding: 0.95rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 1.5rem;
}
.cand-insc-nav-brand {
  display: inline-flex; align-items: center; gap: 0.55rem;
  font-family: var(--font-display), serif;
  color: var(--champagne);
  text-decoration: none;
  font-size: 1.08rem;
  letter-spacing: 0.02em;
  margin-right: auto;
  transition: color 0.2s ease;
}
.cand-insc-nav-brand:hover { color: var(--champagne-bright); }
.cand-insc-nav-links { display: flex; gap: 1.75rem; }
.cand-insc-nav-links a {
  position: relative;
  color: rgba(251,249,245,0.78);
  text-decoration: none;
  font-size: 0.84rem;
  letter-spacing: 0.02em;
  padding-bottom: 3px;
  transition: color 0.2s ease;
}
.cand-insc-nav-links a::after {
  content: '';
  position: absolute; left: 0; bottom: 0; height: 1px; width: 100%;
  background: var(--champagne);
  transform: scaleX(0); transform-origin: right center;
  transition: transform 0.28s cubic-bezier(0.16,1,0.3,1);
}
.cand-insc-nav-links a:hover { color: var(--champagne); }
.cand-insc-nav-links a:hover::after { transform: scaleX(1); transform-origin: left center; }
.cand-insc-nav-cta {
  position: relative; overflow: hidden;
  border: 1px solid rgba(233,210,160,0.55);
  color: var(--champagne);
  text-decoration: none;
  padding: 0.55rem 1.25rem;
  border-radius: 999px;
  font-size: 0.82rem;
  letter-spacing: 0.03em;
  white-space: nowrap;
  transition: background 0.25s ease, color 0.25s ease, border-color 0.25s ease;
}
.cand-insc-nav-cta:hover { background: var(--champagne); color: var(--indigo-black); border-color: var(--champagne); }
.cand-insc-nav-burger { display: none; flex-direction: column; gap: 4px; background: none; border: none; padding: 0.5rem; cursor: pointer; }
.cand-insc-nav-burger span { width: 20px; height: 1.5px; background: var(--champagne); display: block; transition: transform 0.2s ease; }
.cand-insc-nav-mobile { display: none; }
@media (max-width: 820px) {
  .cand-insc-nav-links, .cand-insc-nav-cta { display: none; }
  .cand-insc-nav-burger { display: flex; }
  .cand-insc-nav-mobile.cand-insc-nav-mobile {
    display: flex; flex-direction: column;
    background: rgba(7,10,28,0.98);
    backdrop-filter: blur(14px);
    padding: 0.5rem 1.5rem 1.25rem;
    border-top: 1px solid rgba(233,210,160,0.16);
  }
  .cand-insc-nav-mobile a {
    color: var(--ivory); text-decoration: none; padding: 0.75rem 0;
    border-bottom: 1px solid rgba(251,249,245,0.07); font-size: 0.95rem; letter-spacing: 0.02em;
  }
}

/* ── Hero ─────────────────────────────────────────────────────────────── */
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
  margin-top: -74px;
  padding: 8rem 0 6rem;
}
.cand-insc-hero-veil {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 65% 50% at 50% 42%, rgba(168,130,63,0.20), transparent 72%),
    linear-gradient(180deg, rgba(7,10,28,0.62) 0%, rgba(7,10,28,0.80) 55%, rgba(7,10,28,0.97) 100%);
}
.cand-insc-hero-sheen {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(115deg, transparent 38%, rgba(246,231,196,0.07) 50%, transparent 62%);
  background-size: 260% 100%;
  animation: cand-insc-sheen 11s ease-in-out infinite;
}
@keyframes cand-insc-sheen { 0%, 100% { background-position: 130% 0; } 55% { background-position: -30% 0; } }
@media (prefers-reduced-motion: reduce) { .cand-insc-hero-sheen { animation: none; opacity: 0; } }
.cand-insc-hero-frame {
  position: absolute; inset: clamp(1rem, 3.5vw, 2.5rem);
  border: 1px solid rgba(168,130,63,0.55);
  pointer-events: none;
}
.cand-insc-corner { position: absolute; width: 26px; height: 26px; border: 1.5px solid var(--champagne); }
.cand-insc-corner-tl { top: -2px; left: -2px; border-right: none; border-bottom: none; }
.cand-insc-corner-br { bottom: -2px; right: -2px; border-left: none; border-top: none; }
.cand-insc-star-field { position: absolute; inset: 0; pointer-events: none; }
.cand-insc-star {
  position: absolute; width: 2px; height: 2px;
  background: var(--champagne-bright); border-radius: 50%;
  opacity: 0.5;
  animation: cand-insc-twinkle 4s ease-in-out infinite;
}
@keyframes cand-insc-twinkle {
  0%, 100% { opacity: 0.18; }
  50% { opacity: 0.85; box-shadow: 0 0 6px rgba(246,231,196,0.8); }
}
@media (prefers-reduced-motion: reduce) { .cand-insc-star { animation: none; opacity: 0.5; } }

.cand-insc-hero-content { position: relative; z-index: 1; max-width: 50rem; padding: 2rem 1.5rem; text-align: center; }
.cand-insc-hero-eyebrow {
  color: var(--champagne); font-size: 0.74rem; margin: 0 0 1.5rem;
  letter-spacing: 0.2em; text-transform: uppercase; font-weight: 600;
  display: inline-flex; align-items: center; gap: 0.6rem;
  border: 1px solid rgba(233,210,160,0.28);
  border-radius: 999px;
  padding: 0.4rem 1rem;
  background: rgba(7,10,28,0.35);
  backdrop-filter: blur(6px);
}
.cand-insc-live-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #4ADE80;
  box-shadow: 0 0 0 rgba(74,222,128,0.5);
  animation: cand-insc-pulse 1.8s infinite;
}
@keyframes cand-insc-pulse {
  0% { box-shadow: 0 0 0 0 rgba(74,222,128,0.5); }
  70% { box-shadow: 0 0 0 6px rgba(74,222,128,0); }
  100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); }
}
.cand-insc-hero-title { margin: 0; line-height: 1.02; }
.cand-insc-hero-title-lead {
  display: block;
  font-family: var(--font-body), sans-serif;
  font-size: clamp(0.78rem, 2vw, 0.95rem);
  font-weight: 500;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: rgba(251,249,245,0.62);
  margin-bottom: 1rem;
}
.cand-insc-hero-title-main {
  display: block;
  font-size: clamp(2.6rem, 9vw, 5.75rem);
  letter-spacing: 0.01em;
  background: linear-gradient(100deg, var(--champagne) 0%, var(--champagne-bright) 32%, #FFFDF8 46%, var(--champagne-bright) 60%, var(--old-gold) 100%);
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: cand-insc-shine 9s ease-in-out infinite;
}
@keyframes cand-insc-shine { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
@media (prefers-reduced-motion: reduce) { .cand-insc-hero-title-main { animation: none; } }

.cand-insc-ornament {
  display: flex; align-items: center; justify-content: center; gap: 0.85rem;
  margin: 1.5rem auto;
  max-width: 18rem;
  color: var(--champagne);
}
.cand-insc-ornament > span {
  flex: 1; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(233,210,160,0.65));
}
.cand-insc-ornament > span:last-child { background: linear-gradient(90deg, rgba(233,210,160,0.65), transparent); }

.cand-insc-hero-tagline {
  font-size: clamp(1rem, 2.2vw, 1.15rem); line-height: 1.7;
  color: rgba(251,249,245,0.85);
  margin: 0 auto 2.25rem; max-width: 34rem;
}
.cand-insc-hero-actions { display: flex; flex-wrap: wrap; gap: 0.85rem; justify-content: center; }
.cand-insc-hero-cta {
  position: relative; overflow: hidden;
  display: inline-flex; align-items: center; gap: 0.6rem;
  background: linear-gradient(135deg, var(--champagne-bright), var(--old-gold));
  color: var(--indigo-black);
  padding: 0.95rem 2.25rem;
  border-radius: 999px;
  text-decoration: none;
  font-size: 0.95rem; font-weight: 700; letter-spacing: 0.03em;
  box-shadow: 0 14px 40px -16px rgba(233,210,160,0.85);
  transition: transform 0.18s ease, box-shadow 0.25s ease;
}
.cand-insc-hero-cta::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,0.6) 50%, transparent 68%);
  transform: translateX(-130%);
  transition: transform 0.7s ease;
}
.cand-insc-hero-cta:hover { transform: translateY(-2px); box-shadow: 0 20px 48px -16px rgba(233,210,160,0.95); }
.cand-insc-hero-cta:hover::after { transform: translateX(130%); }
.cand-insc-hero-cta .cand-insc-arrow { transition: transform 0.22s ease; position: relative; z-index: 1; }
.cand-insc-hero-cta:hover .cand-insc-arrow { transform: translateX(3px); }
.cand-insc-hero-cta-ghost {
  display: inline-flex; align-items: center;
  border: 1px solid rgba(233,210,160,0.45);
  color: var(--champagne);
  padding: 0.95rem 1.85rem;
  border-radius: 999px;
  text-decoration: none;
  font-size: 0.92rem; letter-spacing: 0.03em;
  transition: background 0.25s ease, border-color 0.25s ease, color 0.25s ease;
}
.cand-insc-hero-cta-ghost:hover { background: rgba(233,210,160,0.12); border-color: var(--champagne); color: var(--champagne-bright); }
.cand-insc-hero-dates {
  margin-top: 2rem; font-size: 0.8rem; letter-spacing: 0.06em;
  color: rgba(233,210,160,0.8); text-transform: uppercase;
}

.cand-insc-countdown { margin-top: 2.5rem; }
.cand-insc-countdown-label {
  font-size: 0.68rem; letter-spacing: 0.22em; text-transform: uppercase;
  color: rgba(233,210,160,0.75); margin: 0 0 0.85rem;
}
.cand-insc-countdown-grid { display: flex; gap: 0.55rem; justify-content: center; }
.cand-insc-countdown-unit {
  display: flex; flex-direction: column; align-items: center; gap: 0.15rem;
  border: 1px solid rgba(233,210,160,0.3);
  border-radius: 12px;
  background: rgba(7,10,28,0.45);
  backdrop-filter: blur(8px);
  padding: 0.7rem 0.5rem 0.55rem;
  min-width: 4rem;
}
.cand-insc-countdown-value {
  font-family: var(--font-display), serif; font-size: 1.75rem; line-height: 1;
  color: var(--champagne-bright); font-variant-numeric: tabular-nums;
}
.cand-insc-countdown-unit-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.16em; color: rgba(251,249,245,0.6); }

.cand-insc-scroll-cue {
  position: absolute; bottom: 2.25rem; left: 50%; transform: translateX(-50%);
  width: 24px; height: 38px; border: 1px solid rgba(233,210,160,0.45); border-radius: 999px;
  display: flex; justify-content: center; padding-top: 7px; z-index: 1;
}
.cand-insc-scroll-cue > span {
  width: 3px; height: 7px; border-radius: 999px; background: var(--champagne);
  animation: cand-insc-cue 1.9s ease-in-out infinite;
}
@keyframes cand-insc-cue { 0%, 100% { opacity: 0; transform: translateY(0); } 40% { opacity: 1; } 80% { opacity: 0; transform: translateY(12px); } }
@media (max-height: 700px) { .cand-insc-scroll-cue { display: none; } }

@keyframes cand-insc-fade-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
.cand-insc-anim { opacity: 0; animation: cand-insc-fade-up 0.85s cubic-bezier(0.16,1,0.3,1) forwards; }
@media (prefers-reduced-motion: reduce) { .cand-insc-anim { animation: none; opacity: 1; } }

/* ── Cinta ────────────────────────────────────────────────────────────── */
.cand-insc-ribbon {
  overflow: hidden;
  background: var(--indigo-deep);
  border-top: 1px solid rgba(233,210,160,0.18);
  border-bottom: 1px solid rgba(233,210,160,0.18);
  padding: 0.85rem 0;
}
.cand-insc-ribbon-track { display: flex; width: max-content; animation: cand-insc-marquee 34s linear infinite; }
.cand-insc-ribbon-group { display: flex; }
.cand-insc-ribbon-item {
  display: inline-flex; align-items: center; gap: 0.85rem;
  padding: 0 2rem;
  font-size: 0.72rem; letter-spacing: 0.24em; text-transform: uppercase;
  color: rgba(233,210,160,0.85);
  white-space: nowrap;
}
@keyframes cand-insc-marquee { to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .cand-insc-ribbon-track { animation: none; } }

/* ── Datos clave ──────────────────────────────────────────────────────── */
.cand-insc-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: var(--ivory);
  color: var(--ink);
}
.cand-insc-stat {
  padding: 2.25rem 1rem;
  text-align: center;
  border-right: 1px solid rgba(23,19,38,0.09);
  display: flex; flex-direction: column; gap: 0.45rem;
  transition: background 0.25s ease;
}
.cand-insc-stat:hover { background: var(--ivory-warm); }
.cand-insc-stat:last-child { border-right: none; }
.cand-insc-stat-value {
  font-family: var(--font-display), serif;
  font-size: clamp(1.35rem, 3.4vw, 2rem);
  color: var(--copihue);
  line-height: 1.1;
}
.cand-insc-stat-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-soft); }
@media (max-width: 680px) {
  .cand-insc-stats { grid-template-columns: repeat(2, 1fr); }
  .cand-insc-stat { padding: 1.75rem 0.75rem; border-bottom: 1px solid rgba(23,19,38,0.09); }
  .cand-insc-stat:nth-child(2n) { border-right: none; }
  .cand-insc-stat:nth-last-child(-n+2) { border-bottom: none; }
}

/* ── Secciones ────────────────────────────────────────────────────────── */
.cand-insc-section { max-width: 44rem; margin: 0 auto; padding: 5.5rem 1.5rem; line-height: 1.8; }
.cand-insc-section p { color: var(--ink-soft); font-size: 1rem; }
.cand-insc-section-dark { background: var(--indigo-deep); max-width: none; }
.cand-insc-section-dark > * { max-width: 44rem; margin-left: auto; margin-right: auto; }
.cand-insc-section-dark p { color: rgba(251,249,245,0.78); }
.cand-insc-section:not(.cand-insc-section-dark) { background: var(--ivory); color: var(--ink); }
.cand-insc-kicker {
  display: flex; align-items: center; gap: 0.7rem;
  margin: 0 0 0.6rem;
  font-size: 0.68rem; font-weight: 700; letter-spacing: 0.24em; text-transform: uppercase;
  color: var(--old-gold);
}
.cand-insc-kicker::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, rgba(168,130,63,0.45), transparent); }
.cand-insc-section-dark .cand-insc-kicker { color: var(--champagne); }
.cand-insc-h2 {
  font-size: clamp(1.85rem, 5vw, 2.75rem);
  line-height: 1.15;
  margin: 0 0 1.5rem;
  color: var(--ink);
  letter-spacing: -0.005em;
}
.cand-insc-section-dark .cand-insc-h2 { color: var(--ivory); }
.cand-insc-quote {
  margin: 2rem 0;
  padding: 0.35rem 0 0.35rem 1.5rem;
  border-left: 2px solid var(--champagne);
  font-family: var(--font-display), serif;
  font-size: clamp(1.25rem, 3.2vw, 1.6rem);
  line-height: 1.45;
  color: var(--champagne-bright);
}

.cand-insc-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.cand-insc-list li {
  display: flex; align-items: flex-start; gap: 0.9rem;
  padding: 1rem 1.15rem;
  border: 1px solid rgba(23,19,38,0.09);
  border-radius: 14px;
  background: #fff;
  font-size: 0.96rem;
  line-height: 1.6;
  color: var(--ink);
  transition: border-color 0.22s ease, transform 0.22s ease, box-shadow 0.22s ease;
}
.cand-insc-list li:hover {
  border-color: rgba(142,27,50,0.32);
  transform: translateX(3px);
  box-shadow: 0 10px 26px -20px rgba(23,19,38,0.6);
}
.cand-insc-list-mark {
  flex-shrink: 0; margin-top: 0.1rem;
  width: 1.5rem; height: 1.5rem; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(142,27,50,0.1);
  color: var(--copihue);
}

.cand-insc-steps { list-style: none; padding: 0; margin: 0; position: relative; }
.cand-insc-steps li { display: flex; gap: 1.25rem; align-items: flex-start; padding: 0 0 2rem; position: relative; }
.cand-insc-steps li:last-child { padding-bottom: 0; }
.cand-insc-steps li::before {
  content: '';
  position: absolute; left: 1.1rem; top: 2.4rem; bottom: 0.5rem;
  width: 1px;
  background: linear-gradient(180deg, rgba(233,210,160,0.5), rgba(233,210,160,0.06));
}
.cand-insc-steps li:last-child::before { display: none; }
.cand-insc-step-num {
  flex-shrink: 0;
  width: 2.25rem; height: 2.25rem;
  border: 1px solid rgba(233,210,160,0.5);
  border-radius: 50%;
  color: var(--champagne);
  background: var(--indigo-deep);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display), serif;
  font-size: 1.05rem;
  position: relative; z-index: 1;
}
.cand-insc-step-body { display: flex; flex-direction: column; gap: 0.3rem; padding-top: 0.15rem; }
.cand-insc-step-title { font-size: 1.02rem; font-weight: 700; color: var(--ivory); }
.cand-insc-step-desc { font-size: 0.94rem; line-height: 1.65; color: rgba(251,249,245,0.72); }

/* ── FAQ ──────────────────────────────────────────────────────────────── */
.cand-insc-faq { display: flex; flex-direction: column; gap: 0.55rem; }
.cand-insc-faq-item {
  border: 1px solid rgba(23,19,38,0.1);
  border-radius: 14px;
  background: #fff;
  padding: 0 1.15rem;
  transition: border-color 0.22s ease, box-shadow 0.22s ease;
}
.cand-insc-faq-item[open] { border-color: rgba(142,27,50,0.28); box-shadow: 0 12px 30px -24px rgba(23,19,38,0.8); }
.cand-insc-faq-item summary {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 1.1rem 0;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.98rem;
  color: var(--ink);
  list-style: none;
}
.cand-insc-faq-item summary::-webkit-details-marker { display: none; }
.cand-insc-faq-item summary:focus-visible { outline: 2px solid var(--copihue); outline-offset: 4px; border-radius: 6px; }
.cand-insc-faq-chevron { transition: transform 0.25s ease; flex-shrink: 0; color: var(--copihue); }
.cand-insc-faq-item[open] .cand-insc-faq-chevron { transform: rotate(180deg); }
.cand-insc-faq-item p {
  margin: 0 0 1.15rem; color: var(--ink-soft); line-height: 1.7; font-size: 0.94rem;
  animation: cand-insc-fade-up 0.35s ease-out both;
}

/* ── Tarjeta del formulario ───────────────────────────────────────────── */
.cand-insc-section-form { background: var(--ivory-warm); color: var(--ink); max-width: none; }
.cand-insc-section-form > * { max-width: 44rem; margin-left: auto; margin-right: auto; }
.cand-insc-form-lead { margin: -0.75rem 0 2rem; color: var(--ink-soft); }
.cand-insc-form-card {
  background: #fff;
  border: 1px solid rgba(23,19,38,0.08);
  border-radius: 22px;
  padding: 1.75rem;
  box-shadow: 0 40px 80px -50px rgba(23,19,38,0.55), 0 2px 6px -2px rgba(23,19,38,0.06);
}
@media (min-width: 640px) { .cand-insc-form-card { padding: 2.5rem; } }

.cand-insc-progress-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 0.6rem; }
.cand-insc-progress-step { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--copihue); }
.cand-insc-progress-name { font-size: 0.82rem; color: var(--ink-soft); }
.cand-insc-progress-bar { height: 4px; border-radius: 999px; background: rgba(23,19,38,0.08); overflow: hidden; margin-bottom: 2rem; }
.cand-insc-progress-bar > span {
  display: block; height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--copihue), var(--copihue-bright));
  transition: width 0.55s cubic-bezier(0.16,1,0.3,1);
}

.cand-insc-progress {
  list-style: none;
  display: flex;
  margin: 0 0 2.25rem;
  padding: 0;
}
.cand-insc-progress li {
  flex: 1;
  display: flex; flex-direction: column; align-items: center;
  text-align: center;
  position: relative;
  font-size: 0.68rem;
  color: var(--ink-soft);
  opacity: 0.6;
  transition: opacity 0.25s ease;
}
.cand-insc-progress li::before {
  content: '';
  position: absolute;
  top: 1.05rem; left: -50%; width: 100%; height: 1px;
  background: rgba(23,19,38,0.14);
  z-index: 0;
  transition: background 0.35s ease;
}
.cand-insc-progress li:first-child::before { display: none; }
.cand-insc-progress li.is-done, .cand-insc-progress li.is-current { opacity: 1; }
.cand-insc-progress li.is-done::before, .cand-insc-progress li.is-current::before { background: var(--copihue); }
.cand-insc-progress-dot {
  position: relative; z-index: 1;
  width: 2.1rem; height: 2.1rem;
  border-radius: 50%;
  border: 1px solid rgba(23,19,38,0.2);
  background: #fff;
  color: var(--ink-soft);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display), serif;
  font-size: 0.95rem;
  margin-bottom: 0.5rem;
  transition: border-color 0.25s ease, background 0.25s ease, color 0.25s ease, box-shadow 0.25s ease;
}
.cand-insc-progress li.is-current .cand-insc-progress-dot {
  border-color: var(--copihue); color: var(--copihue);
  box-shadow: 0 0 0 4px rgba(142,27,50,0.12);
}
.cand-insc-progress li.is-done .cand-insc-progress-dot { background: var(--copihue); border-color: var(--copihue); color: var(--ivory); }
.cand-insc-progress-label { max-width: 6.5rem; line-height: 1.35; }
@media (max-width: 560px) { .cand-insc-progress-label { display: none; } }

/* ── Campos ───────────────────────────────────────────────────────────── */
.cand-insc-fieldset { border: none; padding: 0; margin: 0 0 1.75rem; animation: cand-insc-fade-up 0.4s ease-out both; }
.cand-insc-fieldset legend {
  font-family: var(--font-display), serif;
  font-size: 1.5rem;
  color: var(--ink);
  padding: 0 0 0.9rem;
  width: 100%;
  border-bottom: 1px solid rgba(23,19,38,0.1);
  margin-bottom: 1.5rem;
}
.cand-insc-field { margin-bottom: 1.25rem; }
.cand-insc-field label { display: block; font-size: 0.82rem; font-weight: 700; margin-bottom: 0.45rem; color: var(--ink); }
.cand-insc-field input, .cand-insc-field select, .cand-insc-field textarea {
  width: 100%;
  min-height: 2.95rem;
  border: 1px solid rgba(23,19,38,0.16);
  background: #fff;
  color: var(--ink);
  padding: 0.7rem 0.9rem;
  font-family: var(--font-body), sans-serif;
  font-size: 0.96rem;
  border-radius: 10px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}
.cand-insc-field textarea { line-height: 1.6; resize: vertical; }
.cand-insc-field input::placeholder, .cand-insc-field textarea::placeholder { color: rgba(91,84,104,0.55); }
.cand-insc-field input:hover, .cand-insc-field select:hover, .cand-insc-field textarea:hover { border-color: rgba(23,19,38,0.3); }
.cand-insc-field input:focus-visible, .cand-insc-field select:focus-visible, .cand-insc-field textarea:focus-visible {
  outline: none;
  border-color: var(--copihue);
  box-shadow: 0 0 0 4px rgba(142,27,50,0.12);
}
.cand-insc-field select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7.5l5 5 5-5' stroke='%235B5468' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  background-size: 1.1rem;
  padding-right: 2.5rem;
}
.cand-insc-hint { font-size: 0.78rem; color: var(--ink-soft); margin: 0.4rem 0 0; line-height: 1.5; }
.cand-insc-error { font-size: 0.8rem; color: var(--copihue); margin: 0.4rem 0 0; font-weight: 700; }
.cand-insc-error-form {
  border: 1px solid rgba(142,27,50,0.35);
  background: rgba(142,27,50,0.07);
  border-radius: 12px;
  padding: 0.85rem 1rem;
  margin-bottom: 1.5rem;
}
.cand-insc-guardian-block {
  border: 1px dashed rgba(168,130,63,0.5);
  border-radius: 14px;
  background: rgba(168,130,63,0.05);
  margin-top: 1.5rem;
  padding: 1.25rem;
}
.cand-insc-checkbox {
  display: flex; gap: 0.75rem; align-items: flex-start;
  margin-bottom: 0.65rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(23,19,38,0.1);
  border-radius: 12px;
  font-size: 0.9rem; line-height: 1.6;
  color: var(--ink);
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}
.cand-insc-checkbox:hover { border-color: rgba(142,27,50,0.3); background: rgba(142,27,50,0.02); }
.cand-insc-checkbox:has(input:checked) { border-color: rgba(142,27,50,0.4); background: rgba(142,27,50,0.05); }
.cand-insc-checkbox input { margin-top: 0.25rem; width: 1.05rem; height: 1.05rem; accent-color: var(--copihue); flex-shrink: 0; }
.cand-insc-checkbox a { color: var(--copihue); font-weight: 600; }
.cand-insc-honeypot { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }

/* ── Dropzone ─────────────────────────────────────────────────────────── */
.cand-insc-dropzone {
  border: 1.5px dashed rgba(168,130,63,0.6);
  border-radius: 16px;
  background: rgba(168,130,63,0.045);
  padding: 1.85rem 1rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}
.cand-insc-dropzone:hover, .cand-insc-dropzone.is-dragover {
  border-color: var(--copihue);
  background: rgba(142,27,50,0.05);
  transform: translateY(-1px);
}
.cand-insc-dropzone:focus-visible { outline: 2px solid var(--copihue); outline-offset: 3px; }
.cand-insc-dropzone.is-invalid { border-color: var(--copihue); border-style: solid; background: rgba(142,27,50,0.05); }
.cand-insc-dropzone-input { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.cand-insc-dropzone-empty { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; color: var(--old-gold); }
.cand-insc-dropzone-empty p { margin: 0; font-size: 0.92rem; font-weight: 600; color: var(--ink); }
.cand-insc-dropzone-preview { display: flex; align-items: center; gap: 1rem; text-align: left; }
.cand-insc-dropzone-preview img {
  width: 4.75rem; height: 4.75rem; object-fit: cover; border-radius: 12px;
  border: 1px solid rgba(168,130,63,0.5);
}
.cand-insc-dropzone-filebadge {
  width: 4.75rem; height: 4.75rem; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 12px; border: 1px solid rgba(168,130,63,0.5);
  color: var(--old-gold); background: rgba(168,130,63,0.08);
}
.cand-insc-dropzone-preview-info { display: flex; flex-direction: column; gap: 0.5rem; overflow: hidden; }
.cand-insc-dropzone-preview-info > span {
  font-size: 0.85rem; font-weight: 600; color: var(--ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 14rem;
}
.cand-insc-dropzone-remove {
  display: inline-flex; align-items: center; gap: 0.35rem;
  border: 1px solid rgba(142,27,50,0.5); border-radius: 999px; color: var(--copihue);
  background: none; padding: 0.35rem 0.75rem; font-size: 0.76rem; font-weight: 600; cursor: pointer; width: fit-content;
  transition: background 0.18s ease, color 0.18s ease;
}
.cand-insc-dropzone-remove:hover { background: var(--copihue); color: var(--ivory); }

/* ── Navegación del wizard ────────────────────────────────────────────── */
.cand-insc-form-nav { display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem; gap: 1rem; }
.cand-insc-btn-ghost {
  background: none;
  border: 1px solid rgba(23,19,38,0.2);
  border-radius: 999px;
  color: var(--ink);
  padding: 0.9rem 1.75rem;
  font-family: var(--font-body), sans-serif;
  font-size: 0.94rem; font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}
.cand-insc-btn-ghost:hover { background: rgba(23,19,38,0.05); border-color: rgba(23,19,38,0.35); }
.cand-insc-submit {
  position: relative; overflow: hidden;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--copihue-bright), var(--copihue));
  color: var(--ivory);
  padding: 0.95rem 2.25rem;
  font-family: var(--font-body), sans-serif;
  font-size: 0.98rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  margin-left: auto;
  box-shadow: 0 14px 34px -18px rgba(142,27,50,0.95);
  transition: transform 0.18s ease, box-shadow 0.25s ease;
}
.cand-insc-submit::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,0.4) 50%, transparent 68%);
  transform: translateX(-130%);
  transition: transform 0.7s ease;
}
.cand-insc-submit:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 20px 44px -18px rgba(142,27,50,1); }
.cand-insc-submit:hover:not(:disabled)::after { transform: translateX(130%); }
.cand-insc-submit:disabled { opacity: 0.55; cursor: not-allowed; }
.cand-insc-submit:focus-visible, .cand-insc-btn-ghost:focus-visible { outline: 2px solid var(--old-gold); outline-offset: 3px; }
@media (max-width: 440px) {
  .cand-insc-submit { padding: 0.9rem 1.35rem; }
  .cand-insc-btn-ghost { padding: 0.9rem 1.15rem; }
}

/* ── CTA fija en móvil ────────────────────────────────────────────────── */
.cand-insc-sticky-cta {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
  display: none;
  align-items: center; justify-content: space-between; gap: 1rem;
  padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
  background: rgba(7,10,28,0.94);
  backdrop-filter: blur(14px);
  border-top: 1px solid rgba(233,210,160,0.2);
  transform: translateY(110%);
  transition: transform 0.35s cubic-bezier(0.16,1,0.3,1);
}
.cand-insc-sticky-cta.is-visible { transform: none; }
.cand-insc-sticky-cta > span { display: flex; flex-direction: column; font-size: 0.7rem; color: rgba(251,249,245,0.6); line-height: 1.3; }
.cand-insc-sticky-cta strong { font-family: var(--font-display), serif; font-size: 0.95rem; font-weight: 400; color: var(--champagne); }
.cand-insc-sticky-cta a {
  background: linear-gradient(135deg, var(--champagne-bright), var(--old-gold));
  color: var(--indigo-black);
  text-decoration: none;
  padding: 0.7rem 1.5rem;
  border-radius: 999px;
  font-size: 0.88rem; font-weight: 700;
  white-space: nowrap;
}
@media (max-width: 820px) { .cand-insc-sticky-cta { display: flex; } }

/* ── Pie ──────────────────────────────────────────────────────────────── */
.cand-insc-footer {
  background: var(--indigo-black);
  padding: 3.5rem 1.5rem calc(3.5rem + env(safe-area-inset-bottom));
  text-align: center;
  font-size: 0.85rem;
  color: rgba(251,249,245,0.6);
  border-top: 1px solid rgba(233,210,160,0.14);
}
.cand-insc-footer .cand-insc-ornament { margin-bottom: 1.5rem; }
.cand-insc-footer-brand {
  font-family: var(--font-display), serif; font-size: 1.5rem;
  color: var(--champagne); margin: 0 0 0.35rem; letter-spacing: 0.02em;
}
.cand-insc-footer-links { display: flex; flex-wrap: wrap; gap: 1.5rem; justify-content: center; margin-top: 1.75rem; }
.cand-insc-footer-links a {
  color: var(--champagne); text-decoration: none;
  display: inline-flex; align-items: center; gap: 0.45rem;
  font-size: 0.83rem;
  transition: color 0.2s ease;
}
.cand-insc-footer-links a:hover { color: var(--champagne-bright); text-decoration: underline; text-underline-offset: 4px; }
@media (max-width: 820px) { .cand-insc-footer { padding-bottom: calc(6.5rem + env(safe-area-inset-bottom)); } }

@media (max-width: 400px) {
  .cand-insc-section, .cand-insc-hero-content { padding-left: 1.15rem; padding-right: 1.15rem; }
  .cand-insc-form-card { padding: 1.25rem; }
}
`;
