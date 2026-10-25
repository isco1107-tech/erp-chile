import { installWorkerResponse } from '@/lib/apps/install-worker';

export const dynamic = 'force-static';

export function GET() {
  return installWorkerResponse('control');
}
