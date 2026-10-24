import { clearSession, json } from '../http';

/** Cerrar sesión: borra la cookie (la sesión no vive en ningún otro lado). */
export async function POST() {
  return clearSession(json({ success: true }));
}
