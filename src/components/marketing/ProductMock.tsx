import type { ReactNode } from 'react';

/**
 * Vistas del producto dibujadas en SVG, con datos de EJEMPLO.
 *
 * Reemplazan a las capturas del entorno de demostración, que mostraban un
 * panel vacío ($0, 0,0 %, "Sin documentos este mes") justo donde un
 * comprador decide si el producto vale la pena. Se dibujan con la misma
 * estructura y la misma identidad visual del panel real (barra lateral en
 * tinta, acento dorado, tarjetas blancas) y escalan nítidas a cualquier
 * tamaño. Las empresas y cifras son ficticias y la leyenda de cada vista lo
 * dice: no es una captura, y no se presenta como tal.
 */

export type ProductMockView = 'dashboard' | 'sales' | 'inventory' | 'treasury' | 'projects';

const W = 1200;
const H = 750;
const SIDEBAR = 214;
const TOPBAR = 54;

const C = {
  ink: '#12161f',
  sidebar: '#10131a',
  sidebarText: '#a3a7b0',
  gold: '#dbc076',
  goldDeep: '#c9a24a',
  goldSoft: '#faf5e6',
  goldText: '#7a5d1c',
  bg: '#f7f6f3',
  card: '#ffffff',
  border: '#e7e5df',
  muted: '#65676e',
  faint: '#9a9ca3',
  blue: '#334d85',
  green: '#067647',
  greenSoft: '#ecfdf3',
  amber: '#b54708',
  amberSoft: '#fffaeb',
  red: '#b42318',
  redSoft: '#fef3f2',
};

const FONT = 'var(--font-sans), ui-sans-serif, system-ui, sans-serif';

function T({
  x,
  y,
  children,
  size = 12,
  weight = 400,
  fill = C.ink,
  anchor = 'start',
}: {
  x: number;
  y: number;
  children: ReactNode;
  size?: number;
  weight?: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
}) {
  return (
    <text x={x} y={y} fontSize={size} fontWeight={weight} fill={fill} textAnchor={anchor} fontFamily={FONT}>
      {children}
    </text>
  );
}

function Card({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={12} fill={C.card} stroke={C.border} />;
}

function Badge({ x, y, label, tone }: { x: number; y: number; label: string; tone: 'green' | 'amber' | 'red' | 'gray' | 'gold' }) {
  const palette = {
    green: [C.greenSoft, C.green],
    amber: [C.amberSoft, C.amber],
    red: [C.redSoft, C.red],
    gray: ['#f1f0ec', C.muted],
    gold: [C.goldSoft, C.goldText],
  }[tone];
  const width = label.length * 6.2 + 18;
  return (
    <g>
      <rect x={x} y={y - 13} width={width} height={19} rx={9.5} fill={palette[0]} />
      <T x={x + width / 2} y={y} size={10.5} weight={600} fill={palette[1]} anchor="middle">
        {label}
      </T>
    </g>
  );
}

const NAV: { label: string; view?: ProductMockView; group?: string }[] = [
  { group: 'Principal', label: 'Inicio', view: 'dashboard' },
  { label: 'Punto de Venta' },
  { group: 'Inventario', label: 'Catálogo de Productos' },
  { label: 'Inventario', view: 'inventory' },
  { group: 'Ventas', label: 'Ventas & Facturación', view: 'sales' },
  { label: 'Clientes & Proveedores' },
  { group: 'Finanzas', label: 'Cuentas por Cobrar', view: 'treasury' },
  { label: 'Cuentas por Pagar' },
  { label: 'Flujo de Caja' },
  { label: 'Formulario 29 (F29)' },
  { group: 'Producción de Eventos', label: 'Eventos & Proyectos', view: 'projects' },
  { label: 'Escaleta en Vivo' },
];

function Shell({ view, children }: { view: ProductMockView; children: ReactNode }) {
  let y = 118;
  return (
    <>
      <rect width={W} height={H} fill={C.bg} />
      {/* Barra lateral */}
      <rect width={SIDEBAR} height={H} fill={C.sidebar} />
      <g>
        <path d="M34 30 L40 18 L46 30 Z" fill={C.gold} />
        <circle cx={40} cy={34} r={2.2} fill={C.gold} />
        <T x={56} y={31} size={13.5} weight={600} fill="#ffffff">
          Comercial Los Andes
        </T>
        <T x={56} y={46} size={10.5} fill={C.sidebarText}>
          Aether ERP
        </T>
      </g>
      <rect x={16} y={64} width={SIDEBAR - 32} height={34} rx={9} fill="#ffffff0d" />
      <circle cx={34} cy={81} r={9} fill="#ffffff1a" />
      <T x={50} y={85} size={11} fill="#ffffff">
        Plan Empresa · 2 bodegas
      </T>
      {NAV.map((item) => {
        const nodes: ReactNode[] = [];
        if (item.group) {
          y += 16;
          nodes.push(
            <T key={`g-${item.group}`} x={24} y={y} size={9} weight={600} fill="#a3a7b099">
              {item.group.toUpperCase()}
            </T>
          );
          y += 12;
        }
        const active = item.view === view;
        nodes.push(
          <g key={item.label}>
            {active && <rect x={14} y={y - 2} width={SIDEBAR - 28} height={28} rx={8} fill="#ffffff0f" />}
            {active && <rect x={14} y={y - 2} width={3} height={28} rx={1.5} fill={C.gold} />}
            <rect x={28} y={y + 7} width={12} height={10} rx={3} fill="none" stroke={active ? C.gold : C.sidebarText} strokeWidth={1.4} />
            <T x={50} y={y + 16} size={11.5} weight={active ? 600 : 400} fill={active ? '#ffffff' : C.sidebarText}>
              {item.label}
            </T>
          </g>
        );
        y += 30;
        return nodes;
      })}
      {/* Barra superior */}
      <rect x={SIDEBAR} width={W - SIDEBAR} height={TOPBAR} fill="#ffffff" />
      <line x1={SIDEBAR} x2={W} y1={TOPBAR} y2={TOPBAR} stroke={C.border} />
      <rect x={SIDEBAR + 24} y={13} width={300} height={28} rx={8} fill="#f1f0ec" />
      <circle cx={SIDEBAR + 40} cy={27} r={5} fill="none" stroke={C.faint} strokeWidth={1.5} />
      <T x={SIDEBAR + 54} y={31} size={11} fill={C.faint}>
        Buscar clientes, productos, módulos…
      </T>
      <circle cx={W - 186} cy={27} r={12} fill="#f1f0ec" />
      <circle cx={W - 179} cy={19} r={4.5} fill={C.red} />
      <circle cx={W - 150} cy={27} r={13} fill={C.goldSoft} />
      <T x={W - 150} y={31} size={10} weight={600} fill={C.goldText} anchor="middle">
        MG
      </T>
      <T x={W - 130} y={31} size={11.5} fill={C.muted}>
        María González
      </T>
      <g transform={`translate(${SIDEBAR + 28}, ${TOPBAR + 26})`}>{children}</g>
    </>
  );
}

const CONTENT_W = W - SIDEBAR - 56;

function Kpi({ x, label, value, trend, tone = 'green' }: { x: number; label: string; value: string; trend?: string; tone?: 'green' | 'red' | 'gray' }) {
  const w = (CONTENT_W - 36) / 4;
  return (
    <g>
      <Card x={x} y={40} w={w} h={98} />
      <T x={x + 16} y={66} size={11} fill={C.muted}>
        {label}
      </T>
      <T x={x + 16} y={99} size={22} weight={700}>
        {value}
      </T>
      {trend && <Badge x={x + 16} y={124} label={trend} tone={tone} />}
      {trend && (
        <T x={x + 16 + trend.length * 6.2 + 26} y={124} size={10} fill={C.faint}>
          vs. mes anterior
        </T>
      )}
    </g>
  );
}

function Title({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <g>
      <T x={0} y={4} size={20} weight={600}>
        {title}
      </T>
      <T x={0} y={24} size={11.5} fill={C.muted}>
        {subtitle}
      </T>
    </g>
  );
}

const SALES_12M = [31, 34, 29, 38, 36, 41, 39, 44, 42, 46, 43, 48.3];
const COST_12M = [21, 23, 20, 25, 24, 27, 26, 29, 27, 30, 28, 31.5];
const MONTHS = ['oct', 'nov', 'dic', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep'];

function DashboardView() {
  const colW = (CONTENT_W - 36) / 4 + 12;
  const chartX = 0;
  const chartY = 154;
  const chartW = CONTENT_W * 0.64;
  const chartH = 250;
  const plotX = chartX + 40;
  const plotY = chartY + 58;
  const plotW = chartW - 60;
  const plotH = 150;
  const max = 52;
  const step = plotW / SALES_12M.length;
  const costPath = COST_12M.map((v, i) => `${i === 0 ? 'M' : 'L'}${plotX + step * i + step / 2} ${plotY + plotH - (v / max) * plotH}`).join(' ');
  const donutX = chartW + 16;
  const donutW = CONTENT_W - chartW - 16;
  const mix = [
    { label: 'Boletas', value: 62, color: C.goldDeep },
    { label: 'Facturas', value: 31, color: C.blue },
    { label: 'Notas de crédito', value: 7, color: '#5f9f86' },
  ];
  let angle = -90;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  return (
    <>
      <Title title="Buenos días, María" subtitle="Comercial Los Andes SpA · septiembre 2026" />
      <Kpi x={0} label="Ventas netas del mes" value="$48.260.400" trend="+12,4%" />
      <Kpi x={colW} label="IVA débito del mes" value="$9.169.476" />
      <Kpi x={colW * 2} label="Margen PMP del mes" value="34,8%" trend="+2,1 pp" />
      <Kpi x={colW * 3} label="Valor de bodega" value="$126.540.900" trend="-3,2%" tone="red" />

      <Card x={chartX} y={chartY} w={chartW} h={chartH} />
      <T x={chartX + 18} y={chartY + 26} size={13} weight={600}>
        Ventas vs. costo PMP
      </T>
      <T x={chartX + 18} y={chartY + 42} size={10.5} fill={C.muted}>
        Últimos 12 meses · millones de pesos
      </T>
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1={plotX} x2={plotX + plotW} y1={plotY + (plotH / 3) * i} y2={plotY + (plotH / 3) * i} stroke="#efeee9" />
      ))}
      {SALES_12M.map((v, i) => {
        const h = (v / max) * plotH;
        return <rect key={i} x={plotX + step * i + step * 0.22} y={plotY + plotH - h} width={step * 0.56} height={h} rx={3} fill={i === 11 ? C.goldDeep : '#e8d9ab'} />;
      })}
      <path d={costPath} fill="none" stroke={C.blue} strokeWidth={2} />
      {COST_12M.map((v, i) => (
        <circle key={i} cx={plotX + step * i + step / 2} cy={plotY + plotH - (v / max) * plotH} r={2.5} fill={C.blue} />
      ))}
      {MONTHS.map((m, i) => (
        <T key={m} x={plotX + step * i + step / 2} y={plotY + plotH + 18} size={9.5} fill={C.faint} anchor="middle">
          {m}
        </T>
      ))}
      <rect x={chartX + 18} y={chartY + chartH - 22} width={9} height={9} rx={2} fill={C.goldDeep} />
      <T x={chartX + 32} y={chartY + chartH - 14} size={10} fill={C.muted}>
        Ventas netas
      </T>
      <rect x={chartX + 110} y={chartY + chartH - 22} width={9} height={9} rx={2} fill={C.blue} />
      <T x={chartX + 124} y={chartY + chartH - 14} size={10} fill={C.muted}>
        Costo PMP
      </T>

      <Card x={donutX} y={chartY} w={donutW} h={chartH} />
      <T x={donutX + 18} y={chartY + 26} size={13} weight={600}>
        Documentos del mes
      </T>
      <T x={donutX + 18} y={chartY + 42} size={10.5} fill={C.muted}>
        1.284 emitidos
      </T>
      <g transform={`translate(${donutX + donutW / 2}, ${chartY + 128})`}>
        {mix.map((segment) => {
          const length = (segment.value / 100) * circumference;
          const rotation = angle;
          angle += (segment.value / 100) * 360;
          return (
            <circle
              key={segment.label}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={18}
              strokeDasharray={`${length - 2} ${circumference}`}
              transform={`rotate(${rotation})`}
            />
          );
        })}
        <T x={0} y={4} size={18} weight={700} anchor="middle">
          1.284
        </T>
      </g>
      {mix.map((segment, i) => (
        <g key={segment.label}>
          <circle cx={donutX + 24} cy={chartY + 204 + i * 16} r={4} fill={segment.color} />
          <T x={donutX + 34} y={chartY + 208 + i * 16} size={10.5} fill={C.muted}>
            {segment.label}
          </T>
          <T x={donutX + donutW - 18} y={chartY + 208 + i * 16} size={10.5} weight={600} anchor="end">
            {segment.value}%
          </T>
        </g>
      ))}

      <Card x={0} y={chartY + chartH + 16} w={CONTENT_W} h={196} />
      <T x={18} y={chartY + chartH + 42} size={13} weight={600}>
        Requiere tu atención hoy
      </T>
      {[
        ['Folios de boleta por agotarse', 'Quedan 180 folios del CAF vigente', 'amber', 'Cargar CAF'],
        ['3 facturas vencidas de clientes', '$4.812.300 con más de 30 días de atraso', 'red', 'Ver cobranza'],
        ['Stock bajo mínimo en 5 productos', 'Sugerencia de reposición lista para comprar', 'amber', 'Ver productos'],
        ['F29 de agosto listo para revisar', 'Impuesto determinado: $6.214.890', 'green', 'Abrir F29'],
      ].map(([title, detail, tone, cta], i) => {
        const y = chartY + chartH + 66 + i * 34;
        return (
          <g key={title}>
            {i > 0 && <line x1={18} x2={CONTENT_W - 18} y1={y - 12} y2={y - 12} stroke="#efeee9" />}
            <circle cx={26} cy={y + 4} r={4} fill={tone === 'red' ? C.red : tone === 'green' ? C.green : C.amber} />
            <T x={40} y={y + 8} size={11.5} weight={600}>
              {title}
            </T>
            <T x={300} y={y + 8} size={11} fill={C.muted}>
              {detail}
            </T>
            <T x={CONTENT_W - 22} y={y + 8} size={11} weight={600} fill={C.goldText} anchor="end">
              {cta} →
            </T>
          </g>
        );
      })}
    </>
  );
}

function Table({
  y,
  columns,
  rows,
  height,
}: {
  y: number;
  columns: { label: string; x: number; align?: 'start' | 'end' | 'middle' }[];
  rows: ReactNode[][];
  height: number;
}) {
  return (
    <g>
      <Card x={0} y={y} w={CONTENT_W} h={height} />
      <rect x={1} y={y + 1} width={CONTENT_W - 2} height={34} rx={11} fill="#f6f5f1" />
      {columns.map((column) => (
        <T key={column.label} x={column.x} y={y + 22} size={10.5} weight={600} fill={C.muted} anchor={column.align ?? 'start'}>
          {column.label}
        </T>
      ))}
      {rows.map((cells, rowIndex) => {
        const rowY = y + 60 + rowIndex * 38;
        return (
          <g key={rowIndex}>
            {rowIndex > 0 && <line x1={16} x2={CONTENT_W - 16} y1={rowY - 23} y2={rowY - 23} stroke="#efeee9" />}
            {cells.map((cell, cellIndex) => {
              const column = columns[cellIndex];
              if (typeof cell === 'string') {
                return (
                  <T key={cellIndex} x={column.x} y={rowY} size={11.5} anchor={column.align ?? 'start'} weight={cellIndex === 0 ? 600 : 400}>
                    {cell}
                  </T>
                );
              }
              return (
                <g key={cellIndex} transform={`translate(0, ${rowY})`}>
                  {cell}
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

function SalesView() {
  const docs: [string, string, string, string, string, 'green' | 'amber' | 'gray' | 'red'][] = [
    ['N° 18.442', 'Factura electrónica', 'Ferretería El Roble Ltda.', '$3.482.990', 'Pagada', 'green'],
    ['N° 51.207', 'Boleta electrónica', 'Consumidor final', '$24.990', 'Pagada', 'green'],
    ['N° 18.441', 'Factura electrónica', 'Inversiones Maule SpA', '$12.740.000', 'Abono parcial', 'amber'],
    ['N° 18.440', 'Factura electrónica', 'Agrícola San Pedro Ltda.', '$1.905.400', 'Por vencer', 'gray'],
    ['N° 2.113', 'Nota de crédito', 'Comercial Pacífico SpA', '-$214.200', 'Emitida', 'gray'],
    ['N° 18.439', 'Factura electrónica', 'Constructora Valle Alto', '$8.316.750', 'Vencida', 'red'],
    ['N° 51.206', 'Boleta electrónica', 'Consumidor final', '$58.470', 'Pagada', 'green'],
    ['N° 612', 'Guía de despacho', 'Ferretería El Roble Ltda.', '$0', 'Emitida', 'gray'],
    ['N° 18.438', 'Factura electrónica', 'Distribuidora Norte Grande', '$5.120.330', 'Pagada', 'green'],
    ['N° 18.437', 'Factura exenta', 'Fundación Educar Chile', '$960.000', 'Por vencer', 'gray'],
  ];
  const cols = [
    { label: 'Folio', x: 18 },
    { label: 'Tipo', x: 118 },
    { label: 'Cliente', x: 270 },
    { label: 'Timbre SII', x: 520 },
    { label: 'Total', x: 720, align: 'end' as const },
    { label: 'Estado', x: 760 },
  ];
  return (
    <>
      <Title title="Ventas & Facturación" subtitle="Folios del rango autorizado por el SII, timbre electrónico y estado de pago" />
      {['Todas', 'Facturas', 'Boletas', 'Notas de crédito', 'Cotizaciones'].map((chip, i) => {
        const x = [0, 64, 142, 214, 330][i];
        const w = chip.length * 7 + 22;
        return (
          <g key={chip}>
            <rect x={x} y={44} width={w} height={26} rx={13} fill={i === 0 ? C.ink : '#ffffff'} stroke={i === 0 ? C.ink : C.border} />
            <T x={x + w / 2} y={61} size={11} weight={500} fill={i === 0 ? '#ffffff' : C.muted} anchor="middle">
              {chip}
            </T>
          </g>
        );
      })}
      <rect x={CONTENT_W - 118} y={40} width={118} height={32} rx={8} fill={C.ink} />
      <T x={CONTENT_W - 59} y={60} size={11.5} weight={600} fill="#ffffff" anchor="middle">
        + Nueva venta
      </T>
      <Table
        y={88}
        height={478}
        columns={cols}
        rows={docs.map(([folio, tipo, cliente, total, estado, tone]) => [
          folio,
          <T key="t" x={118} y={0} size={11} fill={C.muted}>{tipo}</T>,
          cliente,
          <Badge key="s" x={520} y={0} label="Timbrado" tone="gold" />,
          total,
          <Badge key="e" x={760} y={0} label={estado} tone={tone} />,
        ])}
      />
    </>
  );
}

function InventoryView() {
  const items: [string, string, string, string, string, number][] = [
    ['TAL-0180', 'Taladro percutor 800W', '42', '18', '$38.420,50', 0],
    ['CEM-2510', 'Cemento especial 25 kg', '1.240', '380', '$4.915,00', 0],
    ['PIN-0044', 'Pintura látex blanca 1 gal', '6', '24', '$11.870,25', 2],
    ['TOR-1150', 'Tornillo autoperforante (caja 100)', '315', '90', '$2.340,00', 0],
    ['GUA-0071', 'Guante nitrilo talla M', '9', '40', '$1.120,80', 2],
    ['MAN-0930', 'Manguera jardín 25 m', '27', '12', '$14.690,00', 0],
    ['LIJ-0305', 'Lija al agua N°220', '3', '30', '$410,40', 2],
    ['SIL-0112', 'Silicona transparente 280 ml', '88', '36', '$2.980,00', 1],
  ];
  const cols = [
    { label: 'SKU', x: 18 },
    { label: 'Producto', x: 120 },
    { label: 'Bodega central', x: 470, align: 'end' as const },
    { label: 'Sucursal Talca', x: 600, align: 'end' as const },
    { label: 'Costo PMP', x: 730, align: 'end' as const },
    { label: 'Alerta', x: 770 },
  ];
  return (
    <>
      <Title title="Inventario" subtitle="Existencias por bodega, kardex y costo promedio ponderado al momento de cada salida" />
      <Kpi x={0} label="Valor total de bodega" value="$126.540.900" />
      <Kpi x={(CONTENT_W - 36) / 4 + 12} label="Productos activos" value="1.482" />
      <Kpi x={((CONTENT_W - 36) / 4 + 12) * 2} label="Bajo stock mínimo" value="5" trend="3 críticos" tone="red" />
      <Kpi x={((CONTENT_W - 36) / 4 + 12) * 3} label="Movimientos del mes" value="3.916" />
      <Table
        y={154}
        height={400}
        columns={cols}
        rows={items.map(([sku, name, main, branch, pmp, alert]) => [
            sku,
            <T key="n" x={120} y={0} size={11.5}>{name}</T>,
            <T key="m" x={470} y={0} size={11.5} anchor="end" weight={alert === 2 ? 700 : 400} fill={alert === 2 ? C.red : C.ink}>{main}</T>,
            <T key="b" x={600} y={0} size={11.5} anchor="end">{branch}</T>,
            <T key="p" x={730} y={0} size={11.5} anchor="end">{pmp}</T>,
            alert === 2 ? <Badge key="a" x={770} y={0} label="Bajo mínimo" tone="red" /> : alert === 1 ? <Badge key="a" x={770} y={0} label="Reponer pronto" tone="amber" /> : <Badge key="a" x={770} y={0} label="OK" tone="green" />,
          ])}
      />
    </>
  );
}

function TreasuryView() {
  const buckets = [
    { label: 'Al día', amount: '$21.480.000', pct: 0.52, color: C.green },
    { label: '1–30 días', amount: '$9.912.500', pct: 0.24, color: C.goldDeep },
    { label: '31–60 días', amount: '$5.371.200', pct: 0.13, color: C.amber },
    { label: '61–90 días', amount: '$2.890.000', pct: 0.07, color: '#c2410c' },
    { label: 'Más de 90', amount: '$1.650.300', pct: 0.04, color: C.red },
  ];
  let bx = 18;
  const barW = CONTENT_W - 36;
  const rows: [string, string, string, string, string, 'green' | 'amber' | 'gray' | 'red'][] = [
    ['N° 18.439', 'Constructora Valle Alto', '12-08-2026', '$8.316.750', '41 días de atraso', 'red'],
    ['N° 18.441', 'Inversiones Maule SpA', '30-09-2026', '$6.370.000', 'Abono parcial', 'amber'],
    ['N° 18.440', 'Agrícola San Pedro Ltda.', '05-10-2026', '$1.905.400', 'Por vencer', 'gray'],
    ['N° 18.436', 'Comercial Pacífico SpA', '28-08-2026', '$2.114.980', '25 días de atraso', 'red'],
    ['N° 18.437', 'Fundación Educar Chile', '10-10-2026', '$960.000', 'Por vencer', 'gray'],
  ];
  return (
    <>
      <Title title="Cuentas por Cobrar" subtitle="Cartera por cliente, antigüedad de saldos y recordatorios de pago por correo" />
      <Kpi x={0} label="Total por cobrar" value="$41.304.000" />
      <Kpi x={(CONTENT_W - 36) / 4 + 12} label="Vencido / moroso" value="$9.911.500" trend="-8,6%" tone="green" />
      <Kpi x={((CONTENT_W - 36) / 4 + 12) * 2} label="Cobrado este mes" value="$36.782.110" trend="+15,2%" />
      <Kpi x={((CONTENT_W - 36) / 4 + 12) * 3} label="Días promedio de cobro" value="34 días" trend="-4 días" />
      <Card x={0} y={154} w={CONTENT_W} h={132} />
      <T x={18} y={180} size={13} weight={600}>
        Antigüedad de la cartera
      </T>
      {buckets.map((bucket) => {
        const w = bucket.pct * barW;
        const rect = <rect key={bucket.label} x={bx} y={194} width={w - 2} height={10} rx={3} fill={bucket.color} />;
        bx += w;
        return rect;
      })}
      {buckets.map((bucket, i) => {
        const x = 18 + i * (barW / 5);
        return (
          <g key={`l-${bucket.label}`}>
            <circle cx={x + 4} cy={232} r={4} fill={bucket.color} />
            <T x={x + 14} y={236} size={10.5} fill={C.muted}>
              {bucket.label}
            </T>
            <T x={x} y={260} size={13} weight={700}>
              {bucket.amount}
            </T>
            <T x={x} y={276} size={10} fill={C.faint}>
              {Math.round(bucket.pct * 100)}% de la cartera
            </T>
          </g>
        );
      })}
      <Table
        y={302}
        height={254}
        columns={[
          { label: 'Documento', x: 18 },
          { label: 'Cliente', x: 120 },
          { label: 'Vencimiento', x: 380 },
          { label: 'Saldo', x: 590, align: 'end' },
          { label: 'Estado', x: 630 },
        ]}
        rows={rows.map(([doc, client, due, balance, state, tone]) => [
            doc,
            <T key="c" x={120} y={0} size={11.5}>{client}</T>,
            <T key="d" x={380} y={0} size={11.5} fill={C.muted}>{due}</T>,
            <T key="b" x={590} y={0} size={11.5} weight={700} anchor="end">{balance}</T>,
            <Badge key="s" x={630} y={0} label={state} tone={tone} />,
          ])}
      />
    </>
  );
}

function ProjectsView() {
  const projects = [
    { name: 'Gala Reina de la Vendimia 2026', date: '14 nov · Teatro Regional', budget: 0.68, spent: '$42.180.000', of: '$62.000.000', tone: 'amber' as const, status: 'En producción' },
    { name: 'Festival Costumbrista del Maule', date: '06 dic · Plaza de Armas', budget: 0.41, spent: '$18.450.000', of: '$45.000.000', tone: 'gray' as const, status: 'Planificación' },
    { name: 'Lanzamiento Temporada Verano', date: '21 dic · Hotel Costanera', budget: 0.87, spent: '$23.490.000', of: '$27.000.000', tone: 'red' as const, status: 'Presupuesto al límite' },
  ];
  const run = [
    ['20:00', 'Apertura y bienvenida', 'Conducción', 'green'],
    ['20:12', 'Presentación de candidatas', 'Escenario principal', 'green'],
    ['20:40', 'Número musical invitado', 'Banda en vivo', 'amber'],
    ['21:05', 'Desfile traje de noche', 'Vestuario: 3 cambios', 'gray'],
    ['21:40', 'Votación del jurado', 'Escrutinio en línea', 'gray'],
  ] as const;
  return (
    <>
      <Title title="Eventos & Proyectos" subtitle="Presupuesto, auspicios, entradas y escaleta de cada evento, conectados con la contabilidad" />
      {projects.map((project, i) => {
        const x = i * ((CONTENT_W + 16) / 3);
        const w = (CONTENT_W - 32) / 3;
        return (
          <g key={project.name}>
            <Card x={x} y={40} w={w} h={150} />
            <Badge x={x + 16} y={66} label={project.status} tone={project.tone} />
            <T x={x + 16} y={96} size={13} weight={600}>
              {project.name}
            </T>
            <T x={x + 16} y={114} size={10.5} fill={C.muted}>
              {project.date}
            </T>
            <T x={x + 16} y={144} size={10.5} fill={C.muted}>
              Presupuesto ejecutado
            </T>
            <T x={x + w - 16} y={144} size={10.5} weight={600} anchor="end">
              {Math.round(project.budget * 100)}%
            </T>
            <rect x={x + 16} y={152} width={w - 32} height={7} rx={3.5} fill="#f1f0ec" />
            <rect x={x + 16} y={152} width={(w - 32) * project.budget} height={7} rx={3.5} fill={project.tone === 'red' ? C.red : C.goldDeep} />
            <T x={x + 16} y={178} size={10.5} fill={C.muted}>
              {project.spent} de {project.of}
            </T>
          </g>
        );
      })}
      <Card x={0} y={206} w={CONTENT_W} h={356} />
      <T x={18} y={234} size={13} weight={600}>
        Escaleta en vivo · Gala Reina de la Vendimia
      </T>
      <Badge x={CONTENT_W - 98} y={232} label="● En vivo" tone="red" />
      {run.map(([time, title, detail, tone], i) => {
        const y = 270 + i * 56;
        return (
          <g key={time}>
            <line x1={78} x2={78} y1={y - 16} y2={y + 36} stroke={C.border} strokeWidth={2} />
            <circle cx={78} cy={y} r={7} fill={tone === 'green' ? C.green : tone === 'amber' ? C.goldDeep : '#ffffff'} stroke={tone === 'gray' ? C.border : 'none'} strokeWidth={2} />
            <T x={20} y={y + 4} size={12} weight={600} fill={C.muted}>
              {time}
            </T>
            <T x={100} y={y + 4} size={12.5} weight={600}>
              {title}
            </T>
            <T x={100} y={y + 22} size={10.5} fill={C.muted}>
              {detail}
            </T>
            <T x={CONTENT_W - 22} y={y + 4} size={10.5} weight={600} anchor="end" fill={tone === 'green' ? C.green : tone === 'amber' ? C.goldText : C.faint}>
              {tone === 'green' ? 'Completado' : tone === 'amber' ? 'En curso' : 'Próximo'}
            </T>
          </g>
        );
      })}
    </>
  );
}

const VIEWS: Record<ProductMockView, () => ReactNode> = {
  dashboard: DashboardView,
  sales: SalesView,
  inventory: InventoryView,
  treasury: TreasuryView,
  projects: ProjectsView,
};

const LABELS: Record<ProductMockView, string> = {
  dashboard: 'Panel principal de Aether con indicadores de ventas, margen, bodega y alertas del día',
  sales: 'Historial de ventas de Aether con facturas, boletas y notas de crédito timbradas y su estado de pago',
  inventory: 'Inventario multibodega de Aether con costo PMP y alertas de stock mínimo',
  treasury: 'Cuentas por cobrar de Aether con antigüedad de la cartera y documentos vencidos',
  projects: 'Módulo de eventos de Aether con presupuestos por evento y escaleta en vivo',
};

export default function ProductMock({ view, className }: { view: ProductMockView; className?: string }) {
  const View = VIEWS[view];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${LABELS[view]} (vista ilustrativa con datos de ejemplo)`}
      className={className}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      <Shell view={view}>
        <View />
      </Shell>
    </svg>
  );
}
