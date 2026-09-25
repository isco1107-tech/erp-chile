import type { ReactNode } from 'react';

/**
 * Pantallas del módulo de certámenes dibujadas en SVG, con datos de EJEMPLO,
 * para la galería de la landing. Siguen la estructura y los textos de las
 * pantallas reales (tablero de casting y acreditación, modo show de la
 * escaleta, resultados del jurado) con la misma identidad del panel. No son
 * capturas: el entorno local usa la base de producción y una captura real
 * mostraría candidatas y personas reales. Las personas y cifras son
 * ficticias y la landing lo rotula.
 *
 * Formato vertical 4:5, el del marco de la galería.
 */

export type EventMockView = 'casting' | 'show' | 'judging';

const W = 480;
const H = 600;
const FONT = 'var(--font-sans), ui-sans-serif, system-ui, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const C = {
  ink: '#12161f',
  inkSoft: '#1b2130',
  inkLine: '#2a3040',
  paper: '#f4f1ea',
  gold: '#dbc076',
  goldSoft: '#faf5e6',
  goldText: '#7a5d1c',
  bg: '#f7f6f3',
  card: '#ffffff',
  border: '#e7e5df',
  muted: '#65676e',
  faint: '#9a9ca3',
  blue: '#334d85',
  blueSoft: '#eef2fa',
  green: '#067647',
  greenSoft: '#ecfdf3',
  amber: '#b54708',
  amberSoft: '#fffaeb',
  red: '#d92d20',
  violet: '#6941c6',
  violetSoft: '#f4f3ff',
};

function T({ x, y, children, size = 11, weight = 400, fill = C.ink, anchor = 'start', mono = false }: {
  x: number;
  y: number;
  children: ReactNode;
  size?: number;
  weight?: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  mono?: boolean;
}) {
  return <text x={x} y={y} fontSize={size} fontWeight={weight} fill={fill} textAnchor={anchor} fontFamily={mono ? MONO : FONT}>{children}</text>;
}

type Tone = 'green' | 'amber' | 'blue' | 'violet' | 'gray' | 'gold';

const TONES: Record<Tone, [string, string]> = {
  green: [C.greenSoft, C.green],
  amber: [C.amberSoft, C.amber],
  blue: [C.blueSoft, C.blue],
  violet: [C.violetSoft, C.violet],
  gray: ['#f1f0ec', C.muted],
  gold: [C.goldSoft, C.goldText],
};

function Badge({ x, y, label, tone, anchor = 'start' }: { x: number; y: number; label: string; tone: Tone; anchor?: 'start' | 'end' }) {
  const width = label.length * 5.6 + 14;
  const left = anchor === 'end' ? x - width : x;
  const [background, color] = TONES[tone];
  return (
    <g>
      <rect x={left} y={y} width={width} height={17} rx={8.5} fill={background} />
      <T x={left + width / 2} y={y + 12} size={9.5} weight={600} fill={color} anchor="middle">{label}</T>
    </g>
  );
}

function Avatar({ x, y, name, r = 13 }: { x: number; y: number; name: string; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={C.goldSoft} stroke={C.border} />
      <T x={x} y={y + 4} size={r * 0.8} weight={700} fill={C.goldText} anchor="middle">{name.charAt(0)}</T>
    </g>
  );
}

/** Barra superior del panel: título de la pantalla y selector del certamen. */
function TopBar({ title }: { title: string }) {
  return (
    <g>
      <rect width={W} height={48} fill={C.card} />
      <line x1={0} y1={48} x2={W} y2={48} stroke={C.border} />
      <rect x={16} y={17} width={3} height={14} rx={1.5} fill={C.gold} />
      <T x={26} y={29} size={14} weight={700}>{title}</T>
      <rect x={W - 186} y={12} width={170} height={24} rx={6} fill={C.bg} stroke={C.border} />
      <T x={W - 176} y={28} size={10} fill={C.muted}>Reina de la Vendimia 2026</T>
      <path d={`M${W - 30} 22 l4 4 l4 -4`} fill="none" stroke={C.faint} strokeWidth={1.4} />
    </g>
  );
}

/* ── 1. Postulación y acreditación ─────────────────────────────────────── */

interface CastingCard { name: string; line: string; contract?: boolean }

const COLUMNS: { title: string; count: number; cards: CastingCard[] }[] = [
  {
    title: 'En revisión',
    count: 4,
    cards: [
      { name: 'Javiera Soto', line: 'Talca · Maule' },
      { name: 'Isidora Vega', line: 'Curicó · Maule' },
      { name: 'Renata Lagos', line: 'Linares · Maule' },
    ],
  },
  {
    title: 'Llamadas a casting',
    count: 6,
    cards: [
      { name: 'Emilia Tapia', line: 'Molina · Maule' },
      { name: 'Trinidad Gómez', line: 'San Javier · Maule' },
      { name: 'Amanda Reyes', line: 'Constitución · Maule' },
    ],
  },
  {
    title: 'Candidatas oficiales',
    count: 12,
    cards: [
      { name: 'Martina Silva', line: 'N° 4 · Talca', contract: true },
      { name: 'Josefa Muñoz', line: 'N° 7 · Curicó', contract: true },
      { name: 'Antonia Rojas', line: 'N° 2 · Linares', contract: true },
    ],
  },
];

const ACCREDITED: { name: string; role: string; level: string; tone: Tone; entry: string | null; checkIn?: boolean }[] = [
  { name: 'Paula Fuentes', role: 'Camarógrafa', level: 'STAFF', tone: 'green', entry: '20:14' },
  { name: 'Diego Contreras', role: 'Maquillaje', level: 'BACKSTAGE', tone: 'blue', entry: '20:31' },
  { name: 'Carla Méndez', role: 'Prensa', level: 'GENERAL', tone: 'gray', entry: null, checkIn: true },
  { name: 'Tomás Herrera', role: 'Invitado auspiciador', level: 'VIP', tone: 'violet', entry: null },
];

function CastingView() {
  const columnWidth = 146;
  return (
    <g>
      <rect width={W} height={H} fill={C.bg} />
      <TopBar title="Tablero de casting" />
      <rect x={16} y={62} width={292} height={26} rx={6} fill={C.card} stroke={C.border} />
      <circle cx={30} cy={75} r={4.5} fill="none" stroke={C.faint} strokeWidth={1.3} />
      <T x={42} y={79} size={10} fill={C.faint}>Buscar por nombre, comuna, folio…</T>
      <rect x={318} y={62} width={146} height={26} rx={6} fill={C.ink} />
      <T x={391} y={79} size={10.5} weight={600} fill={C.paper} anchor="middle">Numerar oficiales</T>

      {COLUMNS.map((column, index) => {
        const x = 16 + index * (columnWidth + 6);
        return (
          <g key={column.title}>
            <rect x={x} y={100} width={columnWidth} height={250} rx={10} fill="#efede7" />
            <T x={x + 10} y={119} size={10.5} weight={700}>{column.title}</T>
            <T x={x + columnWidth - 10} y={119} size={10} weight={600} fill={C.faint} anchor="end">{column.count}</T>
            {column.cards.map((card, row) => {
              const y = 128 + row * 72;
              return (
                <g key={card.name}>
                  <rect x={x + 6} y={y} width={columnWidth - 12} height={64} rx={8} fill={C.card} stroke={C.border} />
                  <Avatar x={x + 24} y={y + 20} name={card.name} r={11} />
                  <T x={x + 41} y={y + 18} size={10.5} weight={700}>{card.name}</T>
                  <T x={x + 41} y={y + 31} size={9.5} fill={card.line.startsWith('N°') ? C.goldText : C.muted} weight={card.line.startsWith('N°') ? 600 : 400}>{card.line}</T>
                  {card.contract ? <Badge x={x + 14} y={y + 40} label="✓ Contrato" tone="green" /> : <Badge x={x + 14} y={y + 40} label="Ficha interna" tone="gray" />}
                </g>
              );
            })}
          </g>
        );
      })}

      <rect x={16} y={364} width={448} height={220} rx={12} fill={C.card} stroke={C.border} />
      <T x={30} y={388} size={13} weight={700}>Acreditación</T>
      <T x={450} y={388} size={10} fill={C.muted} anchor="end">32 acreditados · 27 con ingreso</T>
      <line x1={30} y1={400} x2={450} y2={400} stroke={C.border} />
      <T x={30} y={416} size={9.5} weight={600} fill={C.faint}>Nombre</T>
      <T x={262} y={416} size={9.5} weight={600} fill={C.faint}>Nivel</T>
      <T x={450} y={416} size={9.5} weight={600} fill={C.faint} anchor="end">Ingreso</T>
      {ACCREDITED.map((person, row) => {
        const y = 426 + row * 38;
        return (
          <g key={person.name}>
            <line x1={30} y1={y} x2={450} y2={y} stroke={C.border} />
            <T x={30} y={y + 17} size={11} weight={600}>{person.name}</T>
            <T x={30} y={y + 30} size={9.5} fill={C.muted}>{person.role}</T>
            <Badge x={262} y={y + 11} label={person.level} tone={person.tone} />
            {person.entry && <T x={450} y={y + 23} size={11} weight={600} fill={C.green} anchor="end" mono>{person.entry}</T>}
            {person.checkIn && (
              <g>
                <rect x={384} y={y + 9} width={66} height={22} rx={6} fill={C.ink} />
                <T x={417} y={y + 24} size={10} weight={600} fill={C.paper} anchor="middle">Check-in</T>
              </g>
            )}
            {!person.entry && !person.checkIn && <T x={450} y={y + 23} size={10} fill={C.faint} anchor="end">Sin ingreso</T>}
          </g>
        );
      })}
    </g>
  );
}

/* ── 2. Escaleta: modo show en vivo ────────────────────────────────────── */

const LATER = [
  ['21:53', 'Número artístico', 'NÚMERO ARTÍSTICO · 7 min'],
  ['22:00', 'Saludo de auspiciadores', 'MENCIÓN DE AUSPICIADOR · 3 min'],
  ['22:03', 'Desfile en traje típico', 'TRAJE TÍPICO / FANTASÍA · 10 min'],
] as const;

function ShowView() {
  return (
    <g>
      <rect width={W} height={H} fill={C.ink} />
      <T x={20} y={30} size={9.5} weight={600} fill="#8d93a0">MODO SHOW · GALA REINA DE LA VENDIMIA 2026</T>
      <T x={20} y={62} size={28} weight={700} fill={C.paper} mono>21:42:18</T>
      <rect x={176} y={44} width={66} height={20} rx={10} fill="rgb(6 118 71 / .22)" />
      <T x={209} y={58} size={10} weight={700} fill="#6ce9a6" anchor="middle">A tiempo</T>
      <T x={20} y={84} size={10} fill="#8d93a0">7/14 bloques · término estimado 23:10</T>
      <rect x={390} y={20} width={70} height={24} rx={6} fill="none" stroke={C.inkLine} />
      <T x={425} y={36} size={10} fill="#b8bcc6" anchor="middle">✕ Salir (Esc)</T>

      <rect x={20} y={100} width={440} height={262} rx={12} fill={C.inkSoft} stroke={C.inkLine} />
      <circle cx={38} cy={121} r={4.5} fill={C.red} />
      <T x={50} y={125} size={10.5} weight={800} fill="#ff8a80">AL AIRE</T>
      <rect x={34} y={134} width={4} height={14} rx={2} fill={C.gold} />
      <T x={44} y={145} size={9.5} weight={600} fill="#b8bcc6">#7 · TRAJE DE GALA · Pie: Conductora</T>
      <T x={34} y={178} size={23} weight={700} fill={C.paper}>Desfile en traje de gala</T>
      <T x={34} y={202} size={14} weight={600} fill={C.gold}>N° 4 · Martina Silva</T>
      <T x={34} y={266} size={58} weight={700} fill={C.paper} mono>03:12</T>
      <rect x={34} y={280} width={412} height={6} rx={3} fill={C.inkLine} />
      <rect x={34} y={280} width={412 * 0.53} height={6} rx={3} fill={C.gold} />
      <T x={34} y={302} size={9.5} fill="#8d93a0">Duración planificada 6 min · partió 21:39</T>
      {([['AUDIO', 'Tema de gala'], ['LUCES', 'Cenital cálido'], ['PANTALLA / CÁMARA', 'Cámara 2']] as const).map(([label, value], index) => (
        <g key={label}>
          <rect x={34 + index * 139} y={314} width={134} height={38} rx={8} fill={C.ink} stroke={C.inkLine} />
          <T x={44 + index * 139} y={329} size={8.5} weight={700} fill="#8d93a0">{label}</T>
          <T x={44 + index * 139} y={344} size={10.5} weight={600} fill={C.paper}>{value}</T>
        </g>
      ))}

      <rect x={20} y={374} width={440} height={82} rx={12} fill={C.inkSoft} stroke={C.inkLine} />
      <T x={34} y={396} size={9.5} weight={700} fill="#8d93a0">SIGUIENTE</T>
      <T x={34} y={413} size={9.5} fill="#b8bcc6">#8 · RONDA DE PREGUNTAS · 21:45 · 8 min</T>
      <T x={34} y={434} size={16} weight={700} fill={C.paper}>Ronda de preguntas</T>
      <T x={34} y={449} size={9.5} fill="#8d93a0">Pie: Jurado</T>

      <rect x={20} y={466} width={440} height={82} rx={12} fill={C.inkSoft} stroke={C.inkLine} />
      <T x={34} y={486} size={9.5} weight={700} fill="#8d93a0">DESPUÉS</T>
      {LATER.map(([time, title, meta], index) => (
        <g key={title}>
          <T x={34} y={504 + index * 17} size={10.5} weight={600} fill={C.paper} mono>{time}</T>
          <T x={76} y={504 + index * 17} size={10.5} fill={C.paper}>{title}</T>
          <T x={446} y={504 + index * 17} size={8.5} fill="#8d93a0" anchor="end">{meta}</T>
        </g>
      ))}

      <rect x={20} y={560} width={300} height={30} rx={8} fill={C.gold} />
      <T x={170} y={579} size={12} weight={700} fill={C.ink} anchor="middle">▶ Siguiente bloque</T>
      <rect x={328} y={560} width={132} height={30} rx={8} fill="none" stroke={C.inkLine} />
      <T x={394} y={579} size={11} weight={600} fill="#b8bcc6" anchor="middle">■ Terminar bloque</T>
    </g>
  );
}

/* ── 3. Escrutinio y coronación ───────────────────────────────────────── */

/** Ponderaciones de las categorías (suman 100 %, como exige el módulo). */
const CATEGORIES = [['Belleza', 0.4], ['Talento', 0.3], ['Oratoria', 0.3]] as const;

const SCORES: { name: string; number: number; scores: [number, number, number] }[] = [
  { name: 'Josefa Muñoz', number: 7, scores: [9.2, 9.3, 9.0] },
  { name: 'Martina Silva', number: 4, scores: [9.4, 9.1, 9.6] },
  { name: 'Florencia Díaz', number: 11, scores: [9.0, 8.7, 9.2] },
  { name: 'Antonia Rojas', number: 2, scores: [8.9, 9.4, 9.1] },
  { name: 'Catalina Pérez', number: 9, scores: [8.6, 9.0, 8.8] },
];

/** Promedio ponderado con las mismas ponderaciones de la tabla. */
export function weightedScore(scores: readonly number[]): number {
  return CATEGORIES.reduce((sum, [, weight], index) => sum + weight * scores[index], 0);
}

function decimal(value: number, digits: number): string {
  return value.toFixed(digits).replace('.', ',');
}

function JudgingView() {
  const ranking = [...SCORES].sort((a, b) => weightedScore(b.scores) - weightedScore(a.scores));
  const columns = [212, 268, 324];
  return (
    <g>
      <rect width={W} height={H} fill={C.bg} />
      <TopBar title="Jurado y escrutinio" />
      <rect x={16} y={62} width={448} height={96} rx={12} fill={C.card} stroke={C.border} />
      <T x={30} y={86} size={13} weight={700}>Ronda 3: Final</T>
      <Badge x={450} y={73} label="Votación finalizada" tone="blue" anchor="end" />
      <T x={30} y={106} size={10} fill={C.muted}>15 de 15 puntajes enviados · 3 jurados</T>
      <rect x={30} y={114} width={420} height={5} rx={2.5} fill={C.greenSoft} />
      <rect x={30} y={114} width={420} height={5} rx={2.5} fill={C.green} />
      {CATEGORIES.map(([name, weight], index) => (
        <Badge key={name} x={30 + index * 100} y={130} label={`${name} ${Math.round(weight * 100)} %`} tone="gold" />
      ))}

      <rect x={16} y={170} width={448} height={372} rx={12} fill={C.card} stroke={C.border} />
      <T x={30} y={194} size={13} weight={700}>Resultados</T>
      <T x={30} y={218} size={9.5} weight={600} fill={C.faint}>Pos.</T>
      <T x={62} y={218} size={9.5} weight={600} fill={C.faint}>Candidata</T>
      {CATEGORIES.map(([name], index) => <T key={name} x={columns[index]} y={218} size={9.5} weight={600} fill={C.faint} anchor="middle">{name}</T>)}
      <T x={450} y={218} size={9.5} weight={600} fill={C.faint} anchor="end">Promedio</T>
      {ranking.map((row, index) => {
        const y = 228 + index * 58;
        const winner = index === 0;
        return (
          <g key={row.name}>
            {winner ? <rect x={22} y={y} width={436} height={54} rx={8} fill={C.goldSoft} stroke={C.gold} /> : <line x1={30} y1={y} x2={450} y2={y} stroke={C.border} />}
            <T x={38} y={y + 32} size={16} weight={700} fill={winner ? C.goldText : C.muted} anchor="middle">{index + 1}</T>
            <Avatar x={76} y={y + 27} name={row.name} r={12} />
            <T x={94} y={y + 24} size={11} weight={700}>{row.name}</T>
            <T x={94} y={y + 38} size={9.5} fill={C.muted}>N° {row.number}</T>
            {row.scores.map((score, column) => <T key={CATEGORIES[column][0]} x={columns[column]} y={y + 31} size={11} anchor="middle" mono>{decimal(score, 1)}</T>)}
            <T x={450} y={y + (winner ? 25 : 31)} size={12} weight={700} fill={winner ? C.goldText : C.ink} anchor="end" mono>{decimal(weightedScore(row.scores), 2)}</T>
            {winner && <Badge x={450} y={y + 31} label="Ganadora" tone="gold" anchor="end" />}
          </g>
        );
      })}
      <rect x={16} y={556} width={120} height={28} rx={7} fill={C.card} stroke={C.border} />
      <T x={76} y={574} size={10.5} weight={600} anchor="middle">Exportar PDF</T>
      <T x={464} y={574} size={9.5} fill={C.faint} anchor="end">Ronda final: la ganadora sale del escrutinio</T>
    </g>
  );
}

const VIEWS: Record<EventMockView, () => ReactNode> = { casting: CastingView, show: ShowView, judging: JudgingView };

const LABELS: Record<EventMockView, string> = {
  casting: 'Tablero de casting de Aether con postulantes por etapa y la tabla de acreditación con nivel de acceso e ingreso',
  show: 'Modo show de la escaleta en vivo de Aether con el bloque al aire, su temporizador, el siguiente bloque y los que vienen después',
  judging: 'Resultados del jurado en Aether con puntajes por categoría, promedio ponderado y la ganadora de la ronda final',
};

export default function EventMock({ view, className }: { view: EventMockView; className?: string }) {
  const View = VIEWS[view];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${LABELS[view]} (vista ilustrativa con datos de ejemplo)`} className={className} preserveAspectRatio="xMidYMid slice">
      <View />
    </svg>
  );
}
