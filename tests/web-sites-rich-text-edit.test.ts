import { parseRichText } from '@/lib/web-sites/rich-text';
import { cleanLinkHref, cleanLinkText, insertLink, toggleInline, toggleLineFormat } from '@/lib/web-sites/rich-text-edit';

describe('toggleInline', () => {
  it('envuelve la selección en negrita y la deja seleccionada', () => {
    const result = toggleInline('Hola mundo lindo', { start: 5, end: 10 }, '**', 'x');
    expect(result.value).toBe('Hola **mundo** lindo');
    expect(result.value.slice(result.selection.start, result.selection.end)).toBe('mundo');
  });

  it('deja los espacios de los bordes fuera de las marcas', () => {
    const result = toggleInline('Hola mundo lindo', { start: 4, end: 11 }, '**', 'x');
    expect(result.value).toBe('Hola **mundo** lindo');
  });

  it('quita la negrita si la selección ya está rodeada por las marcas', () => {
    const result = toggleInline('Hola **mundo** lindo', { start: 7, end: 12 }, '**', 'x');
    expect(result.value).toBe('Hola mundo lindo');
    expect(result.value.slice(result.selection.start, result.selection.end)).toBe('mundo');
  });

  it('quita las marcas si la selección las incluye', () => {
    const result = toggleInline('Hola *mundo* lindo', { start: 5, end: 12 }, '*', 'x');
    expect(result.value).toBe('Hola mundo lindo');
  });

  it('sin selección inserta el texto de ejemplo ya seleccionado', () => {
    const result = toggleInline('Hola ', { start: 5, end: 5 }, '*', 'texto en cursiva');
    expect(result.value).toBe('Hola *texto en cursiva*');
    expect(result.value.slice(result.selection.start, result.selection.end)).toBe('texto en cursiva');
  });

  it('el resultado se lee como negrita en el formato del sitio', () => {
    const { value } = toggleInline('Precio desde hoy', { start: 7, end: 12 }, '**', 'x');
    const [block] = parseRichText(value);
    expect(block?.kind).toBe('p');
    const inline = block?.kind === 'p' ? block.lines[0] : [];
    expect(inline?.some((node) => node.kind === 'strong')).toBe(true);
  });
});

describe('toggleLineFormat', () => {
  it('convierte varias líneas en lista y luego las devuelve a texto', () => {
    const text = 'Uno\nDos\nTres';
    const list = toggleLineFormat(text, { start: 0, end: text.length }, 'ul');
    expect(list.value).toBe('- Uno\n- Dos\n- Tres');
    const back = toggleLineFormat(list.value, list.selection, 'ul');
    expect(back.value).toBe(text);
  });

  it('numera la lista y salta las líneas en blanco', () => {
    const text = 'Uno\n\nDos';
    const result = toggleLineFormat(text, { start: 0, end: text.length }, 'ol');
    expect(result.value).toBe('1. Uno\n\n2. Dos');
  });

  it('cambiar de lista con viñetas a numerada reemplaza la marca', () => {
    const text = '- Uno\n- Dos';
    const result = toggleLineFormat(text, { start: 0, end: text.length }, 'ol');
    expect(result.value).toBe('1. Uno\n2. Dos');
  });

  it('solo toca la línea donde está el cursor', () => {
    const text = 'Título\nPárrafo';
    const result = toggleLineFormat(text, { start: 2, end: 2 }, 'heading');
    expect(result.value).toBe('## Título\nPárrafo');
    expect(parseRichText(result.value)[0]?.kind).toBe('h3');
  });

  it('en una línea vacía deja la marca lista para escribir', () => {
    const result = toggleLineFormat('', { start: 0, end: 0 }, 'ul');
    expect(result.value).toBe('- ');
    expect(result.selection).toEqual({ start: 2, end: 2 });
  });

  it('una selección que termina al inicio de una línea no la toca', () => {
    const text = 'Uno\nDos';
    const result = toggleLineFormat(text, { start: 0, end: 4 }, 'ul');
    expect(result.value).toBe('- Uno\nDos');
  });
});

describe('insertLink', () => {
  it('reemplaza la selección por un enlace válido', () => {
    const result = insertLink('Mira la carta hoy', { start: 5, end: 13 }, 'la carta', 'https://ejemplo.cl/carta');
    expect(result?.value).toBe('Mira [la carta](https://ejemplo.cl/carta) hoy');
  });

  it('protege el destino de espacios y paréntesis que romperían la marca', () => {
    expect(cleanLinkHref(' https://a.cl/x y)z ')).toBe('https://a.cl/x%20y%29z');
    expect(cleanLinkText('[hola]\nmundo')).toBe('hola mundo');
  });

  it('no inserta si falta el texto o el destino', () => {
    expect(insertLink('a', { start: 0, end: 0 }, '', 'https://a.cl')).toBeNull();
    expect(insertLink('a', { start: 0, end: 0 }, 'hola', '  ')).toBeNull();
  });

  it('el enlace insertado lo entiende el lector de formato', () => {
    const result = insertLink('', { start: 0, end: 0 }, 'ver más', 'page:p123#contacto');
    const [block] = parseRichText(result?.value ?? '');
    const link = block?.kind === 'p' ? block.lines[0]?.find((node) => node.kind === 'link') : undefined;
    expect(link && link.kind === 'link' ? link.href : '').toBe('page:p123#contacto');
  });
});
