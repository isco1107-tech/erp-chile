import fs from 'node:fs';
import path from 'node:path';

/**
 * N-17 (auditoría 2026-09-14): la unicidad de folio de compra por
 * proveedor no distinguía `documentType`. Una Factura y una Nota de Crédito
 * del mismo proveedor con el mismo folio (numeraciones independientes,
 * ambas legítimas) chocaban contra `@@unique([companyId, contactId,
 * folio])`. La constraint debe incluir `documentType`.
 *
 * No hay conexión a base de datos disponible en este entorno (compartida
 * con producción, nunca se migra desde acá), así que esta prueba verifica
 * el contrato declarado en el schema en vez de ejercer Postgres.
 */
describe('Unicidad de folio de PurchaseDocument por tipo de documento (N-17)', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const modelMatch = schema.match(/model PurchaseDocument \{[\s\S]*?\n\}/);

  it('el modelo PurchaseDocument existe en el schema', () => {
    expect(modelMatch).not.toBeNull();
  });

  const modelBody = modelMatch?.[0] ?? '';

  it('la unicidad de folio incluye documentType, contactId y companyId', () => {
    expect(modelBody).toMatch(/@@unique\(\[companyId, contactId, documentType, folio\]\)/);
  });

  it('ya no existe la unicidad vieja sin documentType', () => {
    expect(modelBody).not.toMatch(/@@unique\(\[companyId, contactId, folio\]\)/);
  });
});
