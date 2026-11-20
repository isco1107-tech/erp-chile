export const PAGEANT_NATIVE_TEXT = {
  publicTagline: { label: 'Frase principal', max: 160, multiline: false },
  publicDescription: { label: 'Descripción del certamen', max: 4000, multiline: true },
  directorName: { label: 'Nombre de la dirección', max: 120, multiline: false },
  directorRole: { label: 'Cargo de la dirección', max: 160, multiline: false },
  directorBio: { label: 'Presentación de la dirección', max: 1500, multiline: true },
  sponsorExclusivityNote: { label: 'Nota de exclusividad para sponsors', max: 800, multiline: true },
} as const;

export type PageantNativeTextField = keyof typeof PAGEANT_NATIVE_TEXT;
export type PageantNativeText = Record<PageantNativeTextField, string>;

export function isPageantNativeTextField(field: unknown): field is PageantNativeTextField {
  return typeof field === 'string' && Object.hasOwn(PAGEANT_NATIVE_TEXT, field);
}

export function pageantNativeTextOf(values: PageantNativeText): PageantNativeText {
  const { publicTagline, publicDescription, directorName, directorRole, directorBio, sponsorExclusivityNote } = values;
  return { publicTagline, publicDescription, directorName, directorRole, directorBio, sponsorExclusivityNote };
}
