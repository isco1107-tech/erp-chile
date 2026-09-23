'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Category } from '@prisma/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/pagination';
import ProductForm from './ProductForm';
import {
  deleteProductAction,
  getProductAction,
  listCategoriesAction,
  listProductsPageAction,
} from '@/modules/inventory/actions/products.actions';
import type { ProductListItem } from '@/modules/inventory/services/products.service';
import { formatCurrency } from '@/lib/chile/tax';

import { useConfirm } from '@/components/ui/confirm-provider';
const DEFAULT_PAGE_SIZE = 25;

export default function ProductsClient() {
  const confirm = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<number>(DEFAULT_PAGE_SIZE);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductListItem | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, categoryId]);

  async function loadProducts() {
    setLoading(true);
    const result = await listProductsPageAction(debouncedQuery || undefined, categoryId || undefined, page, pageSize);
    if (result.success) {
      setProducts(result.data.items);
      setTotal(result.data.total);
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, categoryId, page, pageSize]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function setPageSize(size: number) {
    setPageSizeState(size);
    setPage(1);
  }

  async function loadCategories() {
    const result = await listCategoriesAction();
    if (result.success) setCategories(result.data);
  }

  useEffect(() => {
    loadCategories();
  }, []);

  // Deep-link desde la paleta de comandos: abre directamente la ficha de
  // edición del producto elegido en la búsqueda en vivo.
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId) return;
    getProductAction(editId).then((result) => {
      if (result.success) {
        setEditingProduct(result.data);
        setShowForm(true);
      } else {
        toast.error(result.error);
      }
    });
    router.replace('/dashboard/products');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleSaved() {
    setShowForm(false);
    setEditingProduct(null);
    loadProducts();
  }

  function handleEdit(product: ProductListItem) {
    setEditingProduct(product);
    setShowForm(true);
  }

  async function handleDelete(product: ProductListItem) {
    if (!await confirm(`¿Eliminar el producto "${product.name}"?`)) return;
    const result = await deleteProductAction(product.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success('Producto eliminado');
    loadProducts();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            data-tutorial="module-search"
            placeholder="Buscar por SKU o Nombre"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-64"
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <Button
          type="button"
          data-tutorial="module-primary-action"
          onClick={() => {
            setEditingProduct(null);
            setShowForm((s) => !s);
          }}
        >
          {showForm && !editingProduct ? 'Cerrar formulario' : 'Nuevo producto'}
        </Button>
      </div>

      {showForm && (
        <ProductForm
          editingProduct={editingProduct}
          categories={categories}
          onSaved={handleSaved}
          onCancelEdit={() => {
            setEditingProduct(null);
            setShowForm(false);
          }}
          onCategoryCreated={(c) => setCategories((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))}
        />
      )}

      <div className="rounded-xl border border-border">
        <div className="max-h-[65vh] scroll-smooth overflow-auto">
          <table className="w-full min-w-[880px] table-auto text-sm">
            <thead className="sticky top-0 z-10 bg-muted/95 text-left backdrop-blur-sm">
              <tr>
                <th className="p-2 font-medium">SKU</th>
                <th className="p-2 font-medium">Nombre</th>
                <th className="p-2 font-medium">Categoría</th>
                <th className="p-2 font-medium">Unidad</th>
                <th className="p-2 font-medium">Precio Neto</th>
                <th className="p-2 font-medium">Precio Bruto</th>
                <th className="p-2 font-medium">Stock</th>
                <th className="p-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="p-4 text-center text-muted-foreground" colSpan={8}>Cargando...</td>
                </tr>
              )}
              {!loading && products.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      title={query || categoryId ? 'Sin resultados para tu búsqueda' : 'Todavía no tienes productos'}
                      description={
                        query || categoryId
                          ? 'Prueba con otro SKU, nombre o categoría.'
                          : 'Crea tu primer producto o impórtalos masivamente desde Excel.'
                      }
                      actionLabel={query || categoryId ? undefined : 'Nuevo producto'}
                      onAction={query || categoryId ? undefined : () => setShowForm(true)}
                    />
                  </td>
                </tr>
              )}
              {!loading && products.map((p) => {
              const lowStock = p.isTrackable && p.totalStock <= p.minStock;
              return (
                <tr key={p.id} className="border-t border-border">
                  <td className="p-2 font-mono text-xs">{p.sku}</td>
                  <td className="p-2">{p.name}</td>
                  <td className="p-2">{p.category?.name ?? '—'}</td>
                  <td className="p-2">{p.unit}</td>
                  <td className="p-2">{formatCurrency(p.netPrice)}</td>
                  <td className="p-2">{formatCurrency(p.grossPrice)}</td>
                  <td className="p-2">
                    {p.isTrackable ? (
                      <span
                        className={
                          lowStock
                            ? 'rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive'
                            : 'rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium'
                        }
                      >
                        {p.totalStock} {p.unit}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Servicio</span>
                    )}
                  </td>
                  <td className="p-2">
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => handleEdit(p)}>Editar</Button>
                      <Button type="button" size="sm" variant="destructive" onClick={() => handleDelete(p)}>Eliminar</Button>
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalItems={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
