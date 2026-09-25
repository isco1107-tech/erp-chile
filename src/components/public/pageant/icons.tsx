/**
 * Iconografía del micrositio: trazo fino dorado, coherente con la tiara del
 * hero. Todos decorativos (`aria-hidden`); el texto al lado lleva el sentido.
 */

export function Tiara({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 160 84" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="pgs-tiara-gold" x1="0" y1="0" x2="160" y2="84" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--a-mid)" />
          <stop offset="0.45" stopColor="var(--a-bright)" />
          <stop offset="1" stopColor="var(--a)" />
        </linearGradient>
      </defs>
      <g stroke="url(#pgs-tiara-gold)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path className="pgs-draw" d="M14 70 Q80 54 146 70" />
        <path className="pgs-draw" d="M18 64 Q80 50 142 64" />
        <path className="pgs-draw" d="M20 63 L30 36 L44 56 L58 26 L72 50 L80 14 L88 50 L102 26 L116 56 L130 36 L140 63" />
        <path className="pgs-draw" d="M80 14 L74 6 L80 1 L86 6 Z" />
        <path className="pgs-draw" d="M44 56 Q80 44 116 56" />
      </g>
      <g className="pgs-jewels" fill="url(#pgs-tiara-gold)">
        <circle cx="30" cy="36" r="2.4" />
        <circle cx="58" cy="26" r="2.8" />
        <circle cx="102" cy="26" r="2.8" />
        <circle cx="130" cy="36" r="2.4" />
        <circle cx="80" cy="60" r="3.2" />
        <circle cx="62" cy="61" r="1.6" />
        <circle cx="98" cy="61" r="1.6" />
      </g>
    </svg>
  );
}

export function Diamond({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 0.8 L11.2 6 L6 11.2 L0.8 6 Z" fill="currentColor" />
    </svg>
  );
}

export function Crown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 18h18M4 15l-1-9 5 4 4-6 4 6 5-4-1 9z" />
    </svg>
  );
}

export function Arrow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function Chevron({ className, direction = 'right' }: { className?: string; direction?: 'left' | 'right' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === 'right' ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7'} />
    </svg>
  );
}

export function Plus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function Close({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function Check({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function Calendar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

export function Pin({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7-6.1-7-11.5a7 7 0 1114 0C19 14.9 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

export function Ticket({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8a2 2 0 002-2h14a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H5a2 2 0 00-2-2v-2a2 2 0 000-4z" />
      <path d="M14 6v12" strokeDasharray="2 2" />
    </svg>
  );
}

export function Instagram({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Mail({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M3.5 6l8.5 7 8.5-7" />
    </svg>
  );
}

export function Whatsapp({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20l1.2-3.6A8 8 0 1112 20a8 8 0 01-3.9-1z" />
      <path d="M9 8.6c0 3 2.4 5.9 5.6 6.4l1-1.3-1.7-.9-.8.8c-1-.5-2.2-1.6-2.6-2.6l.8-.8-.9-1.7z" strokeWidth="1.2" />
    </svg>
  );
}
