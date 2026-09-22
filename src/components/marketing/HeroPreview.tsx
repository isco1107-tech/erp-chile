import Image from 'next/image';

/** Real screenshot of the demo environment — same image used in the "Visión general" tab below. */
export default function HeroPreview() {
  return (
    <Image
      src="/manual/screenshots/dashboard.png"
      alt="Panel de gestión de Aether ERP con ventas, inventario y finanzas conectados"
      width={1440}
      height={900}
      sizes="(max-width: 760px) 100vw, 56vw"
      priority
    />
  );
}
