'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { formatRut } from '@/lib/chile/rut';
import { ARAUCANIA_COMUNAS, CANDIDATE_HONEYPOT_FIELD, candidateSelfRegistrationSchema } from '@/modules/candidates/schema';
import { getCandidateRegistrationProjectAction } from '@/modules/candidates/actions/public-registration.actions';
import type { RegistrationProjectInfo } from '@/modules/candidates/services/candidates.service';
import { CONFIG } from '@/modules/candidates/registration-config';
import TurnstileWidget, { isTurnstileConfigured } from '@/components/security/TurnstileWidget';
import { ageInSantiago } from '@/lib/chile/timezone';
import { galaDateParts, shortDate, splitPageantTitle } from '@/lib/events/pageant-site';
import { PAGEANT_FONT_CLASSES } from '@/components/public/pageant/fonts';
import { Arrow, Calendar, Check, Crown, Diamond, Instagram, Mail, Plus, Tiara, Whatsapp } from '@/components/public/pageant/icons';
import { HeroSky, Kicker, pad } from '@/components/public/pageant/parts';
import { PAGEANT_SITE_STYLES } from '@/components/public/pageant/styles';
import { REGISTRATION_STYLES } from './registration-styles';
import { MAX_ORIGINAL_PHOTO_BYTES, MAX_PDF_BYTES, MAX_REQUEST_BYTES, compressPhoto, uploadFailureMessage } from './upload-limits';

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
 * IDENTIDAD VISUAL: la página usa el mismo sistema que el micrositio del
 * certamen (`src/components/public/pageant/`: fuentes, estilos, tiara, cielo
 * del hero) más `registration-styles.ts` para lo propio de la postulación —
 * sitio e inscripción se ven como una sola marca. Sin nombre de la empresa
 * del ERP en pantalla: todo lo visible es del certamen.
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

/** Misma función que el servidor: fecha de nacimiento en UTC, "hoy" en Chile. */
function calcAge(birthDateStr: string): number | null {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr);
  if (Number.isNaN(birth.getTime())) return null;
  return ageInSantiago(birth);
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
 * Revelado al hacer scroll: marca `is-in` en todo elemento con
 * `data-reveal` cuando entra en viewport. Un solo observer para toda la
 * página (en vez de un hook por sección) y `unobserve` al revelar, para que
 * el efecto no se repita al subir y bajar.
 *
 * `deps` fuerza a re-observar cuando el árbol cambia (ej. al pasar de la
 * pantalla de carga a la página completa, o al cambiar de paso del wizard).
 */
function useScrollReveal(deps: readonly unknown[]) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.pgs');
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)'));
    if (!root || nodes.length === 0) return;

    // Sin IntersectionObserver (o con motion reducida) se muestra todo de una
    // vez: el contenido nunca debe quedar invisible por un efecto decorativo.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      for (const node of nodes) node.classList.add('is-in');
      return;
    }

    root.dataset.motion = 'on';
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
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
  // Cloudflare Turnstile (solo si está configurado): token de un solo uso,
  // se remonta el widget tras cada envío fallido para pedir uno nuevo.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
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
    // Al corregir un campo su error desaparece; no queda rojo hasta el próximo "Siguiente".
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  }

  function toggleDecl(key: keyof Declaraciones, value: boolean) {
    setDecl((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
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

    // Todo junto debe caber en un request de Vercel (~4,5 MB).
    const attachments = (photoFace?.size ?? 0) + (photoFullBody?.size ?? 0) + (medicalCertificate?.size ?? 0);
    if (!errs.photoFace && !errs.photoFullBody && attachments > MAX_REQUEST_BYTES) {
      if (medicalCertificate) errs.medicalCertificate = 'Los archivos juntos son muy pesados. Sube el certificado como foto (JPG) o quítalo.';
      else errs.photoFullBody = 'Las fotografías juntas son muy pesadas. Prueba con otra foto de menor tamaño.';
    }

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
    // Solo los errores de este paso: los del siguiente no deben aparecer en
    // rojo antes de que la postulante llegue a esos campos.
    setErrors(stepErrors);
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

    // Enter en un campo de un paso intermedio (el "Ir" del teclado del
    // teléfono) avanza de paso en vez de intentar enviar todo el formulario.
    if (step < FORM_STEPS.length - 1) {
      handleNext();
      return;
    }

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
      if (turnstileToken) body.append('cf-turnstile-response', turnstileToken);
      if (photoFace) body.append('photoFace', photoFace);
      if (photoFullBody) body.append('photoFullBody', photoFullBody);
      if (medicalCertificate) body.append('medicalCertificate', medicalCertificate);

      const res = await fetch(`/api/public/candidates/${token}/apply`, { method: 'POST', body });
      // Un 413 de Vercel (o un 502) no trae JSON: sin este chequeo el
      // `res.json()` lanzaba y se mostraba "revisa tu conexión".
      if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
        setErrors({ form: uploadFailureMessage(res.status) });
        document.getElementById('form-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
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
      if (isTurnstileConfigured) {
        setTurnstileToken(null);
        setTurnstileKey((key) => key + 1);
      }
    }
  }

  const accent = project?.accent ?? 'gold';

  if (loading) {
    return (
      <RegistrationShell accent={accent}>
        <main className="cand-screen" role="status">
          <span className="cand-spinner" aria-hidden="true" />
          <p className="cand-screen-text">Cargando la convocatoria…</p>
        </main>
      </RegistrationShell>
    );
  }

  if (notFound || !project) {
    return (
      <RegistrationShell accent={accent}>
        <main className="cand-screen">
          <HeroSky />
          <div className="cand-screen-inner">
            <Tiara className="pgs-tiara" />
            <h1 className="cand-screen-title">Link no disponible</h1>
            <p className="cand-screen-text">Este link de inscripción no existe o ya no está vigente. Pide uno nuevo a la organización del certamen.</p>
          </div>
        </main>
      </RegistrationShell>
    );
  }

  const privacyHref = `${CONFIG.privacidadUrl}?certamen=${encodeURIComponent(token)}`;
  const contact = project.contact;
  const hasContact = Boolean(contact.email || contact.whatsapp || contact.instagram);
  const title = splitPageantTitle(project.projectName);
  const shortName = [title.lead, title.main].filter(Boolean).join(' ');
  const titleFit = { '--pgs-fit': Math.max(title.main.length, 6) * 0.64 } as CSSProperties;

  if (!project.isOpen) {
    return (
      <RegistrationShell accent={accent}>
        <main className="cand-screen">
          <HeroSky />
          <div className="cand-screen-inner">
            <Tiara className="pgs-tiara" />
            <p className="pgs-eyebrow">{shortName}</p>
            <h1 className="cand-screen-title">Convocatoria cerrada</h1>
            <p className="cand-screen-text">{project.closedReason ?? 'Esta convocatoria no está recibiendo postulaciones por el momento.'}</p>
            {hasContact && <ContactLinks contact={contact} />}
          </div>
        </main>
      </RegistrationShell>
    );
  }

  if (folio) {
    const firstName = form.fullName.trim().split(/\s+/)[0] ?? '';
    return (
      <RegistrationShell accent={accent}>
        <main className="cand-screen is-success">
          <HeroSky />
          <div className="cand-screen-inner">
            <span className="cand-success-mark" aria-hidden="true">
              <Check />
            </span>
            <p className="pgs-eyebrow">Postulación recibida</p>
            <h1 className="cand-screen-title">{firstName ? <>¡Gracias, <em>{firstName}</em>!</> : '¡Gracias por postular!'}</h1>
            <div className="cand-folio">
              <span>Tu folio</span>
              <strong>{folio}</strong>
            </div>
            <p className="cand-screen-text">
              Guárdalo como comprobante: te enviamos una copia a tu correo. La organización de <strong>{project.projectName}</strong> revisará tu postulación y te contactará si
              avanzas a la siguiente etapa.
            </p>
            <ol className="cand-success-steps">
              <li>
                <span>01</span>Revisamos tu postulación junto al resto del equipo organizador.
              </li>
              <li>
                <span>02</span>Si avanzas, te contactamos por correo o teléfono para citarte a un casting presencial.
              </li>
              <li>
                <span>03</span>Desde ahí, un grupo reducido pasa a ser candidata oficial de {project.projectName}.
              </li>
            </ol>
            {hasContact && <ContactLinks contact={contact} />}
            <a className="pgs-link" href={privacyHref}>
              Política de privacidad
            </a>
          </div>
        </main>
      </RegistrationShell>
    );
  }

  const gala = project.galaDate ? galaDateParts(new Date(project.galaDate).toISOString()) : null;
  const closesLabel = project.registrationClosesAt ? shortDate(new Date(project.registrationClosesAt).toISOString()) : null;
  const stats = [
    { value: `${project.minCandidateAge}+`, label: 'Años cumplidos', word: false },
    { value: '$0', label: 'Costo de postulación', word: false },
    { value: 'Araucanía', label: 'Región', word: true },
    { value: String(FORM_STEPS.length), label: 'Pasos en línea', word: false },
  ];

  return (
    <RegistrationShell accent={accent}>
      <a className="pgs-skip" href="#formulario">
        Ir al formulario
      </a>

      {/* ── Barra superior ─────────────────────────────────────────────── */}
      <header className={`pgs-top${navScrolled || menuOpen ? ' is-solid' : ''}`}>
        <span className="cand-scroll-progress" style={{ transform: `scaleX(${scrollPct / 100})` }} aria-hidden="true" />
        <a className="pgs-brand" href="#top" aria-label={`${project.projectName}, inicio`}>
          <Crown className="pgs-brand-mark" />
          <span className="pgs-brand-name">
            {title.lead && <span className="pgs-brand-lead">{title.lead} </span>}
            {title.main}
          </span>
        </a>
        <nav className="pgs-nav" aria-label="Secciones">
          {NAV_LINKS.filter((l) => l.href !== '#formulario').map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="pgs-top-actions">
          <a className="pgs-btn is-gold is-small" href="#formulario">
            <span>Postular</span>
          </a>
          <button
            type="button"
            className={`pgs-burger${menuOpen ? ' is-open' : ''}`}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            aria-controls="cand-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span />
            <span />
          </button>
        </div>
      </header>
      {menuOpen && (
        <nav id="cand-menu" className="pgs-menu" aria-label="Menú">
          <ol>
            {NAV_LINKS.map((l, i) => (
              <li key={l.href} style={{ animationDelay: `${0.05 + i * 0.05}s` }}>
                <a href={l.href} onClick={() => setMenuOpen(false)}>
                  <span className="pgs-menu-index">{pad(i + 1)}</span>
                  {l.label}
                </a>
              </li>
            ))}
          </ol>
          {hasContact && (
            <div className="pgs-menu-foot">
              <ContactLinks contact={contact} />
            </div>
          )}
        </nav>
      )}

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section id="top" className="pgs-hero" aria-labelledby="cand-title">
        <HeroSky />
        <div className="pgs-hero-inner">
          <Tiara className="pgs-tiara" />
          <p className="pgs-hero-eyebrow pgs-rise cand-eyebrow-live" style={{ animationDelay: '0.2s' }}>
            <span className="pgs-live-dot" aria-hidden="true" />
            Convocatoria abierta
          </p>
          <h1 id="cand-title" className="pgs-title" style={titleFit}>
            {title.lead && (
              <span className="pgs-title-lead pgs-rise" style={{ animationDelay: '0.3s' }}>
                <span className="pgs-title-rule" aria-hidden="true" />
                {title.lead}
                <span className="pgs-title-rule" aria-hidden="true" />
              </span>
            )}
            <span className="pgs-title-main pgs-foil pgs-rise" style={{ animationDelay: '0.42s' }}>
              {title.main}
            </span>
            {title.edition && (
              <span className="pgs-title-edition pgs-rise" style={{ animationDelay: '0.56s' }}>
                {title.edition}
              </span>
            )}
          </h1>
          <p className="pgs-tagline pgs-rise" style={{ animationDelay: '0.66s' }}>
            {project.tagline ?? CONFIG.heroBajada}
          </p>
          {(closesLabel || gala) && (
            <p className="pgs-hero-meta pgs-rise" style={{ animationDelay: '0.76s' }}>
              {closesLabel && (
                <span>
                  <Calendar className="pgs-inline-icon" />
                  Postulaciones hasta el {closesLabel}
                </span>
              )}
              {gala && (
                <span>
                  <Crown className="pgs-inline-icon" />
                  Gala · {gala.short}
                  {project.venueName && <span className="pgs-lg"> · {project.venueName}</span>}
                </span>
              )}
            </p>
          )}
          {countdown && (
            <div className="cand-countdown pgs-rise" style={{ animationDelay: '0.86s' }}>
              <p className="cand-countdown-label">Las postulaciones cierran en</p>
              <div className="pgs-countdown" role="timer" aria-label="Tiempo para el cierre de postulaciones">
                {(
                  [
                    ['Días', 'Días', countdown.days],
                    ['Horas', 'Hrs', countdown.hours],
                    ['Minutos', 'Min', countdown.minutes],
                    ['Segundos', 'Seg', countdown.seconds],
                  ] as const
                ).map(([label, short, value]) => (
                  <div key={label} className="pgs-count">
                    <span className="pgs-count-value">{pad(value)}</span>
                    <span className="pgs-count-label">
                      <span className="pgs-lg">{label}</span>
                      <span className="pgs-sm">{short}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="pgs-hero-ctas pgs-rise" style={{ animationDelay: '0.96s' }}>
            <a className="pgs-btn is-gold" href="#formulario">
              <span>Quiero postular</span>
              <Arrow className="pgs-btn-icon" />
            </a>
            <a className="pgs-btn is-ghost" href="#requisitos">
              <span>Ver requisitos</span>
            </a>
          </div>
          <p className="pgs-hero-note pgs-rise" style={{ animationDelay: '1.05s' }}>
            Postulación en línea · Folio al instante
          </p>
        </div>
        <a className="pgs-scroll-cue" href="#convocatoria" aria-label="Bajar a la convocatoria">
          <span />
        </a>
      </section>

      {/* ── Cinta ──────────────────────────────────────────────────────── */}
      <div className="pgs-ribbon" aria-hidden="true">
        <div className="pgs-ribbon-track">
          {[0, 1].map((copy) => (
            <span key={copy} className="pgs-ribbon-group">
              {[...RIBBON_ITEMS, ...RIBBON_ITEMS].map((item, i) => (
                <span key={`${item}-${i}`} className="pgs-ribbon-item">
                  <Diamond className="pgs-ribbon-diamond" />
                  {item}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <main>
        {/* ── La convocatoria ────────────────────────────────────────────── */}
        <section id="convocatoria" className="pgs-section is-paper" aria-labelledby="cand-about-title">
          <div className="pgs-wrap pgs-about">
            <div className="pgs-about-head" data-reveal>
              <Kicker index="01" tone="paper">
                La convocatoria
              </Kicker>
              <h2 id="cand-about-title" className="pgs-h2 is-ink">
                Más que una corona, <em>una plataforma</em>
              </h2>
            </div>
            <div className="pgs-prose" data-reveal>
              <p className="is-lead">
                {project.projectName} busca a la próxima representante de La Araucanía: una mujer con presencia, carácter y una causa que la mueva. No es solo un certamen de
                belleza — es una plataforma para dar voz a proyectos sociales reales durante todo tu reinado.
              </p>
              <blockquote className="cand-quote">Buscamos presencia, carácter y una causa que te mueva. La preparación técnica la entregamos nosotros.</blockquote>
              <p>
                El proceso parte con esta postulación. Con tus datos y fotografías, el equipo organizador hace una primera revisión y cita a una instancia presencial de casting a
                quienes avanzan. Desde ahí, un grupo reducido pasa a ser candidata oficial y se prepara junto al equipo de producción para la gala final.
              </p>
            </div>
          </div>
          <div className="pgs-wrap">
            <dl className="pgs-stats" data-reveal>
              {stats.map((stat) => (
                <div key={stat.label} className="pgs-stat">
                  <dt>{stat.label}</dt>
                  <dd className={stat.word ? 'cand-stat-word' : undefined}>{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── Requisitos ─────────────────────────────────────────────────── */}
        <section id="requisitos" className="pgs-section is-night is-deep" aria-labelledby="cand-req-title">
          <div className="pgs-wrap cand-req">
            <div className="cand-req-head" data-reveal>
              <Kicker index="02">Requisitos</Kicker>
              <h2 id="cand-req-title" className="pgs-h2">
                Lo que necesitas <em>para postular</em>
              </h2>
              <p className="pgs-muted cand-req-text">Revisa que cumplas cada punto antes de empezar. Si tienes una duda, escríbenos: te respondemos antes del cierre.</p>
              {countdown && (
                <div className="pgs-apply-countdown">
                  <p className="pgs-apply-countdown-label">Cierre de postulaciones</p>
                  <p className="pgs-apply-countdown-value">
                    <span>{countdown.days}</span>
                    <small>{countdown.days === 1 ? 'día' : 'días'}</small>
                    <span>{pad(countdown.hours)}</span>
                    <small>hrs</small>
                  </p>
                  {closesLabel && <p className="pgs-apply-countdown-date">Hasta el {closesLabel}</p>}
                </div>
              )}
            </div>
            <ol className="cand-req-list" data-reveal>
              {[
                `Tener ${project.minCandidateAge} años cumplidos, sin edad máxima.`,
                'Nacionalidad chilena o residencia definitiva en Chile.',
                'Residir en la Región de La Araucanía.',
                'Disponibilidad para asistir a ensayos y actividades de preparación.',
                'No registrar condenas por crimen o simple delito.',
              ].map((req, i) => (
                <li key={req}>
                  <span className="cand-req-num">{pad(i + 1)}</span>
                  <span className="cand-req-body">{req}</span>
                  <span className="pgs-check" aria-hidden="true">
                    <Check />
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Cómo inscribirte ───────────────────────────────────────────── */}
        <section id="pasos" className="pgs-section is-paper is-warm" aria-labelledby="cand-steps-title">
          <div className="pgs-wrap">
            <div className="pgs-section-head" data-reveal>
              <Kicker index="03" tone="paper">
                Paso a paso
              </Kicker>
              <h2 id="cand-steps-title" className="pgs-h2 is-ink">
                Cómo <em>inscribirte</em>
              </h2>
            </div>
            <ol className="cand-steps" data-reveal>
              {[
                { t: 'Reúne tu material', d: 'Tus datos y dos fotografías recientes: una de rostro y una de cuerpo entero.' },
                { t: 'Completa el formulario', d: `${FORM_STEPS.length} pasos cortos con tus datos, tu motivación y tu causa social.` },
                { t: 'Recibe tu folio', d: 'Al instante, por pantalla y por correo. Es tu comprobante de postulación.' },
                { t: 'Espera el contacto', d: 'La organización revisa todo y cita a casting presencial a quienes avanzan.' },
              ].map((s, i) => (
                <li key={s.t}>
                  <span className="cand-steps-num">{pad(i + 1)}</span>
                  <span className="cand-steps-title">{s.t}</span>
                  <span className="cand-steps-desc">{s.d}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Preguntas frecuentes ───────────────────────────────────────── */}
        <section id="preguntas" className="pgs-section is-paper" aria-labelledby="cand-faq-title">
          <div className="pgs-wrap pgs-faq">
            <div className="pgs-faq-head" data-reveal>
              <Kicker index="04" tone="paper">
                Dudas
              </Kicker>
              <h2 id="cand-faq-title" className="pgs-h2 is-ink">
                Preguntas <em>frecuentes</em>
              </h2>
              {hasContact && (
                <div className="cand-faq-contact">
                  <p>¿Otra duda? Escríbenos:</p>
                  <ContactLinks contact={contact} />
                </div>
              )}
            </div>
            <div className="pgs-faq-list" data-reveal>
              {FAQ_ITEMS.map((item) => (
                <details key={item.q} className="pgs-faq-item">
                  <summary>
                    {item.q}
                    <Plus className="pgs-faq-icon" />
                  </summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Formulario ─────────────────────────────────────────────────── */}
        <section id="formulario" className="pgs-section is-night is-deep cand-form-section" aria-labelledby="cand-form-title">
          <div className="pgs-wrap">
            <div className="pgs-section-head is-center" data-reveal>
              <Kicker index="05">Postulación</Kicker>
              <h2 id="cand-form-title" className="pgs-h2">
                Tu historia <em>empieza aquí</em>
              </h2>
              <p className="pgs-muted cand-form-lead">Toma unos minutos. Avanzas paso a paso y nada se envía hasta el final.</p>
            </div>
            <div ref={formTopRef} className="cand-form-anchor" />
            <div className="cand-insc-form-card">
              <div className="cand-insc-progress-head">
                <span className="cand-insc-progress-step">
                  Paso {step + 1} de {FORM_STEPS.length}
                </span>
                <span className="cand-insc-progress-name">{FORM_STEPS[step]!.title}</span>
              </div>
              <div className="cand-insc-progress-bar" aria-hidden="true">
                <span style={{ width: `${((step + 1) / FORM_STEPS.length) * 100}%` }} />
              </div>

              <ol className="cand-insc-progress" aria-label="Progreso de la postulación">
                {FORM_STEPS.map((s, i) => (
                  <li key={s.title} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
                    <span className="cand-insc-progress-dot">{i < step ? <Check /> : i + 1}</span>
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
                      hint="JPG, PNG o PDF (el PDF hasta 2,5 MB) — solo si tienes uno para respaldar lo anterior."
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
                        onChange={(e) => toggleDecl('aceptaRequisitos', e.target.checked)}
                      />
                      <span>Declaro que cumplo los requisitos de esta convocatoria y que los datos entregados son verídicos.</span>
                    </label>
                    {errors.aceptaRequisitos && <p className="cand-insc-error">{errors.aceptaRequisitos}</p>}

                    <label className="cand-insc-checkbox" htmlFor="aceptaTratamientoDatos">
                      <input
                        id="aceptaTratamientoDatos"
                        type="checkbox"
                        checked={decl.aceptaTratamientoDatos}
                        onChange={(e) => toggleDecl('aceptaTratamientoDatos', e.target.checked)}
                      />
                      <span>
                        Autorizo el tratamiento de mis datos personales por parte de la organización, conforme a su{' '}
                        <a href={privacyHref} target="_blank" rel="noreferrer">política de privacidad</a>.
                      </span>
                    </label>
                    {errors.aceptaTratamientoDatos && <p className="cand-insc-error">{errors.aceptaTratamientoDatos}</p>}

                    <label className="cand-insc-checkbox" htmlFor="aceptaBases">
                      <input
                        id="aceptaBases"
                        type="checkbox"
                        checked={decl.aceptaBases}
                        onChange={(e) => toggleDecl('aceptaBases', e.target.checked)}
                      />
                      <span>
                        He leído y acepto las{' '}
                        {CONFIG.basesUrl ? (
                          <a href={CONFIG.basesUrl} target="_blank" rel="noreferrer">bases del certamen</a>
                        ) : (
                          'bases del certamen (si aún no las tienes, pídelas a la organización)'
                        )}
                        .
                      </span>
                    </label>
                    {errors.aceptaBases && <p className="cand-insc-error">{errors.aceptaBases}</p>}

                    <label className="cand-insc-checkbox" htmlFor="aceptaMarketing">
                      <input
                        id="aceptaMarketing"
                        type="checkbox"
                        checked={decl.aceptaMarketing}
                        onChange={(e) => toggleDecl('aceptaMarketing', e.target.checked)}
                      />
                      <span>Quiero recibir novedades y comunicaciones del certamen (opcional).</span>
                    </label>
                  </fieldset>
                )}

                {step === FORM_STEPS.length - 1 && (
                  <TurnstileWidget key={turnstileKey} action="candidate-application" onToken={setTurnstileToken} className="flex justify-center py-2" />
                )}

                {errors.form && <p id="form-error" className="cand-insc-error cand-insc-error-form" role="alert">{errors.form}</p>}

                <div className="cand-insc-form-nav">
                  {step > 0 ? (
                    <button type="button" className="cand-insc-btn-ghost" onClick={handleBack} disabled={saving}>
                      Atrás
                    </button>
                  ) : <span />}

                  {step < FORM_STEPS.length - 1 ? (
                    // `key` distinto al de "Enviar": si React reutilizara el mismo <button>, al pasar
                    // al último paso cambiaría a type="submit" dentro del mismo clic y el navegador
                    // enviaría el formulario solo, marcando en rojo las declaraciones sin tocar.
                    <button key="next" type="button" className="cand-insc-submit" onClick={handleNext}>
                      Siguiente
                    </button>
                  ) : (
                    <button key="submit" type="submit" className="cand-insc-submit" disabled={saving || (isTurnstileConfigured && !turnstileToken)}>
                      {saving ? 'Enviando…' : 'Enviar mi postulación'}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </section>
      </main>

      {/* Barra fija en móvil: en un formulario largo el botón queda fuera de pantalla casi todo el recorrido. */}
      <div className={`cand-sticky ${navScrolled ? 'is-visible' : ''}`}>
        <span>
          <strong>{shortName}</strong>
          Postulación gratuita
        </span>
        <a className="pgs-btn is-gold is-small" href="#formulario">
          <span>Postular</span>
        </a>
      </div>

      {/* ── Pie ────────────────────────────────────────────────────────── */}
      <footer className="pgs-footer">
        {contact.instagram && (
          <a className="pgs-follow" href={contact.instagram.href} target="_blank" rel="noopener noreferrer">
            <span className="pgs-follow-label">
              <Instagram className="pgs-inline-icon" />
              Síguenos en Instagram
            </span>
            <span className="pgs-follow-handle">@{contact.instagram.handle}</span>
          </a>
        )}
        <div className="pgs-wrap pgs-footer-grid">
          <div className="pgs-footer-brand">
            <Crown className="pgs-brand-mark" />
            <p className="pgs-footer-name">
              {shortName}
              {title.edition && <span className="pgs-footer-edition">{title.edition}</span>}
            </p>
            <p className="pgs-muted">Convocatoria oficial de postulación</p>
          </div>
          <nav className="pgs-footer-nav" aria-label="Secciones (pie)">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className="pgs-footer-contact">
            {contact.whatsapp && (
              <a href={contact.whatsapp.href} target="_blank" rel="noopener noreferrer">
                <Whatsapp className="pgs-inline-icon" />
                {contact.whatsapp.label}
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`}>
                <Mail className="pgs-inline-icon" />
                {contact.email}
              </a>
            )}
            {CONFIG.basesUrl && (
              <a href={CONFIG.basesUrl} target="_blank" rel="noopener noreferrer">
                Bases del certamen
              </a>
            )}
            <a href={privacyHref} target="_blank" rel="noopener noreferrer">
              Política de privacidad
            </a>
          </div>
        </div>
        <p className="pgs-footer-word" aria-hidden="true">
          {title.main}
        </p>
        <div className="pgs-wrap pgs-footer-legal">
          <p>
            © {title.edition ?? ''} {shortName}
          </p>
          <p>
            <a href={privacyHref}>Privacidad</a>
          </p>
        </div>
      </footer>
    </RegistrationShell>
  );
}

/** Contenedor con la identidad del certamen (mismas fuentes y estilos que su micrositio). */
function RegistrationShell({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <div className={`pgs cand ${PAGEANT_FONT_CLASSES}`} data-accent={accent}>
      <style>{PAGEANT_SITE_STYLES}</style>
      <style>{REGISTRATION_STYLES}</style>
      {children}
    </div>
  );
}

/** Contacto del certamen (configurado en la convocatoria): solo los canales que existen. */
function ContactLinks({ contact }: { contact: RegistrationProjectInfo['contact'] }) {
  return (
    <span className="cand-contact">
      {contact.whatsapp && (
        <a href={contact.whatsapp.href} target="_blank" rel="noreferrer">
          <Whatsapp className="pgs-inline-icon" /> WhatsApp
        </a>
      )}
      {contact.email && (
        <a href={`mailto:${contact.email}`}>
          <Mail className="pgs-inline-icon" /> {contact.email}
        </a>
      )}
      {contact.instagram && (
        <a href={contact.instagram.href} target="_blank" rel="noreferrer">
          <Instagram className="pgs-inline-icon" /> @{contact.instagram.handle}
        </a>
      )}
    </span>
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
  const [processing, setProcessing] = useState(false);
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

  async function pickFile(f: File | undefined | null) {
    // El mismo archivo elegido otra vez (tras "Quitar") no dispara `change`
    // si el input conserva su valor: se limpia siempre.
    if (inputRef.current) inputRef.current.value = '';
    if (!f) return;
    const allowed = accept.split(',').map((t) => t.trim());
    if (!allowed.includes(f.type)) {
      setLocalError(accept.includes('pdf') ? 'El archivo debe ser JPG, PNG o PDF.' : 'El archivo debe ser JPG o PNG.');
      return;
    }
    if (f.type === 'application/pdf') {
      if (f.size > MAX_PDF_BYTES) {
        setLocalError('El PDF supera los 2,5 MB. Sube una foto del documento (JPG) en su lugar.');
        return;
      }
      setLocalError(null);
      onChange(f);
      return;
    }
    if (f.size > MAX_ORIGINAL_PHOTO_BYTES) {
      setLocalError('La foto es demasiado grande. Elige otra o tómala con menor resolución.');
      return;
    }
    // Las fotos se reducen acá (lado mayor 1.600 px) para que la postulación
    // quepa en el límite de Vercel; la calidad sigue siendo de sobra para casting.
    setProcessing(true);
    const compressed = await compressPhoto(f);
    setProcessing(false);
    if (compressed.size > MAX_PHOTO_BYTES) {
      setLocalError('No pudimos reducir esta foto lo suficiente. Prueba con otra en JPG.');
      return;
    }
    setLocalError(null);
    onChange(compressed);
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
          void pickFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            // Sin esto, Espacio además hace scroll de la página.
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          className="cand-insc-dropzone-input"
          tabIndex={-1}
          onChange={(e) => void pickFile(e.target.files?.[0])}
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
            <p>{processing ? 'Preparando la foto…' : 'Arrastra tu archivo aquí o haz clic para elegirlo'}</p>
            <p className="cand-insc-hint">{hint}</p>
          </div>
        )}
      </div>
      {shownError && <p className="cand-insc-error" role="alert">{shownError}</p>}
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
      {error && <p className="cand-insc-error" role="alert">{error}</p>}
    </div>
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

