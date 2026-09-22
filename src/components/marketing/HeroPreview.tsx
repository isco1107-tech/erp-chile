import { ArrowUpRight, BarChart3, Boxes, Check, LayoutDashboard, ReceiptText, Search, WalletCards } from 'lucide-react';
import s from './landing.module.css';

/** Illustrative data only; never queries or exposes a customer's company. */
export default function HeroPreview() {
  return <div className={s.preview} aria-label="Ejemplo ilustrativo del panel de gestión, con datos ficticios">
    <aside className={s.previewSidebar} aria-hidden="true"><strong>aether<span>ERP</span></strong><small>MI EMPRESA</small><span className={s.previewSelected}><LayoutDashboard />Resumen</span><span><ReceiptText />Ventas</span><span><Boxes />Inventario</span><span><WalletCards />Tesorería</span><span><BarChart3 />Reportes</span><div><span>AC</span><p>Mi empresa<br /><small>Administración</small></p></div></aside>
    <div className={s.previewMain}>
      <div className={s.previewToolbar}><span><Search size={11} />Buscar en tu empresa</span><span className={s.previewAvatar}>AC</span></div>
      <div className={s.previewWelcome}><div><small>LA VISIÓN COMPLETA DE TU NEGOCIO</small><h2>Todo listo para avanzar.</h2><p>Así se ve una operación conectada.</p></div><span>Vista ilustrativa</span></div>
      <div className={s.previewStats}><div><span>Ventas del mes <ReceiptText /></span><strong>$18.450.000</strong><small><ArrowUpRight />Tu actividad comercial</small></div><div><span>Por cobrar <WalletCards /></span><strong>$3.280.000</strong><small>Compromisos a la vista</small></div><div><span>Saldo en caja <BarChart3 /></span><strong>$8.120.000</strong><small>Para planificar lo que viene</small></div></div>
      <div className={s.previewChart}><div><strong>El pulso de tu empresa</strong><span><i /> Ventas <i /> Costos</span></div><div className={s.chartArea}><div className={s.chartAxis}><span>$20M</span><span>$10M</span><span>$0</span></div><div className={s.chartBars}>{[38, 53, 45, 64, 56, 74, 67, 83, 73, 89, 79, 95].map((height, index) => <div key={index}><span style={{ height: `${height}%` }} /><span style={{ height: `${height * .58}%` }} /></div>)}</div></div><div className={s.chartMonths}><span>Ene</span><span>Mar</span><span>May</span><span>Jul</span><span>Sep</span><span>Dic</span></div></div>
      <div className={s.previewActivity}><span><Check size={12} />Venta registrada</span><ArrowUpRight size={13} /><span><Check size={12} />Stock actualizado</span><ArrowUpRight size={13} /><span><Check size={12} />Caja conectada</span></div>
    </div>
  </div>;
}
