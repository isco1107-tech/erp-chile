import { renderToStaticMarkup } from 'react-dom/server';
import { PageantSelectionTools } from '@/components/projects/PageantSelectionTools';
import { CanvasEditor } from '@/components/web-sites/CanvasEditor';
import { canvasSchema } from '@/lib/web-sites/canvas';
import { documentFromBlocks, homeOf } from '@/lib/web-sites/site';

jest.mock('@/components/web-sites/EditorRuntime', () => ({ useEditorRuntime: () => ({ scope: 'website' }) }));

const document = documentFromBlocks([]);
const canvas = canvasSchema.parse({ enabled: true, elements: [
  { id: 'a', name: 'Título', kind: 'shape' },
  { id: 'b', name: 'Banda', kind: 'shape' },
] });
const ignore = () => {};

function renderSelection(ids: string[]) {
  return renderToStaticMarkup(
    <CanvasEditor document={document} pageId={homeOf(document).id} value={canvas} fitSection disabled={false} onChange={ignore}
      liveSelection={{
        id: ids[0] ?? null, ids, onToggle: ignore, onChange: ignore,
        tools: <PageantSelectionTools count={ids.length} movable={ids.length} canPaste={false} disabled={false}
          onCommand={ignore} onPasteAt={ignore} onAlign={ignore} onDistribute={ignore} />,
      }}
    />,
  );
}

it('permite elegir varias capas con casillas y reserva los campos individuales para una sola', () => {
  const multiple = renderSelection(['a', 'b']);
  expect(multiple).toContain('2 capas seleccionadas');
  expect(multiple).toContain('Incluir Título en la selección');
  expect(multiple).toContain('Incluir Banda en la selección');
  expect(multiple).not.toContain('Nombre de la capa');

  const single = renderSelection(['a']);
  expect(single).toContain('Nombre de la capa');
  expect(single).toContain('Alinear al lienzo');
  expect(single.match(/>Duplicar<\/button>/g)).toHaveLength(1);
});

it('permite elegir destino al pegar después de quitar la selección', () => {
  const html = renderToStaticMarkup(<PageantSelectionTools count={0} movable={0} canPaste disabled={false}
    onCommand={ignore} onPasteAt={ignore} onAlign={ignore} onDistribute={ignore} />);
  expect(html).toContain('Pegar en otro lugar');
  expect(html).not.toContain('Alinear al lienzo');
});
