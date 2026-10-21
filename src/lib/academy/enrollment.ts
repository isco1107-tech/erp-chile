/** Lógica pura de la inscripción a la academia (sin Prisma). */

export const ADULT_AGE = 18;
export const MIN_AGE = 3;
export const MAX_AGE = 100;

/** Años cumplidos a `now`, comparando día y mes en UTC (las fechas de nacimiento se guardan a las 12:00 UTC). */
export function ageOn(birthDate: Date, now: Date): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birthDate.getUTCMonth() || (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function isMinor(birthDate: Date, now: Date): boolean {
  return ageOn(birthDate, now) < ADULT_AGE;
}
