import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clearSessionCookie } from '@/lib/auth/session';
import { revokeSessionByToken } from '@/lib/auth/sessions';

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  if (token) await revokeSessionByToken(token);

  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  return res;
}
