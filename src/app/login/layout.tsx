import { redirect } from 'next/navigation';
import { AuthError, getAuthContext, TenantInactiveError } from '@/lib/auth/guards';
import LoginIntro from '@/components/auth/LoginIntro';
import { LOGIN_INTRO_GATE_SCRIPT } from '@/components/auth/login-intro-timeline';

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  // Revalidate the real session, including revocations, before skipping login.
  // A JWT-only redirect here would loop for disabled users or revoked sessions.
  let destination: string | undefined;
  try {
    const context = await getAuthContext();
    destination = context.mustChangePassword ? '/change-password' : '/dashboard';
  } catch (error) {
    if (error instanceof TenantInactiveError) destination = '/suspended';
    else if (!(error instanceof AuthError)) throw error;
  }
  if (destination) redirect(destination);
  return (
    <>
      {/* Antes del velo de la intro: lo oculta sin parpadeo si ya se vio en esta sesión. */}
      <script dangerouslySetInnerHTML={{ __html: LOGIN_INTRO_GATE_SCRIPT }} />
      <LoginIntro />
      {children}
    </>
  );
}
