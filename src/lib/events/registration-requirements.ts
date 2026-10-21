/**
 * Requisitos de inscripción de un certamen (los que la organización marca al
 * crearlo). Módulo puro, sin `'use client'`: lo comparten el formulario
 * público, el servidor y las pantallas que listan los requisitos, para que lo
 * que se le pide a la postulante y lo que se valida sea siempre lo mismo.
 */
export interface RegistrationRequirements {
  /** Edad mínima al momento de postular. */
  minAge: number;
  /** Debe declarar ser chilena (casilla; no se contrasta con ningún registro). */
  chileanNationality: boolean;
  /** Debe escribir su usuario de Instagram. */
  instagram: boolean;
  /** Debe subir una foto suya. */
  photo: boolean;
}

export const DEFAULT_REGISTRATION_REQUIREMENTS: RegistrationRequirements = {
  minAge: 18,
  chileanNationality: false,
  instagram: true,
  photo: false,
};

/** Arma los requisitos desde las columnas de `Project`. */
export function requirementsFromProject(project: {
  minCandidateAge: number;
  requireChileanNationality: boolean;
  requireCandidateInstagram: boolean;
  requireCandidatePhoto: boolean;
}): RegistrationRequirements {
  return {
    minAge: project.minCandidateAge,
    chileanNationality: project.requireChileanNationality,
    instagram: project.requireCandidateInstagram,
    photo: project.requireCandidatePhoto,
  };
}

/** Lista legible ("Tener al menos 18 años", "Ser chilena"…) para mostrar en el sitio y en la inscripción. */
export function describeRequirements(requirements: RegistrationRequirements): string[] {
  const items = [`Tener al menos ${requirements.minAge} años`];
  if (requirements.chileanNationality) items.push('Ser chilena');
  if (requirements.instagram) items.push('Tener una cuenta de Instagram');
  if (requirements.photo) items.push('Subir una foto tuya al inscribirte');
  return items;
}

export interface RegistrationAnswers {
  age?: number | null;
  instagram?: string | null;
  photoUrl?: string | null;
  declaraNacionalidadChilena?: boolean | null;
}

/**
 * Qué requisito no se cumple, por campo del formulario. Vacío = cumple todo.
 * Se usa igual en el navegador (para avisar antes de enviar) y en el servidor
 * (la barrera real).
 */
export function checkRegistrationRequirements(requirements: RegistrationRequirements, answers: RegistrationAnswers): Record<string, string> {
  const problems: Record<string, string> = {};
  if (typeof answers.age === 'number' && answers.age < requirements.minAge) {
    problems.age = `Debes tener al menos ${requirements.minAge} años para postular.`;
  }
  if (requirements.chileanNationality && answers.declaraNacionalidadChilena !== true) {
    problems.declaraNacionalidadChilena = 'Este certamen es solo para candidatas chilenas: marca la casilla para confirmarlo.';
  }
  if (requirements.instagram && !answers.instagram?.trim()) {
    problems.instagram = 'Escribe tu usuario de Instagram';
  }
  if (requirements.photo && !answers.photoUrl) {
    problems.photoUrl = 'Sube una foto tuya para inscribirte';
  }
  return problems;
}

/** Carpeta del almacenamiento donde caen las fotos subidas desde el formulario público (la ruta de subida y la de envío deben coincidir). */
export function applicationPhotoPrefix(companyId: string): string {
  return `candidates/${companyId}/applications/`;
}
