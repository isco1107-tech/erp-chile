import {
  MATERIAL_ACCEPT,
  collectRecipients,
  fileExtension,
  formatBytes,
  materialObjectKey,
  materialPrefix,
  materialTypeLabel,
  safeMaterialLink,
  slugifyFileBase,
  sniffMaterialType,
} from '@/lib/academy/materials';
import { buildAcademyMaterialEmail } from '@/lib/email/templates';

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(32).fill(0)]);
const PDF = bytes(0x25, 0x50, 0x44, 0x46);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04);
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

describe('tipo de archivo por sus bytes', () => {
  it('acepta un PDF aunque el nombre diga otra cosa', () => {
    expect(sniffMaterialType(PDF, 'clase.txt')?.contentType).toBe('application/pdf');
  });

  it('acepta Office moderno solo con su extensión', () => {
    expect(sniffMaterialType(ZIP, 'Clase 3.PPTX')?.extension).toBe('pptx');
    expect(sniffMaterialType(ZIP, 'guia.docx')?.label).toBe('Word');
    expect(sniffMaterialType(ZIP, 'notas.xlsx')?.label).toBe('Excel');
    // Un ZIP cualquiera, o con otra extensión, no pasa.
    expect(sniffMaterialType(ZIP, 'fotos.zip')).toBeNull();
    expect(sniffMaterialType(ZIP, 'virus.exe')).toBeNull();
  });

  it('acepta Office antiguo solo con su extensión', () => {
    expect(sniffMaterialType(OLE, 'clase.ppt')?.contentType).toBe('application/vnd.ms-powerpoint');
    expect(sniffMaterialType(OLE, 'clase.doc')?.extension).toBe('doc');
    expect(sniffMaterialType(OLE, 'clase.exe')).toBeNull();
  });

  it('acepta imágenes por su firma', () => {
    expect(sniffMaterialType(PNG, 'foto.bin')?.extension).toBe('png');
  });

  it('rechaza HTML, SVG, scripts y archivos vacíos disfrazados', () => {
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    expect(sniffMaterialType(html, 'clase.pdf')).toBeNull();
    expect(sniffMaterialType(new TextEncoder().encode('<svg onload=alert(1)>'), 'logo.svg')).toBeNull();
    expect(sniffMaterialType(new Uint8Array(0), 'vacio.pdf')).toBeNull();
  });

  it('el selector de archivos ofrece las mismas extensiones', () => {
    expect(MATERIAL_ACCEPT.split(',')).toEqual(expect.arrayContaining(['.pdf', '.pptx', '.docx', '.xlsx', '.ppt', '.png']));
    expect(MATERIAL_ACCEPT).not.toContain('.svg');
    expect(MATERIAL_ACCEPT).not.toContain('.html');
  });

  it('etiqueta cada tipo', () => {
    expect(materialTypeLabel('LINK', null)).toBe('Enlace');
    expect(materialTypeLabel('FILE', 'application/pdf')).toBe('PDF');
    expect(materialTypeLabel('FILE', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('PowerPoint');
    expect(materialTypeLabel('FILE', 'application/x-raro')).toBe('Archivo');
  });
});

describe('nombres en el almacenamiento', () => {
  it('limpia acentos, espacios y símbolos', () => {
    expect(slugifyFileBase('Clase 3 – Pasarela y postura (final).pptx')).toBe('clase-3-pasarela-y-postura-final');
    expect(slugifyFileBase('Ñandú/..\\..\\etc.pdf')).toBe('nandu-etc');
    expect(slugifyFileBase('....pdf')).toBe('material');
    expect(slugifyFileBase('a'.repeat(200) + '.pdf').length).toBeLessThanOrEqual(60);
  });

  it('la clave queda dentro de la carpeta de la empresa y no puede escapar de ella', () => {
    const key = materialObjectKey('emp1', '../../otra/Clase.PPTX', { contentType: 'x', extension: 'pptx', label: 'PowerPoint' }, 'ab12cd34');
    expect(key).toBe('academy-material/emp1/ab12cd34-otra-clase.pptx');
    expect(key.startsWith(materialPrefix('emp1'))).toBe(true);
    expect(key).not.toContain('..');
  });

  it('lee la extensión en minúscula', () => {
    expect(fileExtension('Clase.PPTX')).toBe('pptx');
    expect(fileExtension('sin-extension')).toBe('');
  });

  it('formatea el peso', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(850 * 1024)).toBe('850 KB');
    expect(formatBytes(2.4 * 1024 * 1024)).toBe('2,4 MB');
  });
});

describe('enlaces externos', () => {
  it('acepta https con dominio', () => {
    expect(safeMaterialLink('https://drive.google.com/file/d/abc/view')).toBe('https://drive.google.com/file/d/abc/view');
    expect(safeMaterialLink('drive.google.com/file/d/abc')).toBe('https://drive.google.com/file/d/abc');
    expect(safeMaterialLink('  https://youtu.be/xyz  ')).toBe('https://youtu.be/xyz');
  });

  it('rechaza lo que no es una página segura', () => {
    expect(safeMaterialLink('javascript:alert(1)')).toBeNull();
    expect(safeMaterialLink('data:text/html,<script>1</script>')).toBeNull();
    expect(safeMaterialLink('http://sitio.cl/archivo')).toBeNull();
    expect(safeMaterialLink('https://usuario:clave@sitio.cl')).toBeNull();
    expect(safeMaterialLink('https://localhost/x')).toBeNull();
    expect(safeMaterialLink('ftp://sitio.cl/x')).toBeNull();
    expect(safeMaterialLink('')).toBeNull();
    expect(safeMaterialLink(null)).toBeNull();
    expect(safeMaterialLink('https://sitio.cl/' + 'a'.repeat(600))).toBeNull();
  });
});

describe('a quién se envía', () => {
  it('junta el correo de la alumna y el de su apoderado, sin repetir', () => {
    const plan = collectRecipients([
      { fullName: 'Ana Pérez', email: 'ana@correo.cl', guardianEmail: 'mama@correo.cl' },
      { fullName: 'Bea Soto', email: 'ANA@correo.cl ', guardianEmail: null }, // misma dirección que Ana
      { fullName: 'Cata Rojas', email: null, guardianEmail: 'papa@correo.cl' },
    ]);
    expect(plan.emails).toEqual(['ana@correo.cl', 'mama@correo.cl', 'papa@correo.cl']);
    expect(plan.withoutEmail).toEqual([]);
  });

  it('avisa qué alumnas no tienen ningún correo', () => {
    const plan = collectRecipients([
      { fullName: 'Ana Pérez', email: 'ana@correo.cl', guardianEmail: null },
      { fullName: 'Dani Mora', email: null, guardianEmail: null },
      { fullName: 'Eli Vega', email: 'no-es-un-correo', guardianEmail: '' },
    ]);
    expect(plan.emails).toEqual(['ana@correo.cl']);
    expect(plan.withoutEmail).toEqual(['Dani Mora', 'Eli Vega']);
  });

  it('respeta el tope de direcciones', () => {
    const students = Array.from({ length: 5 }, (_, i) => ({ fullName: `Alumna ${i}`, email: `a${i}@correo.cl`, guardianEmail: null }));
    const plan = collectRecipients(students, 3);
    expect(plan.emails).toHaveLength(3);
    expect(plan.truncated).toBe(true);
  });
});

describe('correo del material', () => {
  const base = {
    academyName: 'Academia CR',
    groupName: 'Modelaje juvenil',
    title: 'Postura y pasarela',
    description: 'Repasa las diapositivas antes del sábado.',
    kind: 'FILE' as const,
    url: 'https://archivos.ejemplo.cl/academy-material/e1/ab12-clase.pptx?x=1&y=2',
    fileName: 'Clase 3.pptx',
    typeLabel: 'PowerPoint',
    sizeLabel: '2,4 MB',
    classLabel: 'sábado 11 de octubre · 10:00 – 12:00',
  };

  it('lleva el título, el grupo, la clase y el botón de descarga', () => {
    const email = buildAcademyMaterialEmail(base);
    expect(email.subject).toBe('Academia CR · Material: Postura y pasarela');
    expect(email.html).toContain('Modelaje juvenil');
    expect(email.html).toContain('Descargar archivo');
    expect(email.html).toContain('sábado 11 de octubre');
    expect(email.html).toContain('x=1&amp;y=2');
    expect(email.text).toContain('https://archivos.ejemplo.cl/academy-material/e1/ab12-clase.pptx?x=1&y=2');
  });

  it('un enlace dice «Abrir enlace»', () => {
    const email = buildAcademyMaterialEmail({ ...base, kind: 'LINK', fileName: null, sizeLabel: null, typeLabel: 'Enlace', classLabel: null });
    expect(email.html).toContain('Abrir enlace');
    expect(email.html).not.toContain('Clase:');
  });

  it('escapa lo que escribe el equipo', () => {
    const email = buildAcademyMaterialEmail({ ...base, title: '<script>alert(1)</script>', description: '"><img src=x onerror=alert(1)>', groupName: '<b>Grupo</b>' });
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img');
    expect(email.html).not.toContain('<b>Grupo</b>');
  });
});
