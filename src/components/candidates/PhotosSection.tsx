import type { CandidateDocument } from '@prisma/client';
import PhotoViewer from './PhotoViewer';

/**
 * Fotografías de la postulación pública (rostro/cuerpo entero). A diferencia
 * de `DocumentsSection`, NUNCA usa `doc.fileUrl` directamente como `src`: eso
 * expondría en el HTML la URL pública real del blob. En su lugar apunta a la
 * ruta autenticada (`/api/candidates/[id]/documents/[docId]/file`), que
 * verifica sesión + `candidates:sensitive` y registra la descarga en la
 * bitácora cada vez que el navegador la pide (Sección 4 y 7 del módulo).
 */
export default function PhotosSection({ candidateId, photos }: { candidateId: string; photos: CandidateDocument[] }) {
  if (photos.length === 0) return null;

  return (
    <div className="rounded border border-border p-3">
      <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Fotografías de la postulación</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo) => (
          <PhotoViewer
            key={photo.id}
            src={`/api/candidates/${candidateId}/documents/${photo.id}/file`}
            alt={photo.title}
            className="block cursor-zoom-in overflow-hidden rounded-lg border border-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/candidates/${candidateId}/documents/${photo.id}/file`}
              alt=""
              className="aspect-square w-full object-cover"
            />
            <span className="block p-1.5 text-center text-[11px] text-muted-foreground">{photo.title}</span>
          </PhotoViewer>
        ))}
      </div>
    </div>
  );
}
