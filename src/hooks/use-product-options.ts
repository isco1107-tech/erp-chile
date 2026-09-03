import { useEffect, useState } from 'react';
import { listProductsAction } from '@/modules/inventory/actions/products.actions';

export interface ProductOption {
  id: string;
  name: string;
  sku: string;
}

/**
 * Catálogo de la empresa para el selector de producto de una línea de
 * detalle — se carga una sola vez al montar, compartido por cualquier
 * pantalla que deje vincular texto libre/IA a un producto real
 * (`AiInvoiceScanner`, `AiPromptImporter`, `ImportWizard`). Si falla (sin
 * permiso `products:read`, red caída), el selector simplemente queda vacío —
 * el usuario igual puede dejar la línea sin vincular.
 */
export function useProductOptions(): ProductOption[] {
  const [products, setProducts] = useState<ProductOption[]>([]);

  useEffect(() => {
    listProductsAction()
      .then((result) => {
        if (result.success) setProducts(result.data.map((p) => ({ id: p.id, name: p.name, sku: p.sku })));
      })
      .catch(() => {});
  }, []);

  return products;
}
