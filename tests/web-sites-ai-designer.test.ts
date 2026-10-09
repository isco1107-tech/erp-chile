import { designerRequestSchema, designerSystemPrompt, parseDesignerProposal, academyDesignSchema } from '@/lib/web-sites/ai-designer';
import { createBlock } from '@/lib/web-sites/blocks';
import { DEFAULT_THEME } from '@/lib/web-sites/theme';

const web = designerRequestSchema.parse({ target: 'web', resourceId: 'site-1', pageId: 'home', instruction: 'Mejora mi página en móvil', current: { blocks: [createBlock('text')], theme: DEFAULT_THEME } });
const proposal = { target: 'web', summary: 'Lectura más clara', changes: ['Mejora del espaciado'], design: web.current };

describe('Diseñador IA compartido', () => {
  it('acepta una propuesta completa y valida cada sección antes de mostrarla', () => {
    expect(parseDesignerProposal(JSON.stringify(proposal), web, []).target).toBe('web');
    expect(parseDesignerProposal('```json\n' + JSON.stringify(proposal) + '\n```', web, []).target).toBe('web');
  });
  it('rechaza respuestas inválidas, objetivos distintos y campos de publicación', () => {
    expect(() => parseDesignerProposal('No puedo', web, [])).toThrow('diseño válido');
    expect(() => parseDesignerProposal(JSON.stringify({ ...proposal, target: 'academy' }), web, [])).toThrow('formato');
    expect(() => parseDesignerProposal(JSON.stringify({ ...proposal, publish: true }), web, [])).toThrow('formato');
  });
  it('rechaza imágenes inventadas, incluidas capas de lienzo', () => {
    const image = { ...createBlock('image'), imageUrl: 'https://foreign.example.cl/image.webp' };
    const text = JSON.stringify({ ...proposal, design: { blocks: [image], theme: DEFAULT_THEME } });
    expect(() => parseDesignerProposal(text, web, [])).toThrow('imágenes ajenas');
    expect(parseDesignerProposal(text, web, [image.imageUrl]).target).toBe('web');
  });
  it.each(['academy-studio', 'event-studio'] as const)('permite que %s genere el mismo motor visual', (target) => {
    const request = designerRequestSchema.parse({ target, resourceId: 'event-1', instruction: 'Diseña una nueva sección', current: web.current });
    expect(parseDesignerProposal(JSON.stringify({ ...proposal, target }), request, []).target).toBe(target);
    expect(() => parseDesignerProposal(JSON.stringify({ ...proposal, target, design: { blocks: [createBlock('contact')], theme: DEFAULT_THEME } }), request, [])).toThrow('formulario incompatible');
  });
  it('excluye precios, testimonios, cifras, fotos y publicación de las propuestas de academia', () => {
    const design = academyDesignSchema.parse({});
    expect(design).not.toHaveProperty('monthlyFee');
    expect(design).not.toHaveProperty('testimonials');
    expect(academyDesignSchema.safeParse({ ...design, monthlyFee: 1 }).success).toBe(false);
  });
  it('el prompt define el contrato, el lienzo y la preservación de hechos', () => {
    const prompt = designerSystemPrompt(web);
    expect(prompt).toContain('No inventes precios');
    expect(prompt).toContain('style.canvas');
    expect(prompt).toContain('Conserva los ids');
    expect(prompt.length).toBeLessThan(60000);
  });
});
