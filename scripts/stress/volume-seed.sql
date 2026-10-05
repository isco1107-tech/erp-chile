-- Carga de VOLUMEN para medir lecturas con una empresa grande (solo base LOCAL).
-- Llena la empresa de demo (RUT 99.999.999-9) con: 50.000 clientes, 20.000
-- productos con stock, 150.000 ventas en 24 meses (300.000 líneas), 300.000
-- movimientos de Kardex y 100.000 pagos. Inserción directa por SQL: estos
-- datos sirven para medir tiempos, no para cuadrar contabilidad.
--
--   psql postgresql://postgres@localhost:5433/erp_stress -f scripts/stress/volume-seed.sql
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE v AS
  SELECT c.id AS company_id, w.id AS warehouse_id
  FROM "Company" c JOIN "Warehouse" w ON w."companyId" = c.id AND w.code = 'CENTRAL'
  WHERE c.rut = '99.999.999-9';

INSERT INTO "Contact" (id, "companyId", rut, "rutClean", "razonSocial", "isCustomer", "updatedAt", "createdAt")
SELECT 'vc' || n, v.company_id, (10000000 + n)::text || '-0', (10000000 + n)::text || '0',
       'Cliente de volumen ' || n || ' Limitada', true, now(), now() - (n % 700) * interval '1 day'
FROM v, generate_series(1, 50000) n;

INSERT INTO "Product" (id, "companyId", sku, name, "netPrice", "costPricePMP", "minStock", "isTrackable", "updatedAt", "createdAt")
SELECT 'vp' || n, v.company_id, 'VOL-' || n, 'Producto de volumen ' || n, 1000 + (n % 50) * 100, 600, (n % 4) * 5, true, now(), now() - (n % 700) * interval '1 day'
FROM v, generate_series(1, 20000) n;

INSERT INTO "Stock" (id, "companyId", "productId", "warehouseId", quantity, "updatedAt")
SELECT 'vs' || n, v.company_id, 'vp' || n, v.warehouse_id, n % 40, now()
FROM v, generate_series(1, 20000) n;

INSERT INTO "SalesDocument" (id, "companyId", "contactId", "warehouseId", "dteType", folio, status, "issueDate", "dueDate", "paymentMethod",
  "netAmount", "exemptAmount", "ivaAmount", "totalAmount", "paidAmount", "paymentStatus", "createdAt", "updatedAt")
SELECT 'vd' || n, v.company_id, 'vc' || (1 + n % 50000), v.warehouse_id,
       (CASE WHEN n % 3 = 0 THEN 'FACTURA_33' ELSE 'BOLETA_39' END)::"DteType", 1000000 + n, 'ISSUED',
       now() - (n % 730) * interval '1 day', now() - (n % 730) * interval '1 day' + interval '30 days',
       CASE WHEN n % 3 = 0 THEN 'CREDITO_30' ELSE 'EFECTIVO' END,
       20000, 0, 3800, 23800, CASE WHEN n % 7 = 0 THEN 0 ELSE 23800 END,
       (CASE WHEN n % 7 = 0 THEN 'UNPAID' ELSE 'PAID' END)::"PaymentStatus",
       now() - (n % 730) * interval '1 day', now()
FROM v, generate_series(1, 150000) n;

INSERT INTO "SalesDocumentItem" (id, "companyId", "documentId", "productId", description, quantity, "unitPrice", subtotal, iva, total, "unitCostPMP")
SELECT 'vi' || n || '-' || k, v.company_id, 'vd' || n, 'vp' || (1 + (n * k) % 20000), 'Producto de volumen', 1, 10000, 10000, 1900, 11900, 600
FROM v, generate_series(1, 150000) n, generate_series(1, 2) k;

INSERT INTO "InventoryMovement" (id, "companyId", "productId", "warehouseId", type, quantity, "unitCost", "totalCost", "previousStock", "newStock", "previousPmp", "newPmp", reference, "createdAt")
SELECT 'vm' || n, v.company_id, 'vp' || (1 + n % 20000), v.warehouse_id, 'SALE_OUT', 1, 600, 600, 10, 9, 600, 600, 'Volumen', now() - (n % 730) * interval '1 day'
FROM v, generate_series(1, 300000) n;

INSERT INTO "Payment" (id, "companyId", type, "contactId", "salesDocumentId", amount, "paymentMethod", "paymentDate", "createdAt", "updatedAt")
SELECT 'vy' || n, v.company_id, 'INCOME', 'vc' || (1 + n % 50000), 'vd' || n, 23800, 'EFECTIVO', now() - (n % 730) * interval '1 day', now() - (n % 730) * interval '1 day', now()
FROM v, generate_series(1, 100000) n WHERE n % 7 <> 0;
COMMIT;
ANALYZE;
