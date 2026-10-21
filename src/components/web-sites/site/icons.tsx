import {
  Award,
  Briefcase,
  Calendar,
  Camera,
  Car,
  Check,
  Clock,
  Code,
  Coffee,
  CreditCard,
  Gift,
  Globe,
  GraduationCap,
  Hammer,
  Heart,
  House,
  Leaf,
  Lock,
  Mail,
  MapPin,
  Music,
  Palette,
  Phone,
  Rocket,
  Scissors,
  Shield,
  ShoppingBag,
  Smile,
  Sparkles,
  Star,
  Stethoscope,
  Sun,
  Target,
  ThumbsUp,
  TrendingUp,
  Truck,
  Users,
  Utensils,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { SiteIcon } from '@/lib/web-sites/icons';
import type { SocialNetwork } from '@/lib/web-sites/urls';

/**
 * Íconos de las tarjetas: el sitio guarda solo un nombre de la lista cerrada
 * `SITE_ICONS`; acá se traduce a un componente de lucide-react (importado por
 * nombre para que el empaquetado deje fuera los que no se usan). `Record`
 * exige que cada nombre de la lista tenga su ícono.
 */
const ICONS: Record<SiteIcon, LucideIcon> = {
  check: Check,
  star: Star,
  heart: Heart,
  shield: Shield,
  truck: Truck,
  clock: Clock,
  phone: Phone,
  mail: Mail,
  'map-pin': MapPin,
  zap: Zap,
  award: Award,
  users: Users,
  smile: Smile,
  'thumbs-up': ThumbsUp,
  leaf: Leaf,
  sun: Sun,
  wrench: Wrench,
  hammer: Hammer,
  scissors: Scissors,
  camera: Camera,
  music: Music,
  coffee: Coffee,
  'shopping-bag': ShoppingBag,
  'credit-card': CreditCard,
  gift: Gift,
  sparkles: Sparkles,
  rocket: Rocket,
  target: Target,
  'trending-up': TrendingUp,
  home: House,
  car: Car,
  briefcase: Briefcase,
  'graduation-cap': GraduationCap,
  stethoscope: Stethoscope,
  utensils: Utensils,
  palette: Palette,
  code: Code,
  globe: Globe,
  calendar: Calendar,
  lock: Lock,
};

export function SiteIconView({ name, className }: { name: string; className?: string }) {
  const Icon = (ICONS as Record<string, LucideIcon | undefined>)[name];
  if (!Icon) return null;
  return <Icon className={className} aria-hidden="true" strokeWidth={1.75} />;
}

/**
 * Logotipos de redes en trazo simple (lucide dejó de traer marcas). Son
 * decorativos: el enlace que los contiene lleva el nombre de la red.
 */
const SOCIAL_PATHS: Record<SocialNetwork, ReactPaths> = {
  instagram: [
    { kind: 'rect', x: 3, y: 3, width: 18, height: 18, rx: 5 },
    { kind: 'circle', cx: 12, cy: 12, r: 4 },
    { kind: 'path', d: 'M17.5 6.5h.01' },
  ],
  facebook: [{ kind: 'path', d: 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z' }],
  tiktok: [{ kind: 'path', d: 'M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5' }],
  youtube: [
    { kind: 'path', d: 'M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17' },
    { kind: 'path', d: 'm10 15 5-3-5-3z' },
  ],
  linkedin: [
    { kind: 'path', d: 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z' },
    { kind: 'rect', x: 2, y: 9, width: 4, height: 12 },
    { kind: 'circle', cx: 4, cy: 4, r: 2 },
  ],
  x: [{ kind: 'path', d: 'M4 4l11.733 16h4.267l-11.733-16z' }, { kind: 'path', d: 'M4 20l6.768-6.768m2.46-2.46l6.772-6.772' }],
};

type ReactPaths = (
  | { kind: 'path'; d: string }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx?: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
)[];

export function SocialIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" focusable="false">
      {SOCIAL_PATHS[network].map((shape, index) => {
        if (shape.kind === 'path') return <path key={index} d={shape.d} />;
        if (shape.kind === 'rect') return <rect key={index} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} />;
        return <circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} />;
      })}
    </svg>
  );
}
