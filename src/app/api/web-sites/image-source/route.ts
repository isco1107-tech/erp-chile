import { NextResponse } from 'next/server';
import { AuthError, assertPasswordChangeNotPending, authErrorMessage, can, getAuthContext } from '@/lib/auth/guards';
import { captureException } from '@/lib/observability';
import { sniffImageType } from '@/lib/security/file-signature';
import { EDITOR_IMAGE_FOLDERS, IMAGE_SOURCE_MAX_BYTES, editorImageFolder } from '@/lib/web-sites/image-source';

/**
 * Bytes de una imagen de la biblioteca de un editor visual, servidos desde
 * nuestro dominio para que el navegador pueda leer sus píxeles (quitarle el
 * fondo a un logo: `LogoBackgroundTool`). El almacenamiento es de otro origen
 * y sin CORS el `<canvas>` queda bloqueado.
 *
 * Solo lectura y solo lo que la propia empresa subió desde un editor
 * (`editorImageFolder`: nuestro almacenamiento, carpeta de biblioteca y
 * `companyId` de la sesión), con el permiso de escritura del editor dueño de
 * esa carpeta. El servidor nunca sigue una dirección arbitraria: el host sale
 * de la lista de `isAllowedBlobUrl` y no sigue redirecciones. Responde la
 * imagen solo si su firma binaria es JPG, PNG o WEBP.
 */
export async function GET(req: Request) {
  let companyId: string | undefined;
  try {
    const session = await getAuthContext();
    assertPasswordChangeNotPending(session);
    companyId = session.companyId;
    const url = new URL(req.url).searchParams.get('url') ?? '';
    const folder = editorImageFolder(url, session.companyId);
    if (!folder) return NextResponse.json({ success: false, error: 'Esa imagen no es de la biblioteca de tus sitios. Súbela de nuevo.' }, { status: 404 });
    if (!EDITOR_IMAGE_FOLDERS[folder].some((permission) => can(session, permission))) throw new AuthError('No autorizado para esta acción', 403);

    const response = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return NextResponse.json({ success: false, error: 'No se encontró la imagen. Súbela de nuevo.' }, { status: 404 });
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > IMAGE_SOURCE_MAX_BYTES) return NextResponse.json({ success: false, error: 'La imagen es demasiado pesada.' }, { status: 413 });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > IMAGE_SOURCE_MAX_BYTES) return NextResponse.json({ success: false, error: 'La imagen es demasiado pesada.' }, { status: 413 });
    const type = sniffImageType(bytes);
    if (!type) return NextResponse.json({ success: false, error: 'La imagen debe ser JPG, PNG o WEBP.' }, { status: 415 });

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': type,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return NextResponse.json({ success: false, error: authMessage }, { status: error instanceof AuthError && error.status === 401 ? 401 : 403 });
    captureException(error, { module: 'sitios-web', companyId, extra: { reason: 'image-source' } });
    return NextResponse.json({ success: false, error: 'No se pudo abrir la imagen. Intenta de nuevo.' }, { status: 500 });
  }
}
