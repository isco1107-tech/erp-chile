import 'server-only';
import { AuthError, requireAuthWithPermission } from '@/lib/auth/guards';
import type { AnalyticsModule } from '@/lib/analytics/types';

export async function requireDataAccess(module: AnalyticsModule) {
  const context = await requireAuthWithPermission(module === 'analytics' ? 'analytics:view' : 'science:view');
  if (context.role !== 'OWNER' && context.role !== 'ADMIN') {
    throw new AuthError('Estos módulos son exclusivos para dueños y administradores', 403);
  }
  return context;
}
