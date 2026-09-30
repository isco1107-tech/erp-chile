import type { Recurrence } from './recurrence';

export interface StarterTask {
  title: string;
  description: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  recurrence: Recurrence;
  /** Días desde hoy hasta el primer vencimiento. */
  dueInDays: number;
}

/** Rutinas que el diagnóstico de Chakra pidió instalar: finanzas semanales, canal de origen, stock y clientes. */
export const STARTER_TASKS: StarterTask[] = [
  { title: 'Cierre semanal: registrar ingresos, costos y stock', description: 'Registra las ventas y compras de la semana, anota los costos, cuenta el stock y revisa el margen por producto.', priority: 'HIGH', recurrence: 'WEEKLY', dueInDays: 5 },
  { title: 'Revisar stock mínimo y pedir insumos', description: 'Mira qué insumos y envases están por acabarse y pide antes de quedar sin producto.', priority: 'NORMAL', recurrence: 'WEEKLY', dueInDays: 3 },
  { title: 'Registrar cómo nos encontró cada cliente nuevo', description: 'En Fidelización, anota el canal de origen de los clientes de la semana.', priority: 'NORMAL', recurrence: 'WEEKLY', dueInDays: 5 },
  { title: 'Llamar a clientes que dejaron de comprar', description: 'Revisa la lista de inactivos en Fidelización y escribe o llama a los más importantes.', priority: 'NORMAL', recurrence: 'WEEKLY', dueInDays: 4 },
  { title: 'Revisar procedimientos y acuses de lectura', description: 'Verifica que el equipo leyó los procedimientos vigentes y revisa los que tienen la revisión pendiente.', priority: 'LOW', recurrence: 'MONTHLY', dueInDays: 14 },
];
