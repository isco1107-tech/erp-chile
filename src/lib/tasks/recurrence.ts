export type Recurrence = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Suma un mes calendario sin desbordar: 31 de enero + 1 mes = 28/29 de febrero, no 3 de marzo. */
function addMonth(date: Date): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay), date.getUTCHours(), date.getUTCMinutes()));
}

function step(date: Date, recurrence: Exclude<Recurrence, 'NONE'>): Date {
  if (recurrence === 'DAILY') return new Date(date.getTime() + DAY_MS);
  if (recurrence === 'WEEKLY') return new Date(date.getTime() + 7 * DAY_MS);
  return addMonth(date);
}

/**
 * Próximo vencimiento de una tarea que se repite. Parte del vencimiento
 * anterior (para mantener el ritmo: "todos los viernes") y avanza hasta quedar
 * DESPUÉS del momento en que se completó: una tarea semanal atrasada tres
 * semanas no genera tres tareas vencidas de golpe. Sin fecha previa, parte de
 * la de completado. `null` si no se repite.
 */
export function nextDueDate(previousDue: Date | null, recurrence: Recurrence, completedAt: Date): Date | null {
  if (recurrence === 'NONE') return null;
  let next = step(previousDue ?? completedAt, recurrence);
  for (let guard = 0; next.getTime() <= completedAt.getTime() && guard < 1000; guard += 1) next = step(next, recurrence);
  return next;
}

export function isOverdue(task: { status: string; dueDate: Date | null }, now: Date): boolean {
  return task.dueDate !== null && (task.status === 'TODO' || task.status === 'DOING') && task.dueDate.getTime() < now.getTime();
}
