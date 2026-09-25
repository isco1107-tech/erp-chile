import { code128Bars, isEncodable } from '@/lib/barcode/code128';

/**
 * Código de barras Code 128 como SVG vectorial: se imprime nítido a cualquier
 * tamaño. Si el texto no es codificable (acentos, Ñ), no dibuja barras.
 */
export function BarcodeSvg({ value, className, title }: { value: string; className?: string; title?: string }) {
  if (!isEncodable(value)) return null;
  const { bars, totalModules } = code128Bars(value);
  return (
    <svg
      viewBox={`0 0 ${totalModules} 40`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={title ?? `Código de barras ${value}`}
      shapeRendering="crispEdges"
    >
      <rect width={totalModules} height={40} fill="#fff" />
      {bars.map(([x, width]) => (
        <rect key={x} x={x} y={0} width={width} height={40} fill="#000" />
      ))}
    </svg>
  );
}
