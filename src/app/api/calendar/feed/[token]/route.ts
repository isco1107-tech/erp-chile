import { NextResponse } from 'next/server';
import { getCalendarFeedByToken } from '@/modules/calendar/services/calendar.service';
import { captureException } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const result = await getCalendarFeedByToken(token, baseUrl);
    if (!result) {
      return new NextResponse('Calendario no encontrado o token inválido', { status: 404 });
    }

    return new NextResponse(result.ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `inline; filename="${result.filename}"`,
        'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
      },
    });
  } catch (error) {
    captureException(error, { module: 'calendar' });
    return new NextResponse('Error interno al generar el calendario', { status: 500 });
  }
}
